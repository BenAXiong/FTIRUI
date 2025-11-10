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

export async function createProject(sectionId, payload) {
  return request(`/api/dashboard/sections/${sectionId}/projects/`, { method: 'POST', body: payload });
}

export async function createBoard(projectId, payload) {
  return request(`/api/dashboard/projects/${projectId}/boards/`, { method: 'POST', body: payload });
}

export async function fetchBoardState(boardId) {
  return request(`/api/dashboard/boards/${boardId}/state/`);
}

export async function saveBoardState(boardId, payload) {
  return request(`/api/dashboard/boards/${boardId}/state/`, { method: 'PUT', body: payload });
}

export async function listBoardVersions(boardId) {
  return request(`/api/dashboard/boards/${boardId}/versions/`);
}

export async function createBoardVersion(boardId, payload) {
  return request(`/api/dashboard/boards/${boardId}/versions/`, { method: 'POST', body: payload });
}

export async function fetchBoardVersion(boardId, versionId) {
  return request(`/api/dashboard/boards/${boardId}/versions/${versionId}/`);
}
