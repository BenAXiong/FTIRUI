import { el } from './js/ui/utils/dom.js';
import { initDashboard } from './js/ui/dashboard/initDashboard.js';
import { mountWorkspace } from './js/ui/workspace/initControls.js';
import { updateCanvas } from './js/services/dashboard.js';
import { getWorkspaceTagColor } from './js/ui/utils/tagColors.js';

// Option A likely already initializes somewhere else.
// If not, you can do a similar instance for A later.

// pick saved theme or fallback to system
const saved = localStorage.getItem('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const start = saved || (systemDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-bs-theme', start);

const setTheme = (t) => {
    document.documentElement.setAttribute('data-bs-theme', t);
    localStorage.setItem('theme', t);
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) icon.textContent = t === 'dark' ? '🌙' : '☀️';
};

document.getElementById('themeToggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
    setTheme(cur === 'dark' ? 'light' : 'dark');
});

// sync icon on load
(function initIcon(){
    const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) icon.textContent = cur === 'dark' ? '🌙' : '☀️';
})();

function relocateThemeToggle() {
  const buttons = Array.from(document.querySelectorAll('#themeToggle'));
  if (!buttons.length) return;
  const target = document.querySelector('.workspace-hud-menu__list .dropdown-item-text');
  if (!target) return;
  const primary = buttons[0];
  primary.classList.add('workspace-hud-theme-btn');
  if (!target.contains(primary)) {
    target.appendChild(primary);
  }
  buttons.slice(1).forEach((btn) => btn.remove());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', relocateThemeToggle);
} else {
  relocateThemeToggle();
}


function initWorkspaceDevShortcut() {
  const body = document.body;
  if (!body || body.dataset.workspaceShortcut !== 'true') return;

  const toggleDevParam = () => {
    const url = new URL(window.location.href);
    const hasDev = url.searchParams.get('dev') === 'true';
    if (hasDev) {
      url.searchParams.delete('dev');
    } else {
      url.searchParams.set('dev', 'true');
    }
    window.location.assign(url.toString());
  };

  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.shiftKey) return;
    const key = event.key || '';
    if (key.toLowerCase() !== 'w') return;
    const target = event.target;
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    if (target?.isContentEditable) return;
    event.preventDefault();
    toggleDevParam();
  });
}

initWorkspaceDevShortcut();

const bodyDataset = typeof document !== 'undefined' ? document.body.dataset : {};
const isWorkspacePage = bodyDataset?.workspacePage === 'true';
const workspaceTabEnabled = bodyDataset?.workspaceTabEnabled === 'true';
const dashboardV2Enabled = bodyDataset?.dashboardV2Enabled !== 'false';

const toastContainer = document.getElementById('app_toasts');
const toastVariants = {
  success: 'text-bg-success',
  info: 'text-bg-info',
  warning: 'text-bg-warning',
  danger: 'text-bg-danger',
  primary: 'text-bg-primary'
};

function showAppToast({ title = '', message = '', variant = 'primary', delay = 4500 } = {}) {
  if (!toastContainer || typeof bootstrap === 'undefined') {
    if (title || message) console.info(title ? `${title}: ${message}` : message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${toastVariants[variant] || toastVariants.primary}`;
  toast.role = 'status';
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="toast-header">
      <strong class="me-auto">${title || 'Notice'}</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">${message || ''}</div>
  `;
  toastContainer.appendChild(toast);
  const toastObj = new bootstrap.Toast(toast, { delay, autohide: true });
  toast.addEventListener('hidden.bs.toast', () => toast.remove());
  toastObj.show();
}

window.showAppToast = showAppToast;
const AUTH_STORAGE_KEY = 'ftir:last-auth';

const userStatusCard = el('user_status');
let currentUserState = null;
const userSignInLink = el('user_sign_in');
const userSignOutLink = el('user_sign_out');
const userDropdownMenu = userStatusCard ? userStatusCard.querySelector('[data-user-dropdown]') : null;
const userDropdownName = userStatusCard ? userStatusCard.querySelector('[data-dropdown-name]') : null;
const userDropdownEmail = userStatusCard ? userStatusCard.querySelector('[data-dropdown-email]') : null;

userSignInLink?.addEventListener('click', () => {
  showAppToast({
    title: 'Signing in',
    message: 'Redirecting to login…',
    variant: 'info',
    delay: 2400
  });
});

userSignOutLink?.addEventListener('click', () => {
  showAppToast({
    title: 'Signing out',
    message: 'Redirecting to logout…',
    variant: 'info',
    delay: 2400
  });
});

function applyUserStatus(data) {
  if (!userStatusCard) return;
  userStatusCard.classList.remove('is-error');
  currentUserState = data;
  const nameEl = userStatusCard.querySelector('.user-primary');
  const secondaryEl = userStatusCard.querySelector('.user-secondary');
  const avatarEl = userStatusCard.querySelector('[data-user-avatar]') || userStatusCard.querySelector('.user-avatar');
  const signInBtn = el('user_sign_in');
  const signOutBtn = el('user_sign_out');

  if (data.authenticated) {
    if (nameEl) nameEl.textContent = data.username || 'Account';
    if (secondaryEl) {
      const sessionsLabel = typeof data.session_count === 'number' ? `${data.session_count} cloud sessions` : 'Signed in';
      secondaryEl.textContent = sessionsLabel;
    }
    if (signInBtn) {
      signInBtn.href = data.login_url || signInBtn.getAttribute('href') || '/accounts/login/';
      signInBtn.classList.add('d-none');
    }
    if (signOutBtn) {
      signOutBtn.href = data.logout_url || signOutBtn.getAttribute('href') || '/accounts/logout/';
      signOutBtn.classList.remove('d-none');
    }
    if (avatarEl) {
      if (data.avatar) {
        avatarEl.innerHTML = `<img src="${data.avatar}" alt="">`;
        avatarEl.classList.remove('placeholder');
      } else {
        avatarEl.innerHTML = '<i class="bi bi-person-circle"></i>';
        avatarEl.classList.add('placeholder');
      }
    }
    if (userDropdownMenu) {
      userDropdownMenu.classList.remove('d-none');
    }
    if (userDropdownName) {
      userDropdownName.textContent = data.username || 'Account';
    }
    if (userDropdownEmail) {
      userDropdownEmail.textContent = (data.email || '').trim() || (data.username || 'Signed in');
    }
    userStatusCard.dataset.authenticated = '1';
  } else {
    if (nameEl) nameEl.textContent = 'Guest';
    if (secondaryEl) secondaryEl.textContent = 'Not signed in';
    if (signInBtn) {
      signInBtn.href = data.login_url || signInBtn.getAttribute('href') || '/accounts/login/';
      signInBtn.classList.remove('d-none');
    }
    if (signOutBtn) {
      signOutBtn.href = data.logout_url || signOutBtn.getAttribute('href') || '/accounts/logout/';
      signOutBtn.classList.add('d-none');
    }
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="bi bi-person-circle"></i>';
      avatarEl.classList.add('placeholder');
    }
    if (userDropdownMenu) {
      userDropdownMenu.classList.add('d-none');
    }
    if (userDropdownName) {
      userDropdownName.textContent = 'Guest';
    }
    if (userDropdownEmail) {
      userDropdownEmail.textContent = 'Not signed in';
    }
    userStatusCard.dataset.authenticated = '0';
  }
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.userAuthenticated = data && data.authenticated ? 'true' : 'false';
  }
}

async function refreshUserStatus(options = {}) {
  if (!userStatusCard) return null;
  const previousState = currentUserState;
  try {
    const resp = await fetch('/api/me/', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    let storedAuth;
    try {
      storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    } catch (storageErr) {
      storedAuth = null;
    }

    const prevAuth =
      typeof previousState?.authenticated === 'boolean'
        ? previousState.authenticated
        : storedAuth !== null
          ? storedAuth === '1'
          : undefined;
    const newAuth = !!data.authenticated;

    applyUserStatus(data);

    if (prevAuth !== undefined && prevAuth !== newAuth) {
      if (newAuth) {
        showAppToast({
          title: 'Signed in',
          message: data.username ? `Welcome back, ${data.username}!` : 'Cloud features are now enabled.',
          variant: 'success'
        });
      } else {
        showAppToast({
          title: 'Signed out',
          message: 'Cloud features paused. Local autosave continues offline.',
          variant: 'info'
        });
      }
    }

    try {
      localStorage.setItem(AUTH_STORAGE_KEY, newAuth ? '1' : '0');
    } catch (storageErr) {
      console.warn('Unable to persist auth state indicator', storageErr);
    }

    document.dispatchEvent(new CustomEvent('ftir:user-status', { detail: { data, previous: previousState } }));
    return data;
  } catch (err) {
    console.warn('User status failed', err);
    userStatusCard.classList.add('is-error');
    const nameEl = userStatusCard.querySelector('.user-primary');
    const secondaryEl = userStatusCard.querySelector('.user-secondary');
    if (nameEl) nameEl.textContent = 'Offline';
    if (secondaryEl) secondaryEl.textContent = 'Unable to reach account services';
    if (!userStatusCard.dataset.errorToastShown) {
      showAppToast({
        title: 'Account status unavailable',
        message: err?.message || 'Unable to reach account services.',
        variant: 'warning'
      });
      userStatusCard.dataset.errorToastShown = '1';
    }
    return null;
  }
}

const CANVAS_QUERY_PARAM = 'canvas';
function setActiveCanvasFromUrl() {
  if (typeof window === 'undefined') return null;
  if (!isWorkspacePage && !workspaceTabEnabled) return null;
  const params = new URLSearchParams(window.location.search);
  const canvasId = params.get(CANVAS_QUERY_PARAM);
  if (canvasId) {
    window.__ACTIVE_CANVAS_ID = canvasId;
  }
  return canvasId;
}

setActiveCanvasFromUrl();

function stripWorkspaceParams() {
  if (typeof window === 'undefined') return;
  if (isWorkspacePage || workspaceTabEnabled) return;
  const url = new URL(window.location.href);
  let changed = false;
  ['canvas', 'pane'].forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  });
  if (!changed) return;
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

stripWorkspaceParams();

function initWorkspaceTitleEditor() {
  const titleEl = document.querySelector('[data-workspace-canvas-title]');
  if (!titleEl) return;
  const canEditLocally = document.body?.dataset?.userAuthenticated !== 'true';
  const getCanvasId = () =>
    titleEl.dataset.canvasId ||
    document.body?.dataset?.activeCanvasId ||
    window.__ACTIVE_CANVAS_ID ||
    '';
  const applyDisplayValue = (value) => {
    const next = (value || '').trim() || 'Untitled canvas';
    titleEl.dataset.displayValue = next;
    titleEl.textContent = next;
    if (document.body?.dataset) {
      document.body.dataset.activeCanvasTitle = next;
    }
  };
  applyDisplayValue(titleEl.textContent);
  const baseId = getCanvasId();
  if (!baseId && !canEditLocally) {
    titleEl.setAttribute('aria-disabled', 'true');
    return;
  }
  titleEl.setAttribute('aria-disabled', 'false');

  const startEdit = () => {
    const canvasId = getCanvasId();
    if ((!canvasId && !canEditLocally) || titleEl.dataset.editing === 'true') return;
    titleEl.dataset.editing = 'true';
    const original = titleEl.dataset.displayValue || titleEl.textContent?.trim() || 'Untitled canvas';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'workspace-title-input';
    input.maxLength = 120;
    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
    let saving = false;

    const finish = (nextValue) => {
      titleEl.dataset.editing = 'false';
      titleEl.innerHTML = '';
      applyDisplayValue(nextValue ?? original);
    };

    const commit = async () => {
      if (saving) return;
      const raw = input.value || '';
      const trimmed = raw.trim();
      const nextTitle = trimmed || 'Untitled canvas';
      if (nextTitle === original) {
        finish(original);
        return;
      }
      if (!canvasId && canEditLocally) {
        finish(nextTitle);
        document.dispatchEvent(
          new CustomEvent('ftir:workspace-title-changed', {
            detail: {
              title: nextTitle,
              source: 'guest-local'
            }
          })
        );
        return;
      }
      saving = true;
      input.disabled = true;
      try {
        await updateCanvas(canvasId, { title: nextTitle });
        finish(nextTitle);
        document.dispatchEvent(
          new CustomEvent('ftir:workspace-title-changed', {
            detail: {
              title: nextTitle,
              source: 'cloud'
            }
          })
        );
        window.showAppToast?.({
          title: 'Canvas renamed',
          message: nextTitle,
          variant: 'success'
        });
      } catch (err) {
        finish(original);
        window.showAppToast?.({
          title: 'Rename failed',
          message: err?.message || String(err),
          variant: 'danger'
        });
      } finally {
        saving = false;
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(original);
      }
    });
    input.addEventListener('blur', () => {
      if (saving) return;
      const trimmed = (input.value || '').trim();
      if (!trimmed || trimmed === original) {
        finish(original);
      } else {
        void commit();
      }
    });
  };

  titleEl.addEventListener('click', (event) => {
    if (titleEl.dataset.editing === 'true') return;
    if (titleEl.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    startEdit();
  });
  titleEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startEdit();
    }
  });
}

initWorkspaceTitleEditor();

function initWorkspaceHudMenu() {
  if (!isWorkspacePage) return;
  const root = document.querySelector('.workspace-hud-menu');
  if (!root) return;
  const dropendItems = Array.from(root.querySelectorAll('.dropend'));
  const closeItem = (item) => {
    item.classList.remove('show');
    const submenu = item.querySelector('.dropdown-menu');
    submenu?.classList.remove('show');
  };
  const closeAll = () => {
    dropendItems.forEach((item) => closeItem(item));
  };
  dropendItems.forEach((item) => {
    const toggle = item.querySelector('.dropdown-item.dropdown-toggle');
    const submenu = item.querySelector('.dropdown-menu');
    if (!toggle || !submenu) return;
    const openItem = () => {
      dropendItems.forEach((other) => {
        if (other !== item) closeItem(other);
      });
      item.classList.add('show');
      submenu.classList.add('show');
    };
    const toggleOpen = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (item.classList.contains('show')) {
        closeItem(item);
      } else {
        openItem();
      }
    };
    toggle.addEventListener('click', toggleOpen);
    item.addEventListener('mouseenter', () => {
      openItem();
    });
    item.addEventListener('mouseleave', () => {
      closeItem(item);
    });
  });
  root.addEventListener('hide.bs.dropdown', () => {
    closeAll();
  });
}

initWorkspaceHudMenu();

function initWorkspaceTagColors() {
  if (!isWorkspacePage) return;
  const tagList = document.querySelector('.workspace-tags-list');
  if (!tagList) return;
  const tagEls = tagList.querySelectorAll('.dashboard-tag');
  if (!tagEls.length) return;
  tagEls.forEach((el) => {
    const label = (el.textContent || '').trim();
    if (!label) {
      el.classList.add('is-empty');
      return;
    }
    const color = getWorkspaceTagColor(label);
    if (color) {
      el.style.background = color;
      el.style.color = '#fff';
    }
  });
  const directTags = tagList.querySelectorAll(':scope > .dashboard-tag');
  if (directTags.length > 4) {
    tagList.classList.add('workspace-tags-list--compact');
    directTags.forEach((el) => el.classList.add('workspace-tag-compact'));
  } else {
    tagList.classList.remove('workspace-tags-list--compact');
    tagEls.forEach((el) => el.classList.remove('workspace-tag-compact'));
  }
}

initWorkspaceTagColors();

let workspaceMounted = false;
let workspaceMountScheduled = false;
const mountWorkspaceOnce = () => {
  if (workspaceMounted) return;
  const didMount = mountWorkspace();
  if (didMount) {
    workspaceMounted = true;
  }
};

const scheduleWorkspaceMount = () => {
  if (workspaceMounted || workspaceMountScheduled) return;
  workspaceMountScheduled = true;
  const run = () => {
    workspaceMountScheduled = false;
    mountWorkspaceOnce();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
};
if (isWorkspacePage) {
  scheduleWorkspaceMount();
} else if (workspaceTabEnabled) {
  const tabButton = document.getElementById('tab-plotC');
  if (tabButton?.classList.contains('active')) {
    scheduleWorkspaceMount();
  } else {
    tabButton?.addEventListener('shown.bs.tab', () => {
      scheduleWorkspaceMount();
    }, { once: true });
  }
}

window.refreshUserStatus = refreshUserStatus;
if (userStatusCard) {
  refreshUserStatus();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshUserStatus();
    }
  });
}

if (dashboardV2Enabled && document.getElementById('dashboard_root')) {
  initDashboard();
}

