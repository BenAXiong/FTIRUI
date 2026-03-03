const LOGIN_PROVIDER_STORAGE_KEY = 'ftir:pending-login-provider';
const CANVAS_OPEN_SOURCE_STORAGE_KEY = 'ftir:pending-canvas-open-source';

const state = {
  enabled: false,
  initialized: false,
  identifiedUserId: null
};

const safeSessionStorage = {
  get(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  delete(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
};

function getBodyDataset() {
  if (typeof document === 'undefined' || !document.body) return {};
  return document.body.dataset || {};
}

function getPosthogClient() {
  if (typeof window === 'undefined') return null;
  const client = window.posthog;
  if (!client) return null;
  if (
    typeof client.capture !== 'function' ||
    typeof client.identify !== 'function' ||
    typeof client.reset !== 'function'
  ) {
    return null;
  }
  return client;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pruneProperties(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function inferRouteName(dataset = getBodyDataset()) {
  if (typeof window === 'undefined') return 'unknown';
  const path = window.location.pathname || '/';
  if (path === '/' && dataset.workspacePage !== 'true') return 'dashboard';
  if (path.startsWith('/plans/checkout')) return 'checkout';
  if (path.startsWith('/plans')) return 'plans';
  if (path.startsWith('/accounts/login')) return 'login';
  if (path.startsWith('/accounts/signup')) return 'signup';
  if (dataset.workspacePage === 'true') return 'workspace';
  if (dataset.requestedCanvasId || dataset.activeCanvasId) return 'canvas';
  return path.replace(/\/+$/, '') || '/';
}

function inferWorkspaceMode(dataset = getBodyDataset()) {
  if (dataset.workspacePage === 'true') return 'standalone';
  if (dataset.workspaceTabEnabled === 'true') return 'tabbed';
  return 'dashboard';
}

export function getAnalyticsConfig(dataset = getBodyDataset()) {
  const apiKey = trimString(dataset.posthogPublicKey);
  const host = trimString(dataset.posthogHost) || 'https://us.i.posthog.com';
  const enabled = dataset.posthogEnabled === 'true' && !!apiKey;
  return { apiKey, host, enabled };
}

export function isAnalyticsEnabled() {
  return state.enabled;
}

export function initAnalytics(config = getAnalyticsConfig()) {
  if (state.initialized) return state.enabled;
  state.initialized = true;
  state.enabled = !!config.enabled && !!getPosthogClient();
  if (!state.enabled) return false;
  return true;
}

export function getBaseEventProperties(overrides = {}) {
  const dataset = getBodyDataset();
  return pruneProperties({
    path: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '',
    route_name: inferRouteName(dataset),
    auth_state: dataset.userAuthenticated === 'true' ? 'authenticated' : 'guest',
    workspace_mode: inferWorkspaceMode(dataset),
    workspace_plan: trimString(dataset.workspacePlan || 'free').toLowerCase(),
    billing_status: trimString(dataset.workspaceBillingStatus || 'inactive').toLowerCase(),
    canvas_id: trimString(dataset.activeCanvasId || dataset.requestedCanvasId),
    project_id: trimString(dataset.activeProjectId),
    section_id: trimString(dataset.activeSectionId),
    dashboard_enabled: dataset.dashboardV2 !== 'false',
    workspace_tab_enabled: dataset.workspaceTabEnabled === 'true',
    render_host:
      typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com')
        ? window.location.hostname
        : '',
    ...overrides
  });
}

export function captureEvent(name, properties = {}, options = {}) {
  const client = getPosthogClient();
  if (!state.enabled || !client) return false;
  const payload = options.includeBaseProperties === false
    ? pruneProperties(properties)
    : getBaseEventProperties(properties);
  client.capture(name, payload);
  return true;
}

export function identifyAuthenticatedUser({ userId, workspacePlan = '', billingStatus = '' } = {}) {
  const normalizedUserId = trimString(userId);
  const client = getPosthogClient();
  if (!state.enabled || !client || !normalizedUserId) return false;
  if (state.identifiedUserId === normalizedUserId) return true;
  client.identify(normalizedUserId, pruneProperties({
    workspace_plan: trimString(workspacePlan).toLowerCase(),
    billing_status: trimString(billingStatus).toLowerCase()
  }));
  state.identifiedUserId = normalizedUserId;
  return true;
}

export function resetAnalyticsIdentity() {
  const client = getPosthogClient();
  if (!state.enabled || !client) return false;
  state.identifiedUserId = null;
  client.reset();
  return true;
}

export function stashPendingLoginProvider(provider) {
  const normalized = trimString(provider).toLowerCase();
  if (!normalized) return;
  safeSessionStorage.set(LOGIN_PROVIDER_STORAGE_KEY, normalized);
}

export function consumePendingLoginProvider() {
  const value = trimString(safeSessionStorage.get(LOGIN_PROVIDER_STORAGE_KEY)).toLowerCase();
  safeSessionStorage.delete(LOGIN_PROVIDER_STORAGE_KEY);
  return value || '';
}

export function stashPendingCanvasOpenSource(source) {
  const normalized = trimString(source).toLowerCase();
  if (!normalized) return;
  safeSessionStorage.set(CANVAS_OPEN_SOURCE_STORAGE_KEY, normalized);
}

export function consumePendingCanvasOpenSource() {
  const value = trimString(safeSessionStorage.get(CANVAS_OPEN_SOURCE_STORAGE_KEY)).toLowerCase();
  safeSessionStorage.delete(CANVAS_OPEN_SOURCE_STORAGE_KEY);
  return value || '';
}

export function detectFileType(filename = '') {
  const lower = trimString(filename).toLowerCase();
  if (!lower.includes('.')) return 'unknown';
  const extension = lower.split('.').pop();
  if (['csv'].includes(extension)) return 'csv';
  if (['tsv'].includes(extension)) return 'tsv';
  if (['txt', 'dat'].includes(extension)) return 'txt';
  if (['jdx', 'dx', 'jcamp'].includes(extension)) return 'jcamp';
  if (['xlsx', 'xls'].includes(extension)) return 'xlsx';
  if (['feather'].includes(extension)) return 'feather';
  return 'unknown';
}

export function toImportCountBucket(count) {
  const value = Number(count) || 1;
  if (value <= 1) return '1';
  if (value <= 5) return '2_5';
  if (value <= 10) return '6_10';
  return '11_plus';
}

export function toStateSizeBucket(state) {
  let length = 0;
  try {
    length = JSON.stringify(state || {}).length;
  } catch {
    length = 0;
  }
  if (length < 5_000) return 'xs';
  if (length < 25_000) return 'sm';
  if (length < 100_000) return 'md';
  return 'lg';
}

export function toTraceCountBucket(state) {
  const count = Object.keys(state?.traces || {}).length;
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 10) return '6_10';
  return '11_plus';
}
