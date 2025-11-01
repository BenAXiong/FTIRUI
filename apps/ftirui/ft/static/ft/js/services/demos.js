const DEFAULT_LIMIT = 6;

export async function fetchDemoFileList(limit = DEFAULT_LIMIT) {
  try {
    const resp = await fetch('/api/demos/', { credentials: 'same-origin' });
    if (!resp.ok) {
      console.warn('fetchDemoFileList: request failed', resp.status, resp.statusText);
      return [];
    }
    const payload = await resp.json().catch(() => ({}));
    const files = Array.isArray(payload.files) ? payload.files : [];
    return files.slice(0, limit);
  } catch (err) {
    console.warn('fetchDemoFileList: fetch error', err);
    return [];
  }
}

async function fetchDemoBlob(url) {
  const resp = await fetch(url, { credentials: 'same-origin' });
  if (!resp.ok) {
    throw new Error(`Failed to fetch demo file ${url}: ${resp.status}`);
  }
  const blob = await resp.blob();
  const name = url.split('/').pop() || 'demo.dat';
  if (typeof File === 'function') {
    return new File(
      [blob],
      name,
      { type: blob.type || resp.headers.get('Content-Type') || 'application/octet-stream' }
    );
  }
  return Object.assign(blob, { name });
}

export async function fetchDemoFiles(limit = DEFAULT_LIMIT) {
  const urls = await fetchDemoFileList(limit);
  if (!urls.length) return [];

  const files = [];
  for (const url of urls) {
    try {
      const file = await fetchDemoBlob(url);
      files.push(file);
    } catch (err) {
      console.warn('fetchDemoFiles: failed to fetch', url, err);
    }
  }
  return files;
}
