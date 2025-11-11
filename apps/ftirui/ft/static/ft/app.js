import { el } from './js/ui/utils/dom.js';
import { initDashboard } from './js/ui/dashboard/initDashboard.js';

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
  const avatarEl = userStatusCard.querySelector('.user-avatar');
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
    userStatusCard.dataset.authenticated = '0';
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

const BOARD_QUERY_PARAM = 'board';
function setActiveBoardFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const boardId = params.get(BOARD_QUERY_PARAM);
  if (boardId) {
    window.__ACTIVE_BOARD_ID = boardId;
  }
  return boardId;
}

setActiveBoardFromUrl();

window.refreshUserStatus = refreshUserStatus;
if (userStatusCard) {
  refreshUserStatus();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshUserStatus();
    }
  });
}

initDashboard();

