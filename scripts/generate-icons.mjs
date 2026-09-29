import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'recopy-icons-'));
const image = (name) => readFileSync(path.join(root, 'assets/branding', name)).toString('base64');
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const render = (source, output, sizes = []) => {
  execFileSync(process.execPath, [cli, 'icon', source, '--output', output,
    ...sizes.flatMap((size) => ['--png', String(size)])], { cwd: root, stdio: 'inherit' });
};
const copy = (source, target) => {
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
};

try {
  // The SVG packages the approved raster artwork, with a deterministic clean tile edge.
  // It is intentionally not advertised as a traced vector version of the R.
  const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1254 1254">
  <title>Recopy</title>
  <defs><clipPath id="tile"><rect x="134" y="134" width="986" height="986" rx="238"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect x="134" y="134" width="986" height="986" fill="#fff"/>
    <image width="1254" height="1254" href="data:image/png;base64,${image('app-icon.png')}"/>
  </g>
</svg>\n`;
  const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1254 1254">
  <defs><filter id="black" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter></defs>
  <image width="1254" height="1254" filter="url(#black)" href="data:image/png;base64,${image('tray-template.png')}"/>
</svg>\n`;
  const app = path.join(root, 'assets/icon.svg');
  const tray = path.join(scratch, 'tray.svg');
  writeFileSync(app, appSvg);
  writeFileSync(tray, traySvg);
  const custom = path.join(scratch, 'custom');
  render(app, custom, [32, 64, 128, 180, 256, 512, 1024]);
  copy(path.join(custom, '1024x1024.png'), path.join(root, 'assets/icon-1024.png'));
  render(app, path.join(root, 'src-tauri/icons'));
  render(tray, path.join(scratch, 'tray'), [44]);
  copy(path.join(scratch, 'tray/44x44.png'), path.join(root, 'src-tauri/icons/tray-icon.png'));
  copy(path.join(custom, '32x32.png'), path.join(root, 'src-tauri/icons/tray-icon-win.png'));
  copy(path.join(custom, '64x64.png'), path.join(root, 'website/images/icon-32.png'));
  copy(path.join(custom, '256x256.png'), path.join(root, 'website/images/recopy-logo.png'));
  copy(path.join(custom, '180x180.png'), path.join(root, 'website/apple-touch-icon.png'));
  copy(path.join(root, 'src-tauri/icons/icon.ico'), path.join(root, 'website/favicon.ico'));
  copy(path.join(custom, '128x128.png'), path.join(root, 'src/assets/recopy-logo.png'));
  console.log('Generated native, tray, website and frontend brand assets.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
