import { getCsrfToken } from '../lib/csrf.js';

function buildUploadFormData(file, inputUnits, extraFields = {}) {
  const fd = new FormData();
  fd.append('file', file, file?.name || file?.filename || 'upload.dat');
  fd.append('input_units', inputUnits);
  Object.entries(extraFields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    fd.append(key, value);
  });
  return fd;
}

export async function uploadTraceFile(file, inputUnits, extraFields) {
  const body = buildUploadFormData(file, inputUnits, extraFields);
  const headers = new Headers();
  headers.append('X-CSRFToken', getCsrfToken() || '');

  let resp;
  try {
    resp = await fetch('/api/xy/', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body
    });
  } catch (err) {
    console.error('uploadTraceFile: fetch failed', err);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status} ${resp.statusText}\n${text.slice(0, 400)}`);
  }

  return resp.json();
}
