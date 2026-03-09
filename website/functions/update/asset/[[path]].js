/**
 * Cloudflare Pages Function — Tauri Update Asset Proxy
 *
 * Streams signed update packages (.app.tar.gz, .nsis.zip) from GitHub Releases
 * through Cloudflare's edge network.
 *
 * Route: /update/asset/:tag/:filename
 *   e.g. /update/asset/v1.2.0/Recopy_1.2.0_aarch64.app.tar.gz
 */

const REPO = 'shiqkuangsan/Recopy';
const GITHUB_DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export async function onRequest(context) {
  // [[path]] captures remaining segments as an array, e.g. ["v1.2.0", "filename.tar.gz"]
  const pathSegments = context.params.path;

  if (!pathSegments || pathSegments.length < 2) {
    return new Response(
      JSON.stringify({ error: 'Invalid path, expected /update/asset/:tag/:filename' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const relativePath = pathSegments.join('/');
  const githubUrl = `${GITHUB_DOWNLOAD_PREFIX}${relativePath}`;

  try {
    const fileRes = await fetch(githubUrl, {
      headers: { 'User-Agent': 'Recopy-Update-Proxy/1.0' },
      cf: { cacheTtl: 86400 },
    });

    if (!fileRes.ok) {
      // Fallback: redirect to GitHub directly
      return Response.redirect(githubUrl, 302);
    }

    const filename = pathSegments[pathSegments.length - 1];
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });

    const contentLength = fileRes.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(fileRes.body, { headers });
  } catch {
    return Response.redirect(githubUrl, 302);
  }
}
