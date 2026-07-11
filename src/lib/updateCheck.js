// Update notifications. Full silent auto-update needs code-signed builds
// (macOS refuses unsigned updates), so we check GitHub Releases and let the
// user download the new installer themselves.
const RELEASES_API = 'https://api.github.com/repos/Pashyndr1k/storyreel/releases/latest';
const RELEASES_PAGE = 'https://github.com/Pashyndr1k/storyreel/releases';

export function isNewerVersion(remote, local) {
  const parse = (v) =>
    String(v || '')
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [a, b, c] = parse(remote);
  const [x, y, z] = parse(local);
  if (a !== x) return a > x;
  if (b !== y) return b > y;
  return c > z;
}

export async function checkForUpdate(currentVersion) {
  try {
    const res = await fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const tag = data.tag_name || '';
    if (tag && isNewerVersion(tag, currentVersion)) {
      return { version: tag, url: data.html_url || RELEASES_PAGE };
    }
  } catch {
    /* offline or rate-limited — stay quiet */
  }
  return null;
}
