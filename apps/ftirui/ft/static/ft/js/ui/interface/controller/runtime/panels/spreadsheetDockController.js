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
  const getPanelFigure = typeof selectors.getPanelFigure === 'function'
    ? selectors.getPanelFigure
    : () => ({ data: [], layout: {} });
  const getPanelDom = typeof selectors.getPanelDom === 'function'
    ? selectors.getPanelDom
    : () => null;
  const readDocked = typeof preferences?.readSpreadsheetDock === 'function'
    ? preferences.readSpreadsheetDock
    : () => null;
  const writeDocked = typeof preferences?.writeSpreadsheetDock === 'function'
    ? preferences.writeSpreadsheetDock
    : () => {};
  const readDockedState = typeof preferences?.readSpreadsheetDockState === 'function'
    ? preferences.readSpreadsheetDockState
    : null;
  const writeDockedState = typeof preferences?.writeSpreadsheetDockState === 'function'
    ? preferences.writeSpreadsheetDockState
    : null;

  let sidePanelController = toolbar.sidePanelController || null;
  let pinController = toolbar.pinController || null;
  let dockedPanelIds = [];
  let activeDockedPanelId = null;
  let dockedHandles = null;
  let dockedRoot = null;
  let lockObserver = null;
  let freezeEnabled = false;
  const freezeByPanelId = new Map();
  let dataActions = null;
  let dataTitle = null;

  menu.className = 'workspace-tech-panel-data-menu';
  const emptyState = documentRoot.createElement('div');
  emptyState.className = 'workspace-tech-panel-data-empty';
  emptyState.textContent = 'No spreadsheet docked yet.';
  const pillStrip = documentRoot.createElement('div');
  pillStrip.className = 'workspace-tech-panel-worksheets-strip';
  pillStrip.hidden = true;
  const linkedGraphStrip = documentRoot.createElement('div');
  linkedGraphStrip.className = 'workspace-tech-panel-linked-graphs-strip';
  linkedGraphStrip.hidden = true;
  const host = documentRoot.createElement('div');
  host.className = 'workspace-tech-panel-data-host';
  menu.appendChild(emptyState);
  menu.appendChild(pillStrip);
  menu.appendChild(linkedGraphStrip);
  menu.appendChild(host);

  const persistDockState = () => {
    if (writeDockedState) {
      writeDockedState({
        ids: dockedPanelIds.slice(),
        activeId: activeDockedPanelId || null
      });
      return;
    }
    writeDocked(activeDockedPanelId || null);
  };

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

  const placePopover = (btn, pop, { offsetX = 0, offsetY = 0 } = {}) => {
    if (!btn || !pop) return;
    const btnRect = btn.getBoundingClientRect?.();
    if (!btnRect) return;
    const panelRect = panel?.getBoundingClientRect?.();
    const popRect = pop.getBoundingClientRect?.();
    const popWidth = Number.isFinite(popRect?.width) ? popRect.width : 0;
    const popHeight = Number.isFinite(popRect?.height) ? popRect.height : 0;
    const sidebarLeft = Number.isFinite(panelRect?.left) ? panelRect.left : btnRect.left;
    const left = sidebarLeft - popWidth - offsetX;
    // Side placement uses translateY(-50%), so top is the popover vertical center.
    // To align popover top edge with the button top edge: centerY = buttonTop + popoverHeight/2.
    const top = btnRect.top + (popHeight / 2) + offsetY;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.bottom = 'auto';
    pop.style.right = 'auto';
    pop.dataset.popPlacement = 'side';
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
    requestAnimationFrame(pop.__reflow);
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
    delete pop.dataset.popPlacement;
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
      if (activeDockedPanelId) {
        freezeByPanelId.set(activeDockedPanelId, freezeEnabled);
      }
      dockedHandles?.setFreeze?.(freezeEnabled);
    });
    dataActions.appendChild(freezeBtn);

    const duplicateBtn = buildIconButton('bi-files', 'Duplicate spreadsheet');
    duplicateBtn.dataset.techPanelDataAction = 'duplicate';
    duplicateBtn.addEventListener('click', () => {
      if (!activeDockedPanelId) return;
      safeDuplicatePanel(activeDockedPanelId);
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

  const collectLinkedGraphs = (spreadsheetPanelId) => {
    if (!spreadsheetPanelId) return [];
    const records = listPlotPanels();
    if (!Array.isArray(records)) return [];
    return records
      .map((record) => {
        const panelId = record?.id;
        if (!panelId || panelId === spreadsheetPanelId) return null;
        const figure = getPanelFigure(panelId) || { data: [] };
        const traces = Array.isArray(figure?.data) ? figure.data : [];
        const linkedTraceCount = traces.reduce((count, trace) => {
          const sourcePanelId = trace?.meta?.sourcePanelId;
          return count + (sourcePanelId === spreadsheetPanelId ? 1 : 0);
        }, 0);
        if (!linkedTraceCount) return null;
        return {
          id: panelId,
          title: record?.title || 'Graph',
          index: Number(record?.index) || 0,
          linkedTraceCount
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.index - right.index);
  };

  const updateLinkedGraphStrip = () => {
    linkedGraphStrip.innerHTML = '';
    if (!activeDockedPanelId) {
      linkedGraphStrip.hidden = true;
      return;
    }
    const linkedGraphs = collectLinkedGraphs(activeDockedPanelId);
    if (!linkedGraphs.length) {
      linkedGraphStrip.hidden = true;
      return;
    }
    linkedGraphStrip.hidden = false;
    linkedGraphs.forEach((entry) => {
      const button = documentRoot.createElement('button');
      button.type = 'button';
      button.className = 'workspace-tech-panel-linked-graph-pill';
      button.textContent = entry.title || 'Graph';
      button.title = `${entry.title || 'Graph'} • ${entry.linkedTraceCount} linked trace${entry.linkedTraceCount === 1 ? '' : 's'}`;
      button.addEventListener('click', () => {
        safeBringPanelToFront(entry.id);
      });
      linkedGraphStrip.appendChild(button);
    });
  };

  const updateDockedState = () => {
    dockedPanelIds = dockedPanelIds.filter((panelId) => {
      const record = getPanelRecord(panelId);
      return !!record && record.type === 'spreadsheet';
    });
    if (!activeDockedPanelId || !dockedPanelIds.includes(activeDockedPanelId)) {
      activeDockedPanelId = dockedPanelIds[0] || null;
    }
    const panelRecord = activeDockedPanelId ? getPanelRecord(activeDockedPanelId) : null;
    emptyState.hidden = !!activeDockedPanelId;
    host.hidden = !activeDockedPanelId;
    pillStrip.hidden = dockedPanelIds.length === 0;
    if (panel) {
      panel.dataset.dockedSpreadsheet = activeDockedPanelId ? 'true' : 'false';
      if (activeDockedPanelId) {
        panel.dataset.dockedPanelId = activeDockedPanelId;
      } else {
        delete panel.dataset.dockedPanelId;
      }
    }
    pillStrip.innerHTML = '';
    dockedPanelIds.forEach((panelId) => {
      const record = getPanelRecord(panelId);
      if (!record || record.type !== 'spreadsheet') return;
      const content = getPanelContent(panelId) || record.content || {};
      const title = record?.title?.trim?.() || record?.title || 'Worksheet';
      const columnCount = Array.isArray(content?.columns) ? content.columns.length : 0;
      const rowCount = Array.isArray(content?.rows) ? content.rows.length : 0;
      const pill = documentRoot.createElement('button');
      pill.type = 'button';
      pill.className = 'workspace-tech-panel-worksheet-pill';
      if (panelId === activeDockedPanelId) {
        pill.classList.add('is-active');
      }
      pill.textContent = title;
      pill.title = `${title} \u2022 ${columnCount} col${columnCount === 1 ? '' : 's'} \u2022 ${rowCount} row${rowCount === 1 ? '' : 's'}`;
      pill.addEventListener('click', () => {
        if (panelId === activeDockedPanelId) return;
        activeDockedPanelId = panelId;
        persistDockState();
        mountDockedPanel(panelId);
        updateDockedState();
      });
      pillStrip.appendChild(pill);
    });
    updateLinkedGraphStrip();
    if (dataTitle) {
      dataTitle.textContent = panelRecord?.title?.trim?.()
        || panelRecord?.title
        || 'Spreadsheet';
      dataTitle.hidden = !activeDockedPanelId;
    }
    if (dataActions) {
      dataActions.hidden = !activeDockedPanelId;
    }
    if (openCanvasBtn) {
      openCanvasBtn.disabled = !activeDockedPanelId;
    }
    persistDockState();
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
    setFreezeState(freezeByPanelId.get(panelId) === true);
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
    dockedHandles?.setFreeze?.(freezeEnabled);
    return true;
  };

  const showWorksheetsTab = () => {
    pinController?.setMode?.('panel');
    sidePanelController?.setActiveTab?.('worksheets');
    sidePanelController?.setMode?.('panel', { visibleOverride: true });
  };

  const dockPanel = (panelId) => {
    if (!panelId) return false;
    const panelRecord = getPanelRecord(panelId);
    if (!panelRecord || panelRecord.type !== 'spreadsheet') return false;
    if (!dockedPanelIds.includes(panelId)) {
      dockedPanelIds.push(panelId);
      safeSetGraphVisibility(panelId, true);
    }
    activeDockedPanelId = panelId;
    persistDockState();
    mountDockedPanel(panelId);
    buildDataActions();
    updateDockedState();
    showWorksheetsTab();
    return true;
  };

  const undockPanel = (panelId = activeDockedPanelId) => {
    if (!panelId) return false;
    if (!dockedPanelIds.includes(panelId)) return false;
    dockedPanelIds = dockedPanelIds.filter((id) => id !== panelId);
    freezeByPanelId.delete(panelId);
    safeSetGraphVisibility(panelId, false);
    safeBringPanelToFront(panelId);
    if (activeDockedPanelId === panelId) {
      activeDockedPanelId = dockedPanelIds[0] || null;
      if (activeDockedPanelId) {
        mountDockedPanel(activeDockedPanelId);
      } else {
        teardownDocked();
      }
    }
    persistDockState();
    updateDockedState();
    return true;
  };

  const restoreDocked = () => {
    if (activeDockedPanelId || dockedPanelIds.length) return true;
    const state = readDockedState?.(null);
    let ids = Array.isArray(state?.ids) ? state.ids : [];
    let activeId = typeof state?.activeId === 'string' ? state.activeId : null;
    if (!ids.length) {
      const legacy = readDocked(null);
      if (legacy) {
        ids = [legacy];
        activeId = legacy;
      }
    }
    const restoredIds = ids
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index)
      .filter((entry) => {
        const record = getPanelRecord(entry);
        return !!record && record.type === 'spreadsheet';
      });
    if (!restoredIds.length) {
      persistDockState();
      return false;
    }
    dockedPanelIds = restoredIds;
    activeDockedPanelId = restoredIds.includes(activeId) ? activeId : restoredIds[0];
    restoredIds.forEach((entry) => safeSetGraphVisibility(entry, true));
    mountDockedPanel(activeDockedPanelId);
    buildDataActions();
    updateDockedState();
    persistDockState();
    // Respect persisted sidebar open/close state; restoring docked worksheets
    // should not force the side panel open.
    return true;
  };

  if (openCanvasBtn) {
    openCanvasBtn.addEventListener('click', () => {
      undockPanel(activeDockedPanelId);
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
    isDocked: () => dockedPanelIds.length > 0,
    getDockedPanelId: () => activeDockedPanelId,
    getDockedPanelIds: () => dockedPanelIds.slice(),
    setSidePanelController(controller) {
      sidePanelController = controller;
    },
    setPinController(controller) {
      pinController = controller;
    },
    setDuplicatePanel(handler) {
      safeDuplicatePanel = typeof handler === 'function' ? handler : () => {};
    },
    handlePanelUpdated(panelId) {
      if (!activeDockedPanelId) return;
      if (!panelId) {
        updateLinkedGraphStrip();
        return;
      }
      if (panelId === activeDockedPanelId || collectLinkedGraphs(activeDockedPanelId).some((entry) => entry.id === panelId)) {
        updateLinkedGraphStrip();
      }
    },
    teardown() {
      teardownDocked();
    }
  };
}
