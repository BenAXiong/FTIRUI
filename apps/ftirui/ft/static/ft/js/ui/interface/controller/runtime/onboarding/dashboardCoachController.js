const STORAGE_KEY = 'ftirui.workspace.dashboardCoach.v1';

const readStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStorage = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage failures */
  }
};

const baseState = () => ({
  guestDashboardIntroSeen: false
});

const getSteps = () => ([
  {
    key: 'projects',
    tab: 'Projects',
    title: 'Projects and folders will live here',
    body:
      'Once you create a free account, this area is where your canvases can be organized into projects and folders.',
    arrowPlacement: 'right',
    resolveTarget: () => document.querySelector('.sidebar-section-header')
  },
  {
    key: 'canvases',
    tab: 'Canvases',
    title: 'You can keep creating canvases before signing in',
    body:
      'As a guest, the newest canvas stays editable. Older ones remain available in read-only mode, so your work does not disappear.',
    arrowPlacement: 'above',
    resolveTarget: () => document.getElementById('dashboard_action_new_canvas')
  },
  {
    key: 'latest',
    tab: 'Latest',
    title: 'Use Latest to jump back into recent work',
    body:
      'Latest is the quickest way back to your recent canvases. The project tree on the left becomes more useful once you start organizing work.',
    arrowPlacement: 'right',
    resolveTarget: () => document.querySelector('[data-view="latest"]')
  },
  {
    key: 'account',
    tab: 'Account',
    title: 'Create a free account whenever you want more room',
    body:
      'A free account keeps your canvases in the dashboard and gives you more editable canvas space without changing the way you work.',
    arrowPlacement: 'below',
    resolveTarget: () => document.getElementById('user_sign_in')
  }
]);

export function createDashboardCoachController({
  isGuest = () => false,
  isVisible = () => true,
  enableLauncher = true
} = {}) {
  if (typeof document === 'undefined' || !document.body) {
    return {
      handleDataReady() {},
      teardown() {}
    };
  }

  const state = { ...baseState(), ...readStorage() };
  const steps = getSteps();
  let activeStepIndex = 0;
  let isOpen = false;
  let highlightedTarget = null;
  let activeArrowTarget = null;
  let activeArrowPlacement = 'below';
  let launcherOpen = false;

  const root = document.createElement('aside');
  root.className = 'workspace-coach';
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="workspace-coach-card">
      <button type="button" class="workspace-coach-close" data-workspace-coach-close aria-label="Close tutorial">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
      <div class="workspace-coach-tabs" data-workspace-coach-tabs></div>
      <div class="workspace-coach-body">
        <div class="workspace-coach-kicker" data-workspace-coach-kicker></div>
        <h3 class="workspace-coach-title" data-workspace-coach-title></h3>
        <p class="workspace-coach-copy" data-workspace-coach-copy></p>
      </div>
      <div class="workspace-coach-footer">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-workspace-coach-back>Back</button>
        <div class="workspace-coach-footer-spacer"></div>
        <button type="button" class="btn btn-sm btn-link" data-workspace-coach-skip>Skip</button>
        <button type="button" class="btn btn-sm btn-primary" data-workspace-coach-next>Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const launcher = enableLauncher ? document.createElement('aside') : null;
  if (launcher) {
    launcher.className = 'workspace-coach-launcher';
    launcher.hidden = true;
    launcher.innerHTML = `
      <button type="button" class="workspace-coach-launcher-pill" data-workspace-coach-launcher-toggle>
        <i class="bi bi-lightbulb" aria-hidden="true"></i>
        <span>Tips</span>
      </button>
      <div class="workspace-coach-launcher-card" data-workspace-coach-launcher-card hidden>
        <div class="workspace-coach-launcher-header">
          <div>
            <div class="workspace-coach-launcher-title">Dashboard tips</div>
            <div class="workspace-coach-launcher-copy">Replay the dashboard tour whenever you need it.</div>
          </div>
          <button type="button" class="workspace-coach-launcher-close" data-workspace-coach-launcher-close aria-label="Close dashboard tips">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
        <div class="workspace-coach-launcher-actions">
          <button type="button" class="btn btn-sm btn-outline-light" data-workspace-coach-replay>Replay dashboard tour</button>
        </div>
        <div class="workspace-coach-launcher-footer">
          <button type="button" class="btn btn-sm btn-link" data-workspace-coach-reset>Reset tour</button>
        </div>
      </div>
    `;
    document.body.appendChild(launcher);
  }

  const arrowLayer = document.createElement('div');
  arrowLayer.className = 'workspace-coach-arrow-layer';
  arrowLayer.hidden = true;
  arrowLayer.innerHTML = `
    <div class="workspace-coach-arrow" data-workspace-coach-arrow>
      <span class="workspace-coach-arrow-line"></span>
      <span class="workspace-coach-arrow-head"></span>
    </div>
  `;
  document.body.appendChild(arrowLayer);

  const tabsEl = root.querySelector('[data-workspace-coach-tabs]');
  const kickerEl = root.querySelector('[data-workspace-coach-kicker]');
  const titleEl = root.querySelector('[data-workspace-coach-title]');
  const copyEl = root.querySelector('[data-workspace-coach-copy]');
  const backBtn = root.querySelector('[data-workspace-coach-back]');
  const skipBtn = root.querySelector('[data-workspace-coach-skip]');
  const nextBtn = root.querySelector('[data-workspace-coach-next]');
  const closeBtn = root.querySelector('[data-workspace-coach-close]');
  const arrowEl = arrowLayer.querySelector('[data-workspace-coach-arrow]');
  const launcherToggleBtn = launcher?.querySelector('[data-workspace-coach-launcher-toggle]') || null;
  const launcherCard = launcher?.querySelector('[data-workspace-coach-launcher-card]') || null;
  const launcherCloseBtn = launcher?.querySelector('[data-workspace-coach-launcher-close]') || null;

  const persistState = () => writeStorage({
    guestDashboardIntroSeen: !!state.guestDashboardIntroSeen
  });

  const syncLauncherVisibility = () => {
    if (!launcher) return;
    const visible = !!isGuest() && !!isVisible();
    launcher.hidden = !visible;
    if (!visible) {
      launcherOpen = false;
      if (launcherCard) launcherCard.hidden = true;
    }
  };

  const setLauncherOpen = (next) => {
    if (!launcher || !launcherCard) return;
    launcherOpen = !!next && !!isGuest() && !!isVisible();
    launcherCard.hidden = !launcherOpen;
    launcher.classList.toggle('is-open', launcherOpen);
  };

  const resetProgress = () => {
    state.guestDashboardIntroSeen = false;
    persistState();
    if (isVisible()) {
      isOpen = true;
      activeStepIndex = 0;
      render();
    }
  };

  const clearHighlight = () => {
    if (!highlightedTarget) return;
    highlightedTarget.classList.remove('workspace-coach-target--active');
    highlightedTarget = null;
  };

  const clearArrow = () => {
    activeArrowTarget = null;
    activeArrowPlacement = 'below';
    arrowLayer.hidden = true;
    arrowEl.style.left = '0px';
    arrowEl.style.top = '0px';
    arrowEl.style.transform = 'translateX(-50%)';
    delete arrowEl.dataset.direction;
  };

  const updateArrow = (element, placement = 'below') => {
    if (!(element instanceof Element)) {
      clearArrow();
      return;
    }
    const targetRect = element.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) {
      clearArrow();
      return;
    }
    const centerX = targetRect.left + (targetRect.width / 2);
    const centerY = targetRect.top + (targetRect.height / 2);
    const gap = 8;
    let direction = 'up';
    let left = Math.round(centerX);
    let top = Math.round(targetRect.bottom + gap);
    let transform = 'translateX(-50%)';
    if (placement === 'above') {
      direction = 'down';
      top = Math.round(targetRect.top - gap - 30);
    } else if (placement === 'right') {
      direction = 'left';
      left = Math.round(targetRect.right + gap);
      top = Math.round(centerY);
      transform = 'translateY(-50%)';
    } else if (placement === 'left') {
      direction = 'right';
      left = Math.round(targetRect.left - gap - 30);
      top = Math.round(centerY);
      transform = 'translateY(-50%)';
    }
    arrowLayer.hidden = false;
    arrowEl.dataset.direction = direction;
    arrowEl.style.left = `${left}px`;
    arrowEl.style.top = `${top}px`;
    arrowEl.style.transform = transform;
    activeArrowTarget = element;
    activeArrowPlacement = placement;
  };

  const applyHighlight = (element) => {
    clearHighlight();
    if (!element || !(element instanceof Element)) return;
    highlightedTarget = element;
    highlightedTarget.classList.add('workspace-coach-target--active');
  };

  const close = () => {
    state.guestDashboardIntroSeen = true;
    persistState();
    isOpen = false;
    clearHighlight();
    clearArrow();
    root.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!isOpen) root.hidden = true;
    }, 180);
  };

  const render = () => {
    const step = steps[activeStepIndex];
    if (!step) return;
    root.hidden = false;
    window.requestAnimationFrame(() => root.classList.add('is-visible'));
    tabsEl.innerHTML = steps.map((item, index) => `
      <button type="button"
              class="workspace-coach-tab${index === activeStepIndex ? ' is-active' : ''}"
              data-workspace-coach-tab="${index}"
              aria-current="${index === activeStepIndex ? 'step' : 'false'}">
        <span class="workspace-coach-tab-index">${index + 1}</span>
        <span class="workspace-coach-tab-label">${item.tab}</span>
      </button>
    `).join('');
    kickerEl.textContent = `Step ${activeStepIndex + 1} of ${steps.length}`;
    titleEl.textContent = step.title;
    copyEl.textContent = step.body;
    backBtn.disabled = activeStepIndex === 0;
    nextBtn.textContent = activeStepIndex === steps.length - 1 ? 'Done' : 'Next';
    const target = typeof step.resolveTarget === 'function' ? step.resolveTarget() : null;
    applyHighlight(target);
    updateArrow(target, step.arrowPlacement || 'below');
    syncLauncherVisibility();
  };

  const maybeOpen = () => {
    if (!isGuest() || state.guestDashboardIntroSeen || isOpen || !isVisible()) return;
    isOpen = true;
    activeStepIndex = 0;
    render();
  };

  tabsEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-workspace-coach-tab]');
    if (!btn) return;
    const nextIndex = Number(btn.dataset.workspaceCoachTab);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= steps.length) return;
    activeStepIndex = nextIndex;
    render();
  });

  backBtn.addEventListener('click', () => {
    if (!activeStepIndex) return;
    activeStepIndex -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (activeStepIndex >= steps.length - 1) {
      close();
      return;
    }
    activeStepIndex += 1;
    render();
  });

  skipBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  launcherToggleBtn?.addEventListener('click', () => setLauncherOpen(!launcherOpen));
  launcherCloseBtn?.addEventListener('click', () => setLauncherOpen(false));
  launcher?.addEventListener('click', (event) => {
    const replayBtn = event.target.closest('[data-workspace-coach-replay]');
    if (replayBtn) {
      isOpen = true;
      activeStepIndex = 0;
      setLauncherOpen(false);
      render();
      return;
    }
    const resetBtn = event.target.closest('[data-workspace-coach-reset]');
    if (resetBtn) {
      resetProgress();
      setLauncherOpen(false);
    }
  });

  const syncArrow = () => {
    if (root.hidden || !activeArrowTarget) return;
    updateArrow(activeArrowTarget, activeArrowPlacement);
  };
  window.addEventListener('resize', syncArrow);
  window.addEventListener('scroll', syncArrow, true);
  syncLauncherVisibility();

  return {
    handleDataReady() {
      syncLauncherVisibility();
      maybeOpen();
    },
    teardown() {
      window.removeEventListener('resize', syncArrow);
      window.removeEventListener('scroll', syncArrow, true);
      clearHighlight();
      clearArrow();
      launcher?.remove();
      arrowLayer.remove();
      root.remove();
    }
  };
}
