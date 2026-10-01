// HTTPS requests executed in the Electron main process for cloud APIs that
// send no CORS headers, so a renderer fetch cannot read them (Kling).
// Kept free of electron imports so it can be exercised under plain Node.
//
// Safety: authenticated / JSON calls are limited to an allowlist of API
// hosts; a plain GET (downloading a finished result file) may go to any
// https URL, without credentials.
const API_HOSTS = [/(^|\.)klingai\.com$/i, /(^|\.)kling\.ai$/i];

async function netRequest({ url, method = 'GET', headers = {}, json = null, binary = false } = {}) {
  const u = new URL(String(url));
  if (u.protocol !== 'https:') throw new Error('Only https requests are allowed.');
  const isApi = API_HOSTS.some((re) => re.test(u.hostname));
  const hasAuth = Object.keys(headers || {}).some((h) => /^authorization$/i.test(h));
  if (!isApi && (method !== 'GET' || json != null || hasAuth)) {
    throw new Error(`Host not allowed for API calls: ${u.hostname}`);
  }
  const res = await fetch(u.toString(), {
    method,
    headers: { ...(json != null ? { 'content-type': 'application/json' } : {}), ...(headers || {}) },
    body: json != null ? JSON.stringify(json) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    ...(binary ? { base64: buf.toString('base64') } : { text: buf.toString('utf8') }),
  };
}

module.exports = { netRequest };
