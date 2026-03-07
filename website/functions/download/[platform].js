/**
 * Cloudflare Pages Function — GitHub Release Download Proxy
 *
 * Streams GitHub Release assets through Cloudflare's edge network,
 * making downloads accessible for users in regions with poor GitHub connectivity.
 *
 * Routes:
 *   /download/macos     → latest macOS ARM (Apple Silicon) DMG
 *   /download/macos-x64 → latest macOS Intel DMG
 *   /download/windows   → latest Windows x64 installer
 */

const REPO = 'shiqkuangsan/Recopy';
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const PLATFORM_MAP = {
  'macos':     '_aarch64.dmg',
  'macos-arm': '_aarch64.dmg',
  'macos-x64': '_x64.dmg',
  'windows':   '_x64-setup.exe',
};

export async function onRequest(context) {
  const platform = context.params.platform;
  const suffix = PLATFORM_MAP[platform];

  if (!suffix) {
    return new Response(
      JSON.stringify({
        error: 'Invalid platform',
        valid: ['macos', 'macos-x64', 'windows'],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Fetch latest release metadata from GitHub API
    // cf.cacheTtl caches the response at Cloudflare's edge for 5 minutes
    const releaseRes = await fetch(GITHUB_API, {
      headers: {
        'User-Agent': 'Recopy-Download-Proxy/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
      cf: { cacheTtl: 300 },
    });

    if (!releaseRes.ok) {
      return Response.redirect(
        `https://github.com/${REPO}/releases/latest`,
        302
      );
    }

    const release = await releaseRes.json();
    const asset = release.assets.find((a) => a.name.endsWith(suffix));

    if (!asset) {
      return Response.redirect(
        `https://github.com/${REPO}/releases/latest`,
        302
      );
    }

    // Stream the file through Cloudflare's edge network
    // cf.cacheTtl caches the binary at edge for 24 hours
    const fileRes = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': 'Recopy-Download-Proxy/1.0' },
      cf: { cacheTtl: 86400 },
    });

    if (!fileRes.ok) {
      return Response.redirect(asset.browser_download_url, 302);
    }

    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });

    const contentLength = fileRes.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(fileRes.body, { headers });
  } catch {
    return Response.redirect(
      `https://github.com/${REPO}/releases/latest`,
      302
    );
  }
}
