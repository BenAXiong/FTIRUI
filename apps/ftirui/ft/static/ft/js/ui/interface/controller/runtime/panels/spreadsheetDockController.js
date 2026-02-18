import { spreadsheetPanelType } from './registry/spreadsheetPanel.js';

export function createSpreadsheetDockController({
  dom = {},
  actions = {},
  selectors = {},
  toolbar = {},
  preferences = null
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const panel = dom.panel
    || documentRoot?.querySelector?.('[data-tech-side-panel]')
    || null;
  const header = dom.header
    || panel?.querySelector?.('[data-tech-side-panel-header]')
    || null;
  const actionsRow = dom.actionsRow
    || panel?.querySelector?.('[data-tech-side-panel-actions]')
    || null;
  const openCanvasBtn = dom.openCanvasBtn
    || panel?.querySelector?.('[data-tech-panel-action="open-canvas"]')
    || null;
  const menu = dom.menu || documentRoot?.createElement?.('div') || null;

  if (!documentRoot || !menu) return null;

  const safeSetGraphVisibility = typeof actions.setGraphVisibility === 'function'
    ? actions.setGraphVisibility
    : () => {};
  const safeBringPanelToFront = typeof actions.bringPanelToFront === 'function'
    ? actions.bringPanelToFront
    : () => {};
  const safeSetPanelContent = typeof actions.setPanelContent === 'function'
    ? actions.setPanelContent
    : () => {};
  let safeDuplicatePanel = typeof actions.duplicatePanel === 'function'
    ? actions.duplicatePanel
    : () => {};
  const safeHandleHeaderAction = typeof actions.handleHeaderAction === 'function'
    ? actions.handleHeaderAction
    : () => {};
  const getPanelRecord = typeof selectors.getPanelRecord === 'function'
    ? selectors.getPanelRecord
    : () => null;
  const getPanelContent = typeof selectors.getPanelContent === 'function'
    ? selectors.getPanelContent
    : () => null;
  const listPlotPanels = typeof selectors.listPlotPanels === 'function'
    ? selectors.listPlotPanels
    : () => [];
  const getPanelDom = typeof selectors.getPanelDom === 'function'
    ? selectors.getPanelDom
    : () => null;
  const readDocked = typeof preferences?.readSpreadsheetDock === 'function'
    ? preferences.readSpreadsheetDock
    : () => null;
  const writeDocked = typeof preferences?.writeSpreadsheetDock === 'function'
    ? preferences.writeSpreadsheetDock
    : () => {};

  let sidePanelController = toolbar.sidePanelController || null;
  let pinController = toolbar.pinController || null;
  let dockedPanelId = null;
  let dockedHandles = null;
  let dockedRoot = null;
  let lockObserver = null;
  let freezeEnabled = false;
  let dataActions = null;
  let dataTitle = null;

  menu.className = 'workspace-tech-panel-data-menu';
  const emptyState = documentRoot.createElement('div');
  emptyState.className = 'workspace-tech-panel-data-empty';
  emptyState.textContent = 'No spreadsheet docked yet.';
  const host = documentRoot.createElement('div');
  host.className = 'workspace-tech-panel-data-host';
  menu.appendChild(emptyState);
  menu.appendChild(host);

  const ensureHeaderItems = () => {
    if (!header || !actionsRow) return;
    if (!dataTitle) {
      dataTitle = documentRoot.createElement('div');
      dataTitle.className = 'workspace-tech-panel-data-title';
      dataTitle.hidden = true;
      header.insertBefore(dataTitle, actionsRow);
    }
    if (!dataActions) {
      dataActions = documentRoot.createElement('div');
      dataActions.className = 'workspace-tech-panel-data-actions';
      actionsRow.insertBefore(dataActions, actionsRow.firstChild);
    }
  };

  const getUIPortal = () => {
    let portal = documentRoot.querySelector('.ui-portal');
    if (!portal) {
      portal = documentRoot.createElement('div');
      portal.className = 'ui-portal';
      documentRoot.body?.appendChild?.(portal);
    }
    return portal;
  };

  const placePopover = (btn, pop, { offsetX = 0, offsetY = 8 } = {}) => {
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect?.();
    if (!rect) return;
    const left = rect.left + rect.width / 2 + offsetX;
    const top = rect.bottom + offsetY;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.bottom = 'auto';
    pop.style.right = 'auto';
  };

  const openPortaledPopover = (btn, pop, opts = {}) => {
    if (!btn || !pop) return;
    const portal = getUIPortal();
    if (!portal) return;
    pop.__origParent = pop.parentElement;
    portal.appendChild(pop);
    placePopover(btn, pop, opts);
    pop.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    pop.__reflow = () => placePopover(btn, pop, opts);
    window.addEventListener('scroll', pop.__reflow, true);
    window.addEventListener('resize', pop.__reflow, true);
  };

  const closePortaledPopover = (btn, pop) => {
    if (!btn || !pop) return;
    pop.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    if (pop.__origParent) {
      pop.__origParent.appendChild(pop);
    }
    window.removeEventListener('scroll', pop.__reflow, true);
    window.removeEventListener('resize', pop.__reflow, true);
    delete pop.__reflow;
    delete pop.__origParent;
  };

  const registerPopoverButton = (btn, pop, { openOnHover = false, suppressClickToggle = false } = {}) => {
    if (!btn || !pop) return;
    btn.setAttribute('aria-expanded', 'false');
    const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
    const open = () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      if (typeof pop.onOpen === 'function') pop.onOpen();
      openPortaledPopover(btn, pop);
    };
    const close = () => closePortaledPopover(btn, pop);
    if (!suppressClickToggle) {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isOpen()) {
          close();
        } else {
          open();
        }
      });
    }
    if (openOnHover) {
      let hoverTimer = null;
      let closeTimer = null;
      const isHoverTarget = (node) => !!node && (btn.contains(node) || pop.contains(node));
      const scheduleOpen = () => {
        clearTimeout(closeTimer);
        if (isOpen()) return;
        hoverTimer = setTimeout(open, 80);
      };
      const scheduleClose = (event) => {
        clearTimeout(hoverTimer);
        if (isHoverTarget(event?.relatedTarget)) return;
        closeTimer = setTimeout(() => {
          const hovering = btn.matches(':hover') || pop.matches(':hover');
          if (!hovering) close();
        }, 120);
      };
      btn.addEventListener('mouseenter', scheduleOpen);
      btn.addEventListener('mouseleave', scheduleClose);
      pop.addEventListener('mouseenter', scheduleOpen);
      pop.addEventListener('mouseleave', scheduleClose);
    }
    const onDocClick = (event) => {
      if (!isOpen()) return;
      if (!pop.contains(event.target) && !btn.contains(event.target)) {
        close();
      }
    };
    documentRoot.addEventListener('click', onDocClick, { capture: true });
    pop.__btn = btn;
    pop.__close = close;
  };

  const buildIconButton = (icon, title) => {
    const btn = documentRoot.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary workspace-tech-panel-action workspace-tech-panel-data-action';
    btn.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    if (title) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    return btn;
  };

  const setFreezeState = (isOn) => {
    freezeEnabled = Boolean(isOn);
    if (!dataActions) return;
    const btn = dataActions.querySelector('[data-tech-panel-data-action="freeze"]');
    if (!btn) return;
    btn.classList.toggle('is-active', freezeEnabled);
    btn.setAttribute('aria-pressed', String(freezeEnabled));
  };

  const buildDataActions = () => {
    if (!dataActions) return;
    dataActions.innerHTML = '';

    const addColumnBtn = buildIconButton('bi-plus-lg', 'Add column');
    addColumnBtn.dataset.techPanelDataAction = 'add-column';
    addColumnBtn.addEventListener('click', () => {
      dockedHandles?.addColumn?.();
    });
    dataActions.appendChild(addColumnBtn);

    const freezeBtn = buildIconButton('bi-snow', 'Freeze first row/column');
    freezeBtn.dataset.techPanelDataAction = 'freeze';
    freezeBtn.setAttribute('aria-pressed', 'false');
    freezeBtn.addEventListener('click', () => {
      setFreezeState(!freezeEnabled);
      dockedHandles?.setFreeze?.(freezeEnabled);
    });
    dataActions.appendChild(freezeBtn);

    const duplicateBtn = buildIconButton('bi-files', 'Duplicate spreadsheet');
    duplicateBtn.dataset.techPanelDataAction = 'duplicate';
    duplicateBtn.addEventListener('click', () => {
      if (!dockedPanelId) return;
      safeDuplicatePanel(dockedPanelId);
    });
    dataActions.appendChild(duplicateBtn);

    const tipsBtn = buildIconButton('bi-lightbulb', 'Tips');
    tipsBtn.dataset.techPanelDataAction = 'tips';
    const tipsPopover = documentRoot.createElement('div');
    tipsPopover.className = 'workspace-panel-popover workspace-panel-popover--tips';
    tipsPopover.onOpen = () => {
      const tipsMarkup = dockedHandles?.getQuickTipsMarkup?.();
      if (!tipsMarkup) return;
      tipsPopover.innerHTML = `<div class="workspace-panel-popover-section">${tipsMarkup}</div>`;
    };
    registerPopoverButton(tipsBtn, tipsPopover, { openOnHover: true, suppressClickToggle: true });
    dataActions.appendChild(tipsBtn);

    const plotBtn = buildIconButton('bi-graph-up', 'Plot options');
    plotBtn.dataset.techPanelDataAction = 'plot';
    plotBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      dockedHandles?.triggerPlotFromHeader?.();
    });
    const plotPopover = documentRoot.createElement('div');
    plotPopover.className = 'workspace-panel-popover workspace-panel-popover--plot';
    plotPopover.onOpen = () => {
      const plotContent = dockedHandles?.getPlotPopoverContent?.();
      if (plotContent && !plotPopover.contains(plotContent)) {
        plotPopover.appendChild(plotContent);
      }
    };
    plotPopover.addEventListener('spreadsheet:close-popover', () => {
      plotPopover.__close?.();
    });
    registerPopoverButton(plotBtn, plotPopover, { openOnHover: true, suppressClickToggle: true });
    dataActions.appendChild(plotBtn);

    const extraBtn = buildIconButton('bi-sliders', 'Extra options');
    extraBtn.dataset.techPanelDataAction = 'extra';
    const extraPopover = documentRoot.createElement('div');
    extraPopover.className = 'workspace-panel-popover workspace-panel-popover--spreadsheet-extra';
    extraPopover.onOpen = () => {
      const extraContent = dockedHandles?.getExtraOptionsPopoverContent?.();
      if (extraContent && !extraPopover.contains(extraContent)) {
        extraPopover.appendChild(extraContent);
      }
    };
    registerPopoverButton(extraBtn, extraPopover, { openOnHover: true, suppressClickToggle: true });
    dataActions.appendChild(extraBtn);
  };

  const updateDockedState = () => {
    const panelRecord = dockedPanelId ? getPanelRecord(dockedPanelId) : null;
    emptyState.hidden = !!dockedPanelId;
    host.hidden = !dockedPanelId;
    if (panel) {
      panel.dataset.dockedSpreadsheet = dockedPanelId ? 'true' : 'false';
      if (dockedPanelId) {
        panel.dataset.dockedPanelId = dockedPanelId;
      } else {
        delete panel.dataset.dockedPanelId;
      }
    }
    if (dataTitle) {
      dataTitle.textContent = panelRecord?.title?.trim?.()
        || panelRecord?.title
        || 'Spreadsheet';
      dataTitle.hidden = !dockedPanelId;
    }
    if (dataActions) {
      dataActions.hidden = !dockedPanelId;
    }
    if (openCanvasBtn) {
      openCanvasBtn.disabled = !dockedPanelId;
    }
  };

  const teardownDocked = () => {
    if (lockObserver) {
      lockObserver.disconnect();
      lockObserver = null;
    }
    if (dockedHandles?.dispose) {
      dockedHandles.dispose();
    }
    dockedHandles = null;
    dockedRoot = null;
    host.innerHTML = '';
  };

  const syncLockState = (panelRoot) => {
    if (!dockedRoot) return;
    const locked = !!panelRoot?.classList?.contains('is-edit-locked');
    dockedRoot.classList.toggle('is-edit-locked', locked);
  };

  const mountDockedPanel = (panelId) => {
    const panelRecord = getPanelRecord(panelId);
    if (!panelRecord || panelRecord.type !== 'spreadsheet') return false;
    teardownDocked();
    setFreezeState(false);
    dockedRoot = documentRoot.createElement('div');
    dockedRoot.className = 'workspace-tech-panel-data-root';
    const contentHost = documentRoot.createElement('div');
    contentHost.className = 'workspace-tech-panel-data-content';
    dockedRoot.appendChild(contentHost);
    host.appendChild(dockedRoot);

    const panelState = {
      ...panelRecord,
      content: getPanelContent(panelId) || panelRecord.content
    };
    dockedHandles = spreadsheetPanelType.mountContent({
      panelId,
      panelState,
      rootEl: dockedRoot,
      hostEl: contentHost,
      actions: {
        setPanelContent: safeSetPanelContent,
        handleHeaderAction: safeHandleHeaderAction
      },
      selectors: {
        listPlotPanels,
        getPanelContent
      }
    });

    const panelDom = getPanelDom(panelId);
    const panelRoot = panelDom?.rootEl;
    if (panelRoot && typeof MutationObserver !== 'undefined') {
      lockObserver = new MutationObserver(() => syncLockState(panelRoot));
      lockObserver.observe(panelRoot, { attributes: true, attributeFilter: ['class'] });
    }
    syncLockState(panelRoot);
    return true;
  };

  const showDataTab = () => {
    sidePanelController?.setMode?.('panel', { visibleOverride: true });
    pinController?.setMode?.('panel', { persist: false });
    sidePanelController?.setActiveTab?.('data');
  };

  const dockPanel = (panelId) => {
    if (!panelId) return false;
    const panelRecord = getPanelRecord(panelId);
    if (!panelRecord || panelRecord.type !== 'spreadsheet') return false;
    if (dockedPanelId && dockedPanelId !== panelId) {
      undockPanel();
    }
    dockedPanelId = panelId;
    writeDocked(panelId);
    safeSetGraphVisibility(panelId, true);
    mountDockedPanel(panelId);
    buildDataActions();
    updateDockedState();
    showDataTab();
    return true;
  };

  const undockPanel = () => {
    if (!dockedPanelId) return false;
    const panelId = dockedPanelId;
    dockedPanelId = null;
    writeDocked(null);
    safeSetGraphVisibility(panelId, false);
    safeBringPanelToFront(panelId);
    teardownDocked();
    updateDockedState();
    return true;
  };

  const restoreDocked = () => {
    if (dockedPanelId) return true;
    const stored = readDocked(null);
    if (!stored) return false;
    const record = getPanelRecord(stored);
    if (!record || record.type !== 'spreadsheet') {
      writeDocked(null);
      return false;
    }
    return dockPanel(stored);
  };

  if (openCanvasBtn) {
    openCanvasBtn.addEventListener('click', () => {
      undockPanel();
    });
  }

  ensureHeaderItems();
  buildDataActions();
  updateDockedState();

  return {
    getMenu: () => menu,
    dockPanel,
    undockPanel,
    restoreDocked,
    isDocked: () => !!dockedPanelId,
    getDockedPanelId: () => dockedPanelId,
    setSidePanelController(controller) {
      sidePanelController = controller;
    },
    setPinController(controller) {
      pinController = controller;
    },
    setDuplicatePanel(handler) {
      safeDuplicatePanel = typeof handler === 'function' ? handler : () => {};
    },
    teardown() {
      teardownDocked();
    }
  };
}
