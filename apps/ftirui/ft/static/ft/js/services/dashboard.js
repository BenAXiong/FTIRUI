import { getCsrfToken } from '../lib/csrf.js';

async function request(url, { method = 'GET', body, expectJson = true } = {}) {
  const headers = new Headers();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json');
    headers.set('X-CSRFToken', getCsrfToken() || '');
  }

  const resp = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error || parsed?.message || text;
      if (expectJson) return Promise.reject(new Error(detail || `HTTP ${resp.status}`));
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  if (!expectJson) return null;
  return resp.json();
}

export async function fetchSections({ include = false } = {}) {
  const query = include ? '?include=full' : '';
  return request(`/api/dashboard/sections/${query}`);
}

export async function createSection(payload) {
  return request('/api/dashboard/sections/', { method: 'POST', body: payload });
}

export async function updateSection(sectionId, payload) {
  return request(`/api/dashboard/sections/${sectionId}/`, { method: 'PATCH', body: payload });
}

export async function deleteSection(sectionId) {
  return request(`/api/dashboard/sections/${sectionId}/`, {
    method: 'DELETE',
    expectJson: false
  });
}

export async function createProject(sectionId, payload) {
  return request(`/api/dashboard/sections/${sectionId}/projects/`, { method: 'POST', body: payload });
}

export async function updateProject(projectId, payload) {
  return request(`/api/dashboard/projects/${projectId}/`, { method: 'PATCH', body: payload });
}

export async function deleteProject(projectId) {
  return request(`/api/dashboard/projects/${projectId}/`, {
    method: 'DELETE',
    expectJson: false
  });
}

export async function createCanvas(projectId, payload) {
  return request(`/api/dashboard/projects/${projectId}/canvases/`, { method: 'POST', body: payload });
}

export async function updateCanvas(canvasId, payload) {
  return request(`/api/dashboard/canvases/${canvasId}/`, { method: 'PATCH', body: payload });
}

export async function deleteCanvas(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/`, { method: 'DELETE', expectJson: false });
}

export async function fetchCanvasState(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/state/`);
}

export async function saveCanvasState(canvasId, payload) {
  return request(`/api/dashboard/canvases/${canvasId}/state/`, { method: 'PUT', body: payload });
}

export async function saveCanvasThumbnail(canvasId, payload, { keepalive = false } = {}) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('X-CSRFToken', getCsrfToken() || '');

  const resp = await fetch(`/api/dashboard/canvases/${canvasId}/thumbnail/`, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: payload ? JSON.stringify(payload) : undefined,
    keepalive: !!keepalive
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error || parsed?.message || text;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  return resp.json();
}

export async function listCanvasVersions(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/versions/`);
}

export async function createCanvasVersion(canvasId, payload) {
  return request(`/api/dashboard/canvases/${canvasId}/versions/`, { method: 'POST', body: payload });
}

export async function fetchCanvasVersion(canvasId, versionId) {
  return request(`/api/dashboard/canvases/${canvasId}/versions/${versionId}/`);
}
