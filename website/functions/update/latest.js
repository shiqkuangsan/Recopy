/**
 * Cloudflare Pages Function — Tauri Updater Manifest Proxy
 *
 * Proxies the Tauri `latest.json` from GitHub Releases through Cloudflare's
 * edge network, rewriting asset URLs to also go through CF proxy.
 *
 * Route: /update/latest
 */

const REPO = 'shiqkuangsan/Recopy';
const GITHUB_LATEST_JSON = `https://github.com/${REPO}/releases/latest/download/latest.json`;
const GITHUB_DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export async function onRequest(context) {
  try {
    const res = await fetch(GITHUB_LATEST_JSON, {
      headers: { 'User-Agent': 'Recopy-Update-Proxy/1.0' },
      cf: { cacheTtl: 300 },
    });

    if (!res.ok) {
      // Fallback: redirect to GitHub directly
      return Response.redirect(GITHUB_LATEST_JSON, 302);
    }

    const manifest = await res.json();

    // Rewrite platform asset URLs to go through CF proxy
    // Hardcode production origin to avoid preview deployments polluting cached responses
    const origin = 'https://recopy.pages.dev';
    if (manifest.platforms) {
      for (const platform of Object.values(manifest.platforms)) {
        if (platform.url && platform.url.startsWith(GITHUB_DOWNLOAD_PREFIX)) {
          const relativePath = platform.url.slice(GITHUB_DOWNLOAD_PREFIX.length);
          platform.url = `${origin}/update/asset/${relativePath}`;
        }
      }
    }

    return new Response(JSON.stringify(manifest), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return Response.redirect(GITHUB_LATEST_JSON, 302);
  }
}
