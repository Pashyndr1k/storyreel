// ComfyUI requests executed in the Electron main process, where no browser
// CORS/Origin machinery applies — the local ComfyUI server rejects renderer
// requests that carry a foreign Origin header (HTTP 403). Kept free of
// electron imports so it can be exercised directly under plain Node.
async function comfyRequest({ url, method = 'GET', json = null, upload = null }) {
  let body;
  const headers = {};
  if (upload) {
    const fd = new FormData();
    fd.append(
      'image',
      new Blob([Buffer.from(upload.base64, 'base64')], { type: upload.mime || 'image/png' }),
      upload.filename
    );
    fd.append('overwrite', 'true');
    body = fd;
  } else if (json != null) {
    body = JSON.stringify(json);
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(url, { method, headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    base64: buf.toString('base64'),
  };
}

module.exports = { comfyRequest };
