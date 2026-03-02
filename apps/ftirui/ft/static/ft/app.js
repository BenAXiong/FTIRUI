import { el } from './js/ui/utils/dom.js';
import { initDashboard } from './js/ui/dashboard/initDashboard.js';
import { mountWorkspace } from './js/ui/workspace/initControls.js';
import { fetchCanvasDetail, updateCanvas } from './js/services/dashboard.js';
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

function buildPlansUrl({ plan = '', source = '', next = '' } = {}) {
  const base = document.body?.dataset?.plansUrl || '/plans/';
  const url = new URL(base, window.location.origin);
  if (plan) url.searchParams.set('plan', plan);
  if (source) url.searchParams.set('source', source);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}

function openPlansPage(options = {}) {
  window.location.assign(buildPlansUrl(options));
}

window.openAppPlansPage = openPlansPage;
const AUTH_STORAGE_KEY = 'ftir:last-auth';

const userStatusCard = el('user_status');
let currentUserState = null;
const userSignInLink = el('user_sign_in');
const userSignOutLink = el('user_sign_out');
const userDropdownMenu = userStatusCard ? userStatusCard.querySelector('[data-user-dropdown]') : null;
const userDropdownName = userStatusCard ? userStatusCard.querySelector('[data-dropdown-name]') : null;
const userDropdownEmail = userStatusCard ? userStatusCard.querySelector('[data-dropdown-email]') : null;
const userPlanPill = userStatusCard ? userStatusCard.querySelector('[data-user-plan-pill]') : null;
const userUpgradeLink = userStatusCard ? userStatusCard.querySelector('[data-upgrade-link]') : null;

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
    if (userUpgradeLink) {
      const isPaid = data.billing_status === 'active' && String(data.plan || 'free').toLowerCase() !== 'free';
      userUpgradeLink.classList.toggle('d-none', isPaid);
      userUpgradeLink.href = buildPlansUrl({ source: 'user-menu', next: window.location.pathname + window.location.search });
    }
    if (userPlanPill) {
      const plan = String(data.plan || 'free').toUpperCase();
      userPlanPill.textContent = plan;
      userPlanPill.classList.remove('d-none', 'is-paid');
      if (data.billing_status === 'active' && String(data.plan || 'free').toLowerCase() !== 'free') {
        userPlanPill.classList.add('is-paid');
      }
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
    if (userUpgradeLink) {
      userUpgradeLink.classList.add('d-none');
    }
    if (userPlanPill) {
      userPlanPill.textContent = '';
      userPlanPill.classList.add('d-none');
      userPlanPill.classList.remove('is-paid');
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
        if (typeof window.__FTIR_CLEAR_MULTI_IMPORT_PREFERENCE === 'function') {
          window.__FTIR_CLEAR_MULTI_IMPORT_PREFERENCE();
        }
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
  const isLocked = document.body?.dataset?.activeCanvasLocked === 'true';
  const getCanvasId = () =>
    titleEl.dataset.canvasId ||
    document.body?.dataset?.activeCanvasId ||
    window.__ACTIVE_CANVAS_ID ||
    '';
  const applyDisplayValue = (value) => {
    const next = (value || '').trim() || 'Untitled Canvas';
    titleEl.dataset.displayValue = next;
    titleEl.textContent = next;
    if (document.body?.dataset) {
      document.body.dataset.activeCanvasTitle = next;
    }
  };
  applyDisplayValue(titleEl.textContent);
  const baseId = getCanvasId();
  if (isLocked || (!baseId && !canEditLocally)) {
    titleEl.setAttribute('aria-disabled', 'true');
    return;
  }
  titleEl.setAttribute('aria-disabled', 'false');

  const startEdit = () => {
    const canvasId = getCanvasId();
    if ((!canvasId && !canEditLocally) || titleEl.dataset.editing === 'true') return;
    titleEl.dataset.editing = 'true';
    const original = titleEl.dataset.displayValue || titleEl.textContent?.trim() || 'Untitled Canvas';
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
      const nextTitle = trimmed || 'Untitled Canvas';
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
    if (titleEl.dataset.editing === 'true') return;
    if (event.target && event.target !== titleEl) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startEdit();
    }
  });
}

initWorkspaceTitleEditor();

function initReadonlyCanvasOverlay() {
  const body = document.body;
  if (!body || body.dataset.activeCanvasLocked !== 'true') return;
  const overlay = document.querySelector('[data-workspace-canvas-readonly]');
  if (!overlay) return;
  const wrapper = overlay.closest('.workspace-canvas-wrapper');
  const canvasId = body.dataset.activeCanvasId || '';
  const confirmBtn = overlay.querySelector('[data-readonly-confirm]');
  const upgradeBtn = overlay.querySelector('[data-readonly-upgrade]');

  const dismissOverlay = () => {
    wrapper?.setAttribute('data-readonly-overlay-dismissed', 'true');
    overlay.hidden = true;
  };

  const refreshAccess = async ({ silent = false } = {}) => {
    if (!canvasId) return;
    try {
      const detail = await fetchCanvasDetail(canvasId);
      if (!detail?.quota_locked) {
        window.location.reload();
        return;
      }
      if (!silent) {
        window.showAppToast?.({
          title: 'Canvas still locked',
          message: 'Delete an older canvas or upgrade, then refresh access again.',
          variant: 'warning'
        });
      }
    } catch (err) {
      if (!silent) {
        window.showAppToast?.({
          title: 'Unable to refresh access',
          message: err?.message || String(err),
          variant: 'danger'
        });
      }
    }
  };

  confirmBtn?.addEventListener('click', dismissOverlay);
  upgradeBtn?.addEventListener('click', () => {
    openPlansPage({
      plan: 'pro',
      source: 'locked-canvas-overlay',
      next: window.location.pathname + window.location.search,
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || body.dataset.activeCanvasLocked !== 'true') return;
    void refreshAccess({ silent: true });
  });
}

initReadonlyCanvasOverlay();

function initReadonlyCanvasUiGuards() {
  const body = document.body;
  if (!body || body.dataset.activeCanvasLocked !== 'true') return;

  body.classList.add('workspace-canvas-locked');

  const browserRoot = document.getElementById('c_panel');
  const browserToggle = document.getElementById('c_panel_toggle');
  const readonlyDisabledAttr = 'data-readonly-disabled';
  const allowedBrowserSelector = '.workspace-browser-tab, .toggle, #c_project_tree_toggle';

  const markDisabled = (el) => {
    if (!el) return;
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute(readonlyDisabledAttr, 'true');
    if (typeof el.tabIndex === 'number') {
      el.tabIndex = -1;
    }
    if ('disabled' in el) {
      el.disabled = true;
    }
  };

  const markReadonlyInput = (el) => {
    if (!el) return;
    el.readOnly = true;
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute(readonlyDisabledAttr, 'true');
    el.tabIndex = -1;
  };

  const isAllowedBrowserControl = (el) => {
    if (!el || typeof el.matches !== 'function') return false;
    if (el === browserToggle) return true;
    return el.matches(allowedBrowserSelector) || !!el.closest(allowedBrowserSelector);
  };

  const closeOpenReadonlyPopovers = () => {
    document.querySelectorAll('.workspace-panel-popover.is-open').forEach((el) => {
      el.classList.remove('is-open');
    });
    document.querySelectorAll('.workspace-panel-actions-overflow-panel.is-open').forEach((el) => {
      el.classList.remove('is-open');
    });
    document
      .querySelectorAll('.workspace-panel-action-btn.is-active, .workspace-panel-popover-btn.is-active')
      .forEach((el) => el.classList.remove('is-active'));
    document
      .querySelectorAll('.workspace-panel-action-btn[aria-expanded="true"], .workspace-panel-popover-btn[aria-expanded="true"]')
      .forEach((el) => el.setAttribute('aria-expanded', 'false'));
  };

  const applyReadonlyGuards = () => {
    closeOpenReadonlyPopovers();

    document
      .querySelectorAll('#workspace_hud_menu_toggle, #c_history_undo, #c_history_redo, [data-history-action="undo"], [data-history-action="redo"]')
      .forEach((el) => markDisabled(el));

    document
      .querySelectorAll('.workspace-panel-action-btn, .workspace-panel-actions-overflow')
      .forEach((el) => markDisabled(el));

    document
      .querySelectorAll('.workspace-panel-popover button, .workspace-panel-popover input, .workspace-panel-popover select, .workspace-panel-popover textarea, .workspace-panel-popover-tab, .workspace-panel-actions-overflow-panel button')
      .forEach((el) => {
        if (el.matches('input, textarea')) {
          markReadonlyInput(el);
          return;
        }
        markDisabled(el);
      });

    document.querySelectorAll('.workspace-panel-plot .modebar-btn').forEach((el) => {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute(readonlyDisabledAttr, 'true');
      el.tabIndex = -1;
    });

    if (browserRoot) {
      browserRoot.querySelectorAll('button, input, select, textarea').forEach((el) => {
        if (isAllowedBrowserControl(el)) return;
        if (el.matches('.rename')) {
          markReadonlyInput(el);
          return;
        }
        markDisabled(el);
      });

      browserRoot.querySelectorAll('[draggable="true"], .drag-handle').forEach((el) => {
        el.setAttribute('draggable', 'false');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute(readonlyDisabledAttr, 'true');
        if (typeof el.tabIndex === 'number') {
          el.tabIndex = -1;
        }
      });

      browserRoot.querySelectorAll('.rename').forEach((el) => markReadonlyInput(el));
    }
  };

  const blockBrowserReadonlyInteractions = (event) => {
    if (!browserRoot) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target || !browserRoot.contains(target)) return;
    if (isAllowedBrowserControl(target)) return;
    if (
      target.closest(
        '.btn-icon, .trace-info-icon, .trace-remove, .drag-handle, .rename, .panel-toolbar button, .panel-toolbar input, .panel-toolbar select, .panel-toolbar textarea, .dropdown-menu'
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  browserRoot?.addEventListener('click', blockBrowserReadonlyInteractions, true);
  browserRoot?.addEventListener('dblclick', blockBrowserReadonlyInteractions, true);
  browserRoot?.addEventListener('pointerdown', blockBrowserReadonlyInteractions, true);
  browserRoot?.addEventListener(
    'dragstart',
    (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target || !browserRoot.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  const observer = new MutationObserver(() => applyReadonlyGuards());
  observer.observe(document.body, { childList: true, subtree: true });
  applyReadonlyGuards();
}

initReadonlyCanvasUiGuards();

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

