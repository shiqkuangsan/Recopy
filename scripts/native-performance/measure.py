"""Launch only the prepared fixture binary; sample its PID, never the user's app."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time

if not __debug__:
    raise RuntimeError('Run without -O: isolation assertions must remain enabled')

assert sys.platform == 'darwin', 'This sampler currently supports macOS only'
work = pathlib.Path(sys.argv[1]).resolve()
manifest = json.loads((work / 'native-performance.json').read_text())
config = json.loads((work / 'src-tauri/tauri.conf.json').read_text())
identifier = manifest['identifier']
assert re.fullmatch(r'com\.recopy\.perf\.[0-9a-f]{32}', identifier)
assert config['identifier'] == identifier and manifest['worktree'] == str(work)
profile = 'release' if '--release' in sys.argv else 'debug'
manifest['profile'] = profile + ' Rust + Vite production'
binary = work / ('src-tauri/target/' + profile + '/recopy')
assert binary.is_file(), 'Build the prepared fixture first'
inputs = list((work / 'src-tauri/src').rglob('*.rs')) + list((work / 'src').rglob('*.ts')) + list((work / 'src').rglob('*.tsx')) + [work / 'src-tauri/tauri.conf.json']
assert binary.stat().st_mtime >= max(p.stat().st_mtime for p in inputs), 'Rebuild after isolation/source changes'
manifest['binary_sha256'] = hashlib.sha256(binary.read_bytes()).hexdigest()
data = pathlib.Path.home() / 'Library/Application Support' / identifier
initial_database_exists = (data / 'recopy.db').exists()
runs = []
for index in range(3):
    for name in ['ready.json', 'complete.json', 'error.json']:
        (data / name).unlink(missing_ok=True)
    with (work / f'native-run-{index}.log').open('w') as log:
        start = time.monotonic()
        process = subprocess.Popen([str(binary)], cwd=work, stdout=log, stderr=subprocess.STDOUT)
        samples = []
        ready = None
        final = None
        try:
            while time.monotonic() - start < 90 and process.poll() is None:
                sample = subprocess.run(['ps', '-p', str(process.pid), '-o', 'rss=', '-o', '%cpu='], capture_output=True, text=True)
                if sample.returncode == 0 and sample.stdout.strip():
                    rss, cpu = map(float, sample.stdout.split())
                    # Attribute only through a current parent-child chain; never all system WebKit PIDs.
                    inventory = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss=,comm='], text=True)
                    parsed = [line.split(None, 3) for line in inventory.splitlines()]
                    parsed = [row for row in parsed if len(row) == 4]
                    family = {process.pid}
                    while True:
                        expanded = family | {int(row[0]) for row in parsed if int(row[1]) in family}
                        if expanded == family: break
                        family = expanded
                    webkit = [{'pid':int(row[0]), 'rss_kib':int(row[2])} for row in parsed if int(row[0]) in family and 'WebKit' in row[3]]
                    samples.append({'elapsed_s': time.monotonic()-start, 'main_rss_kib': rss, 'main_ps_cpu_percent': cpu,
                        'confirmed_child_webkit':webkit, 'unattributed_system_webkit_count':sum('WebKit' in row[3] and int(row[0]) not in family for row in parsed), 'webkit_attribution_complete':False})
                for name in ['ready', 'complete', 'error']:
                    path = data / (name + '.json')
                    if path.exists():
                        try:
                            value = json.loads(path.read_text())
                        except json.JSONDecodeError:
                            continue
                        if name == 'ready':
                            if ready is None:
                                ready = value
                                ready['launch_to_ready_observed_ms'] = (time.monotonic()-start)*1000
                        else:
                            final = value
                if final is not None:
                    break
                time.sleep(.1)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        runs.append({'index': index, 'includes_initial_seed': index == 0 and not initial_database_exists, 'ready': ready, 'final': final, 'main_process_samples': samples})
        (work / ('native-results-' + profile + '.json')).write_text(json.dumps({'manifest': manifest, 'runs': runs}, indent=2))
        if final is None or final['payload']['phase'] != 'complete':
            raise RuntimeError(f'Fixture failed: inspect native-run-{index}.log and native-results-{profile}.json')
        time.sleep(1)
print(str(work / ('native-results-' + profile + '.json')))
