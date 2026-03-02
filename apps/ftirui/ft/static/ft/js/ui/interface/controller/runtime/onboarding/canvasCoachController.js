const STORAGE_KEY = 'ftirui.workspace.canvasCoach.v1';
const TIPS_DELAY_MS = 10 * 60 * 1000;

const readStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
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
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage failures */
  }
};

const baseState = () => ({
  guestCanvasIntroSeen: false,
  guestCanvasTipsSeen: false,
  guestCanvasFirstImportAt: null,
  freeCanvasIntroSeen: false
});

const getFlowDefinitions = ({ resolvePanelRoot } = {}) => ({
  'guest-first-graph': {
    storageKey: 'guestCanvasIntroSeen',
    steps: [
      {
        key: 'style',
        tab: 'Style',
        title: 'Your first graph is ready',
        body:
          'Use these header buttons to adjust the look of the graph: titles, legend, colors, traces, and layout.',
        arrowPlacement: 'above',
        resolveTarget: (context) => {
          const panelRoot = resolvePanelRoot(context);
          return panelRoot?.querySelector?.('[data-panel-action="style-painter"]')
            || panelRoot?.querySelector?.('[data-panel-action="templates"]')
            || panelRoot?.querySelector?.('.workspace-panel-actions-collection')
            || panelRoot?.querySelector?.('.workspace-panel-actions');
        }
      },
      {
        key: 'export',
        tab: 'Export',
        title: 'Export when the figure looks right',
        body:
          'Use the camera button to export your graph as PNG, SVG, JPEG, or WebP.',
        arrowPlacement: 'above',
        resolveTarget: (context) => resolvePanelRoot(context)?.querySelector?.('[data-panel-action="snapshot"]')
      },
      {
        key: 'share',
        tab: 'Share',
        title: 'Share your work when needed',
        body:
          'Use the Share button here to copy the canvas link and send it to collaborators.',
        resolveTarget: () => document.querySelector('[data-workspace-share-button]')
      },
      {
        key: 'account',
        tab: 'Account',
        title: 'Create a free account whenever you want more room',
        body:
          'A free account keeps your work in the dashboard and gives you more canvas space, without changing the way you work.',
        resolveTarget: () => document.getElementById('user_sign_in')
      }
    ]
  },
  'guest-efficiency': {
    storageKey: 'guestCanvasTipsSeen',
    steps: [
      {
        key: 'browser',
        tab: 'Browser',
        title: 'Use the browser to reorganize traces quickly',
        body:
          'Open the left browser and drag traces between graphs when you want to compare data or reorganize a figure quickly.',
        arrowPlacement: 'right',
        resolveTarget: () => document.getElementById('c_panel_toggle') || document.getElementById('c_panel')
      },
      {
        key: 'templates',
        tab: 'Templates',
        title: 'Save time with templates',
        body:
          'Once a graph looks right, reuse that styling instead of rebuilding fonts, axes, and legends from scratch.',
        arrowPlacement: 'above',
        resolveTarget: (context) => {
          const panelRoot = resolvePanelRoot(context);
          return panelRoot?.querySelector?.('[data-panel-action="templates"]')
            || panelRoot?.querySelector?.('[data-panel-action="style-painter"]');
        }
      },
      {
        key: 'dashboard',
        tab: 'Dashboard',
        title: 'Use the dashboard to organize your work',
        body:
          'Use the dashboard button to organize canvases into projects and folders as your workspace grows.',
        resolveTarget: () => document.querySelector('.workspace-back-btn')
      }
    ]
  },
  'free-canvas-intro': {
    storageKey: 'freeCanvasIntroSeen',
    steps: [
      {
        key: 'theme',
        tab: 'Theme',
        title: 'Change the workspace theme here',
        body:
          'Use this menu to change the canvas background, panel look, plot background, and trace palette.',
        arrowPlacement: 'above',
        resolveTarget: () => document.getElementById('c_canvas_toggle_theme')
      },
      {
        key: 'tech',
        tab: 'Analysis',
        title: 'Use the graph toolbar to work faster',
        body:
          'This toolbar gives you the main graph controls. Start here when you want to change graph type, run analysis, or open the right-side control pane.',
        arrowPlacement: 'above',
        resolveTarget: () =>
          document.getElementById('tb2_tech_selector')
          || document.getElementById('tb2_graph_type')
          || document.querySelector('[data-tech-side-panel]')
      },
      {
        key: 'share',
        tab: 'Share',
        title: 'Share a canvas link with guests',
        body:
          'Use Share to copy the canvas link and send it to collaborators, even if they do not have an account yet.',
        resolveTarget: () => document.getElementById('c_canvas_share_btn')
      },
      {
        key: 'cloud',
        tab: 'Save',
        title: 'Your signed-in work is saved automatically',
        body:
          'While you work, the canvas is autosaved and stays attached to your account in the dashboard.',
        resolveTarget: () => document.getElementById('autosave_indicator')
      }
    ]
  }
});

export function createCanvasCoachController({
  getActivePanelId = () => null,
  getPanelDom = () => null,
  hasPanels = () => false,
  isGuest = () => false,
  isFreeUser = () => false,
  positionMode = 'fixed'
} = {}) {
  if (typeof document === 'undefined' || !document.body) {
    return {
      handleImportSuccess() {},
      handleExportSuccess() {},
      teardown() {}
    };
  }

  const resolvePanelRoot = (context = {}) => {
    const panelId = context?.panelId || getActivePanelId();
    if (!panelId) return null;
    return getPanelDom(panelId)?.rootEl || document.querySelector(`.workspace-panel[data-panel-id="${panelId}"]`);
  };

  const state = {
    ...baseState(),
    ...readStorage()
  };

  const flowDefinitions = getFlowDefinitions({ resolvePanelRoot });
  const queue = [];
  let activeFlowId = null;
  let activeStepIndex = 0;
  let activeContext = {};
  let highlightedTarget = null;
  let tipsTimer = null;
  let activeArrowTarget = null;
  let activeArrowPlacement = 'below';
  let activePanelPlacement = 'below';
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

  const launcher = document.createElement('aside');
  launcher.className = 'workspace-coach-launcher';
  launcher.hidden = true;
  launcher.innerHTML = `
    <button type="button" class="workspace-coach-launcher-pill" data-workspace-coach-launcher-toggle>
      <i class="bi bi-mortarboard" aria-hidden="true"></i>
      <span>Tutorials</span>
    </button>
    <div class="workspace-coach-launcher-card" data-workspace-coach-launcher-card hidden>
      <div class="workspace-coach-launcher-header">
        <div>
          <div class="workspace-coach-launcher-title">Tutorials</div>
          <div class="workspace-coach-launcher-copy">Replay the guided tips whenever you need them.</div>
        </div>
        <button type="button" class="workspace-coach-launcher-close" data-workspace-coach-launcher-close aria-label="Close tutorials panel">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
      <div class="workspace-coach-launcher-actions">
        <button type="button" class="btn btn-sm btn-outline-light" data-workspace-coach-replay="guest-first-graph">First graph tutorial</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-workspace-coach-replay="guest-efficiency">Efficiency tips</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-workspace-coach-replay="free-canvas-intro">Free plan canvas tips</button>
      </div>
      <div class="workspace-coach-launcher-footer">
        <button type="button" class="btn btn-sm btn-link" data-workspace-coach-reset>Reset progress</button>
      </div>
    </div>
  `;
  document.body.appendChild(launcher);

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
  const launcherToggleBtn = launcher.querySelector('[data-workspace-coach-launcher-toggle]');
  const launcherCard = launcher.querySelector('[data-workspace-coach-launcher-card]');
  const launcherCloseBtn = launcher.querySelector('[data-workspace-coach-launcher-close]');

  const persistState = () => writeStorage({
    guestCanvasIntroSeen: !!state.guestCanvasIntroSeen,
    guestCanvasTipsSeen: !!state.guestCanvasTipsSeen,
    guestCanvasFirstImportAt: state.guestCanvasFirstImportAt || null,
    freeCanvasIntroSeen: !!state.freeCanvasIntroSeen
  });

  const syncLauncherVisibility = () => {
    const visible = !!isGuest() || !!isFreeUser();
    launcher.hidden = !visible;
    if (!visible) {
      launcherOpen = false;
      launcherCard.hidden = true;
    }
  };

  const setLauncherOpen = (next) => {
    launcherOpen = !!next && (!!isGuest() || !!isFreeUser());
    launcherCard.hidden = !launcherOpen;
    launcher.classList.toggle('is-open', launcherOpen);
  };

  const resetProgress = () => {
    state.guestCanvasIntroSeen = false;
    state.guestCanvasTipsSeen = false;
    state.guestCanvasFirstImportAt = null;
    state.freeCanvasIntroSeen = false;
    persistState();
    clearTipsTimer();
    if (hasPanels()) {
      queue.length = 0;
      if (isGuest()) {
        queueFlow('guest-first-graph', { panelId: getActivePanelId() });
      } else if (isFreeUser()) {
        queueFlow('free-canvas-intro', { panelId: getActivePanelId() });
      }
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
    activePanelPlacement = 'below';
    arrowLayer.hidden = true;
    arrowEl.style.left = '0px';
    arrowEl.style.top = '0px';
    arrowEl.style.transform = 'translateX(-50%)';
    delete arrowEl.dataset.direction;
  };

  const setFixedPosition = () => {
    root.classList.remove('is-anchored');
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const buildPlacementCandidates = (preferred) => {
    const fallback = {
      above: ['below', 'right', 'left'],
      below: ['above', 'right', 'left'],
      left: ['right', 'above', 'below'],
      right: ['left', 'above', 'below']
    };
    return [preferred, ...(fallback[preferred] || ['below', 'above', 'right', 'left'])].filter(
      (value, index, array) => array.indexOf(value) === index
    );
  };

  const computeCoachRect = (targetRect, cardRect, placement, gap, padding) => {
    const width = cardRect.width || root.offsetWidth || 420;
    const height = cardRect.height || root.offsetHeight || 260;
    let left = padding;
    let top = padding;
    if (placement === 'above') {
      left = targetRect.left + (targetRect.width / 2) - (width / 2);
      top = targetRect.top - gap - height;
    } else if (placement === 'below') {
      left = targetRect.left + (targetRect.width / 2) - (width / 2);
      top = targetRect.bottom + gap;
    } else if (placement === 'left') {
      left = targetRect.left - gap - width;
      top = targetRect.top + (targetRect.height / 2) - (height / 2);
    } else if (placement === 'right') {
      left = targetRect.right + gap;
      top = targetRect.top + (targetRect.height / 2) - (height / 2);
    }
    return {
      left,
      top,
      width,
      height,
      fits:
        left >= padding
        && top >= padding
        && left + width <= window.innerWidth - padding
        && top + height <= window.innerHeight - padding
    };
  };

  const updateCoachPosition = (target, placement = 'below') => {
    if (positionMode !== 'anchored' || !(target instanceof Element)) {
      setFixedPosition();
      return;
    }
    const targetRect = target.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) {
      setFixedPosition();
      return;
    }
    root.classList.add('is-anchored');
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    const gap = 18;
    const padding = 16;
    const cardRect = root.getBoundingClientRect();
    const candidates = buildPlacementCandidates(placement);
    let chosen = computeCoachRect(targetRect, cardRect, candidates[0], gap, padding);
    for (const candidate of candidates) {
      const next = computeCoachRect(targetRect, cardRect, candidate, gap, padding);
      chosen = next;
      if (next.fits) break;
    }
    const maxLeft = Math.max(padding, window.innerWidth - chosen.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - chosen.height - padding);
    root.style.left = `${Math.round(clamp(chosen.left, padding, maxLeft))}px`;
    root.style.top = `${Math.round(clamp(chosen.top, padding, maxTop))}px`;
  };

  const applyHighlight = (element) => {
    clearHighlight();
    if (!element || !(element instanceof Element)) return;
    highlightedTarget = element;
    highlightedTarget.classList.add('workspace-coach-target--active');
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

  const getActiveFlow = () => flowDefinitions[activeFlowId] || null;
  const getActiveStep = () => {
    const flow = getActiveFlow();
    return flow?.steps?.[activeStepIndex] || null;
  };

  const showNextQueuedFlow = () => {
    if (activeFlowId || !queue.length) return;
    const next = queue.shift();
    if (!next) return;
    activeFlowId = next.flowId;
    activeStepIndex = 0;
    activeContext = next.context || {};
    render();
  };

  const markFlowSeen = (flowId) => {
    const flow = flowDefinitions[flowId];
    if (!flow?.storageKey) return;
    state[flow.storageKey] = true;
    persistState();
  };

  const closeFlow = ({ markSeen = true } = {}) => {
    if (activeFlowId && markSeen) {
      markFlowSeen(activeFlowId);
    }
    activeFlowId = null;
    activeStepIndex = 0;
    activeContext = {};
    clearHighlight();
    clearArrow();
    root.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!activeFlowId) {
        root.hidden = true;
      }
    }, 180);
    showNextQueuedFlow();
  };

  const forceOpenFlow = (flowId, context = {}) => {
    if (!isGuest() && !isFreeUser()) return;
    const flow = flowDefinitions[flowId];
    if (!flow) return;
    queue.length = 0;
    activeFlowId = flowId;
    activeStepIndex = 0;
    activeContext = context;
    setLauncherOpen(false);
    render();
  };

  const queueFlow = (flowId, context = {}) => {
    const flow = flowDefinitions[flowId];
    if (!flow) return;
    if (flowId.startsWith('guest-') && !isGuest()) return;
    if (flowId.startsWith('free-') && !isFreeUser()) return;
    if (state[flow.storageKey]) return;
    if (activeFlowId === flowId) return;
    if (queue.some((entry) => entry.flowId === flowId)) return;
    queue.push({ flowId, context });
    showNextQueuedFlow();
  };

  const render = () => {
    const flow = getActiveFlow();
    const step = getActiveStep();
    if (!flow || !step) {
      clearHighlight();
      root.classList.remove('is-visible');
      root.hidden = true;
      return;
    }

    root.hidden = false;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => root.classList.add('is-visible'));
    } else {
      root.classList.add('is-visible');
    }

    tabsEl.innerHTML = flow.steps
      .map((item, index) => `
        <button type="button"
                class="workspace-coach-tab${index === activeStepIndex ? ' is-active' : ''}"
                data-workspace-coach-tab="${index}"
                aria-current="${index === activeStepIndex ? 'step' : 'false'}">
          <span class="workspace-coach-tab-index">${index + 1}</span>
          <span class="workspace-coach-tab-label">${item.tab}</span>
        </button>
      `)
      .join('');

    kickerEl.textContent = flow.steps.length > 1
      ? `Step ${activeStepIndex + 1} of ${flow.steps.length}`
      : 'Tip';
    titleEl.textContent = step.title;
    copyEl.textContent = step.body;

    backBtn.disabled = activeStepIndex === 0;
    nextBtn.textContent = activeStepIndex === flow.steps.length - 1 ? 'Done' : 'Next';

    const resolvedTarget = typeof step.resolveTarget === 'function' ? step.resolveTarget(activeContext) : null;
    const placement = step.panelPlacement || step.arrowPlacement || 'below';
    activePanelPlacement = placement;
    applyHighlight(resolvedTarget);
    updateArrow(resolvedTarget, step.arrowPlacement || placement);
    updateCoachPosition(resolvedTarget, placement);
  };

  const markFirstImport = () => {
    if (!state.guestCanvasFirstImportAt) {
      state.guestCanvasFirstImportAt = Date.now();
      persistState();
    }
  };

  const clearTipsTimer = () => {
    if (tipsTimer) {
      window.clearTimeout(tipsTimer);
      tipsTimer = null;
    }
  };

  const scheduleTips = () => {
    if (!isGuest() || state.guestCanvasTipsSeen || !state.guestCanvasFirstImportAt) return;
    clearTipsTimer();
    const remaining = Math.max(0, (state.guestCanvasFirstImportAt + TIPS_DELAY_MS) - Date.now());
    tipsTimer = window.setTimeout(() => {
      tipsTimer = null;
      if (!state.guestCanvasTipsSeen && hasPanels()) {
        queueFlow('guest-efficiency', { panelId: getActivePanelId() });
      }
    }, remaining);
  };

  tabsEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-workspace-coach-tab]');
    if (!btn) return;
    const nextIndex = Number(btn.dataset.workspaceCoachTab);
    if (!Number.isInteger(nextIndex) || nextIndex < 0) return;
    activeStepIndex = nextIndex;
    render();
  });

  backBtn.addEventListener('click', () => {
    if (!activeFlowId || activeStepIndex === 0) return;
    activeStepIndex -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const flow = getActiveFlow();
    if (!flow) return;
    if (activeStepIndex >= flow.steps.length - 1) {
      closeFlow({ markSeen: true });
      return;
    }
    activeStepIndex += 1;
    render();
  });

  skipBtn.addEventListener('click', () => closeFlow({ markSeen: true }));
  closeBtn.addEventListener('click', () => closeFlow({ markSeen: true }));

  launcherToggleBtn?.addEventListener('click', () => setLauncherOpen(!launcherOpen));
  launcherCloseBtn?.addEventListener('click', () => setLauncherOpen(false));
  launcher?.addEventListener('click', (event) => {
    const replayBtn = event.target.closest('[data-workspace-coach-replay]');
    if (replayBtn) {
      const flowId = replayBtn.dataset.workspaceCoachReplay;
      forceOpenFlow(flowId, { panelId: getActivePanelId() });
      return;
    }
    const resetBtn = event.target.closest('[data-workspace-coach-reset]');
    if (resetBtn) {
      resetProgress();
      setLauncherOpen(false);
    }
  });

  const syncLauncherActions = () => {
    launcher?.querySelectorAll('[data-workspace-coach-replay]').forEach((btn) => {
      const flowId = btn.dataset.workspaceCoachReplay || '';
      btn.hidden = (flowId.startsWith('guest-') && !isGuest()) || (flowId.startsWith('free-') && !isFreeUser());
    });
  };

  const syncVisibleArrow = () => {
    if (root.hidden) return;
    if (activeArrowTarget) {
      updateArrow(activeArrowTarget, activeArrowPlacement);
      updateCoachPosition(activeArrowTarget, activePanelPlacement);
    } else {
      setFixedPosition();
    }
  };
  window.addEventListener('resize', syncVisibleArrow);
  window.addEventListener('scroll', syncVisibleArrow, true);
  syncLauncherVisibility();
  syncLauncherActions();

  if (state.guestCanvasFirstImportAt && !state.guestCanvasIntroSeen && hasPanels()) {
    queueFlow('guest-first-graph', { panelId: getActivePanelId() });
  }
  if (!state.freeCanvasIntroSeen && hasPanels() && isFreeUser()) {
    queueFlow('free-canvas-intro', { panelId: getActivePanelId() });
  }
  scheduleTips();

  return {
    handleImportSuccess({ panelIds = [] } = {}) {
      if (!isGuest() && !isFreeUser()) return;
      markFirstImport();
      const panelId = panelIds[panelIds.length - 1] || getActivePanelId();
      if (isGuest() && !state.guestCanvasIntroSeen) {
        queueFlow('guest-first-graph', { panelId });
      }
      scheduleTips();
    },
    handleExportSuccess({ panelId = null } = {}) {
      if (!isGuest()) return;
      if (!state.guestCanvasFirstImportAt) {
        markFirstImport();
      }
      if (!state.guestCanvasTipsSeen) {
        queueFlow('guest-efficiency', { panelId: panelId || getActivePanelId() });
      }
    },
    teardown() {
      clearTipsTimer();
      clearHighlight();
      clearArrow();
      setFixedPosition();
      window.removeEventListener('resize', syncVisibleArrow);
      window.removeEventListener('scroll', syncVisibleArrow, true);
      arrowLayer.remove();
      launcher.remove();
      root.remove();
    }
  };
}
