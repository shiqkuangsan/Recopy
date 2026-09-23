"""Prepare a disposable managed worktree, never launch against normal app data.
Usage: python3 scripts/native-performance/prepare.py /absolute/disposable/worktree [--images]
Build inside that worktree: pnpm tauri build --no-bundle (add --debug if desired).
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import uuid

sys.dont_write_bytecode = True

if not __debug__:
    raise RuntimeError('Run without -O: isolation assertions must remain enabled')

assert sys.platform == 'darwin', 'This fixture currently supports macOS only'
with_images = '--images' in sys.argv
source = pathlib.Path(__file__).resolve().parents[2]
work = pathlib.Path(sys.argv[1]).resolve()
assert work != source and (work / '.git').is_file(), 'Require a separate managed git worktree'
assert subprocess.check_output(['git', 'status', '--porcelain'], cwd=work, text=True) == '', 'Worktree must be clean'
for directory in ['src', 'src-tauri/src', 'src-tauri/migrations']:
    shutil.copytree(source / directory, work / directory, dirs_exist_ok=True)
(work / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
identifier = 'com.recopy.perf.' + uuid.uuid4().hex
config = json.loads((work / 'src-tauri/tauri.conf.json').read_text())
config['identifier'] = identifier
config['productName'] = 'Recopy Performance Fixture'
(work / 'src-tauri/tauri.conf.json').write_text(json.dumps(config, indent=2))
if with_images:
    from images import write_png
    fixtures = work / 'native-fixtures'
    fixtures.mkdir()
    for index, (width, height) in enumerate([(1600, 1000), (6000, 4000), (400, 12000)]):
        write_png(fixtures / f'image-{index}.png', width, height)
p = work / 'src-tauri/src/lib.rs'
s = p.read_text().replace('.plugin(tauri_plugin_clipboard_x::init())', '')
s = s.replace('setup_global_shortcut(app.handle())?;', '// Isolated measurement: no global shortcut.')
s = s.replace('start_clipboard_monitor(app_handle_ret);', '// Isolated measurement: no clipboard capture.')
s = s.replace('setup_tray(app)?;', '// Isolated measurement: no tray.')
for command in ['paste_clipboard_item', 'paste_as_plain_text', 'copy_text_to_clipboard', 'register_shortcut', 'unregister_shortcut', 'set_setting', 'open_settings_window', 'open_url', 'set_tray_visible']:
    s = s.replace(f"            clip_cmd::{command},", "")
    assert f"clip_cmd::{command}," not in s, f"Isolation patch failed: {command}"
s = s.replace('            // Windows autostart self-healing:', '''            tauri::async_runtime::block_on(async {
                let db = app.state::<db::DbPool>();
                let count: i64 = sqlx::query_scalar("SELECT count(*) FROM clipboard_items").fetch_one(&db.0).await.unwrap();
                if count == 0 {
                    let text = "recopy 中文搜索 clipboard performance token ".repeat(16);
                    let mut tx = db.0.begin().await.unwrap();
                    for i in 0..10000 {
                        sqlx::query("INSERT INTO clipboard_items(id, content_type, plain_text, content_size, content_hash, note_title, is_favorited) VALUES (?, 'plain_text', ?, ?, ?, ?, ?)")
                            .bind(format!("fixture-{i:05}")).bind(&text).bind(text.len() as i64).bind(format!("hash-{i}"))
                            .bind(if i % 10 == 0 { "中文备注" } else { "" }).bind(i % 10 == 0).execute(&mut *tx).await.unwrap();
                    }
                    tx.commit().await.unwrap();
                }
                for (key, value) in [("update_check_interval", "never"), ("close_on_blur", "false"), ("auto_start", "false")] {
                    db::queries::set_setting(&db.0, key, value).await.unwrap();
                    app.state::<db::SettingsCache>().set(key.to_string(), value.to_string());
                }
            });
            // Windows autostart self-healing:''')
if with_images:
    fixture_root = json.dumps(str(work / 'native-fixtures'))
    seed_images = """
                let image_dir = app.path().app_data_dir().unwrap().join("images").join("fixture");
                std::fs::create_dir_all(&image_dir).unwrap();
                for i in 0..3 {
                    let id = format!("fixture-image-{i}");
                    let exists: i64 = sqlx::query_scalar("SELECT count(*) FROM clipboard_items WHERE id = ?").bind(&id).fetch_one(&db.0).await.unwrap();
                    if exists != 0 { continue; }
                    let bytes = std::fs::read(std::path::Path::new(FIXTURE_ROOT).join(format!("image-{i}.png"))).unwrap();
                    let thumb = clipboard::generate_thumbnail(&bytes).unwrap();
                    let path = image_dir.join(format!("image-{i}.png"));
                    std::fs::write(&path, &bytes).unwrap();
                    sqlx::query("INSERT INTO clipboard_items(id,content_type,plain_text,content_hash,content_size,thumbnail,image_path) VALUES (?,'image','',?,?,?,?)")
                        .bind(&id).bind(&id).bind(bytes.len() as i64).bind(thumb).bind(path.to_string_lossy().as_ref()).execute(&db.0).await.unwrap();
                }
""".replace('FIXTURE_ROOT', fixture_root)
    s = s.replace('                for (key, value) in [', seed_images + '                for (key, value) in [')
s = s.replace('pub fn run() {', 'pub fn run() {\n    NATIVE_PERF_START.set(std::time::Instant::now()).unwrap();')
s = s.replace('.invoke_handler(tauri::generate_handler![', '.invoke_handler(tauri::generate_handler![native_perf_show, native_perf_record,')
s += '''
static NATIVE_PERF_START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
#[tauri::command]
fn native_perf_show(app: tauri::AppHandle) { show_main_window(&app); }
#[tauri::command]
fn native_perf_record(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    assert!(app.config().identifier.starts_with("com.recopy.perf."));
    let phase = payload["phase"].as_str().ok_or("Missing phase")?;
    let name = match phase { "ready" => "ready.json", "complete" => "complete.json", _ => "error.json" };
    let result = serde_json::json!({"elapsed_from_rust_run_ms": NATIVE_PERF_START.get().unwrap().elapsed().as_secs_f64()*1000.0, "payload": payload});
    std::fs::write(app.path().app_data_dir().map_err(|e| e.to_string())?.join(name), result.to_string()).map_err(|e| e.to_string())
}
'''
# Fail closed if upstream changes prevent an isolation patch.
assert 'setup_global_shortcut(app.handle())?;' not in s
assert 'start_clipboard_monitor(app_handle_ret);' not in s
assert '.plugin(tauri_plugin_clipboard_x::init())' not in s
assert 'generate_handler![native_perf_show' in s
p.write_text(s)
shutil.copyfile(source / 'scripts/native-performance/runner.ts', work / 'src/native-perf.ts')
p = work / 'src/main.tsx'
p.write_text(p.read_text() + '\nimport "./native-perf";\n')
digest = hashlib.sha256()
for directory in ['src', 'src-tauri/src', 'src-tauri/migrations']:
    for file in sorted((source / directory).rglob('*')):
        if file.is_file():
            digest.update(str(file.relative_to(source)).encode())
            digest.update(file.read_bytes())
manifest = {'source_snapshot_sha256': digest.hexdigest(), 'frontend_readiness_gate_ms': 100, 'identifier': identifier, 'worktree': str(work), 'source_head': subprocess.check_output(['git','rev-parse','HEAD'], cwd=source, text=True).strip(), 'profile': 'debug Rust + Vite production', 'image_fixtures': with_images, 'rows': 10000, 'body_bytes': 768, 'disabled': ['clipboard plugin and monitor', 'global shortcut registration', 'tray', 'automatic update checks']}
(work / 'native-performance.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2))
