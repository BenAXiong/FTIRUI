import { getCsrfToken } from '../lib/csrf.js';

async function parseJsonResponse(resp) {
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(text || `HTTP ${resp.status}`);
  }
}

function authenticationError(action) {
  return new Error(`You must be signed in to ${action}.`);
}

export async function saveSessionRequest({ title, state }) {
  const resp = await fetch('/api/session/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken() || ''
    },
    credentials: 'same-origin',
    body: JSON.stringify({ title: title || '', state })
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      throw authenticationError('save sessions');
    }
    const data = await parseJsonResponse(resp);
    if (resp.status === 413 && data?.error) {
      throw new Error(data.error);
    }
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function listSessionsRequest() {
  const resp = await fetch('/api/session/list/', { credentials: 'same-origin' });
  if (!resp.ok) {
    if (resp.status === 401) {
      return { items: [], requiresAuth: true };
    }
    const data = await parseJsonResponse(resp);
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function getSessionRequest(sessionId) {
  const resp = await fetch(`/api/session/${sessionId}/`, { credentials: 'same-origin' });
  if (!resp.ok) {
    if (resp.status === 401) {
      throw authenticationError('load sessions');
    }
    const data = await parseJsonResponse(resp);
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function deleteSessionRequest(sessionId) {
  const resp = await fetch(`/api/session/${sessionId}/`, {
    method: 'DELETE',
    headers: { 'X-CSRFToken': getCsrfToken() || '' },
    credentials: 'same-origin'
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      throw authenticationError('delete sessions');
    }
    const data = await parseJsonResponse(resp);
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
}
