import { getCsrfToken } from '../lib/csrf.js';
import {
  captureEvent,
  toStateSizeBucket,
  toTraceCountBucket
} from './analytics.js';

export class DashboardApiError extends Error {
  constructor(message, { status = 0, data = null, url = '' } = {}) {
    super(message || 'Request failed');
    this.name = 'DashboardApiError';
    this.status = status;
    this.data = data;
    this.url = url;
  }
}

export function isWorkspaceQuotaError(error) {
  return error?.data?.code === 'workspace_limit_reached';
}

export function isCanvasQuotaLockedError(error) {
  return error?.data?.code === 'canvas_quota_locked';
}

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
    let parsed = null;
    try {
      parsed = JSON.parse(text);
      detail = parsed?.error || parsed?.message || text;
    } catch {
      /* ignore */
    }
    throw new DashboardApiError(detail || `HTTP ${resp.status}`, {
      status: resp.status,
      data: parsed,
      url,
    });
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

export async function createCanvas(projectId, payload, options = {}) {
  const response = await request(`/api/dashboard/projects/${projectId}/canvases/`, { method: 'POST', body: payload });
  captureEvent('canvas_created', {
    project_id: String(projectId),
    canvas_id: response?.id ? String(response.id) : '',
    source: options.analytics?.source || 'dashboard'
  });
  return response;
}

export async function updateCanvas(canvasId, payload) {
  return request(`/api/dashboard/canvases/${canvasId}/`, { method: 'PATCH', body: payload });
}

export async function fetchCanvasDetail(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/`);
}

export async function deleteCanvas(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/`, { method: 'DELETE', expectJson: false });
}

export async function fetchCanvasState(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/state/`);
}

export async function saveCanvasState(canvasId, payload, options = {}) {
  const response = await request(`/api/dashboard/canvases/${canvasId}/state/`, { method: 'PUT', body: payload });
  captureEvent('canvas_saved', {
    canvas_id: String(canvasId),
    save_mode: options.analytics?.saveMode || 'autosave',
    state_size_bucket: toStateSizeBucket(payload?.state),
    trace_count_bucket: toTraceCountBucket(payload?.state)
  });
  return response;
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
    let parsed = null;
    try {
      parsed = JSON.parse(text);
      detail = parsed?.error || parsed?.message || text;
    } catch {
      /* ignore */
    }
    throw new DashboardApiError(detail || `HTTP ${resp.status}`, {
      status: resp.status,
      data: parsed,
      url: `/api/dashboard/canvases/${canvasId}/thumbnail/`,
    });
  }

  return resp.json();
}

export async function listCanvasVersions(canvasId) {
  return request(`/api/dashboard/canvases/${canvasId}/versions/`);
}

export async function createCanvasVersion(canvasId, payload) {
  const response = await request(`/api/dashboard/canvases/${canvasId}/versions/`, { method: 'POST', body: payload });
  captureEvent('snapshot_created', {
    canvas_id: String(canvasId),
    has_thumbnail: Boolean(payload?.thumbnail_url)
  });
  return response;
}

export async function fetchCanvasVersion(canvasId, versionId) {
  return request(`/api/dashboard/canvases/${canvasId}/versions/${versionId}/`);
}
