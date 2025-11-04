import { render as renderTreeView } from '../../../../workspace/browser/treeView.js';
import { escapeHtml } from '../../../utils/dom.js';
import { toHexColor } from '../../../utils/styling.js';

/**
 * Render the workspace browser DOM using the prepared tree state.
 *
 * @param {object} ctx Runtime context exposed by workspaceRuntime.
 * @param {object} state Tree state returned from createBrowserTreeState.
 */
export function renderBrowserTree(ctx, state) {
  const {
    panelDom,
    sections,
    sectionOrder,
    defaultSectionId,
    ensureArray,
    getPanelTraces,
    normalizePanelTraces,
    renderPlot,
    updateTraceChip,
    pushHistory,
    history,
    persist,
    updateHistoryButtons,
    addGraphToSection,
    toggleGraphVisibility,
    togglePanelCollapsedState,
    toggleSectionCollapsedState,
    toggleSectionVisibility,
    moveTrace,
    moveGraph,
    removePanel,
    deleteSectionInteractive,
    deleteGraphInteractive,
    requestGraphFileBrowse,
    showToast,
    getPanelRecord,
    panelsModel,
    queueSectionRename,
    startSectionRename,
    getPendingRenameSectionId,
    clearPendingRenameSectionId,
    setDropTarget,
    getDragState,
    setDragState,
    traceDragMime,
    applyActivePanelState,
    ensureChipPanelsMount,
    refreshPanelVisibility,
    isSectionVisible,
    focusSectionById,
    focusPanelById,
    bringPanelToFront,
    createSection,
    renameSection,
    setSectionCollapsed,
    getPanelFigure,
    setActivePanel,
    requestRender,
    activePanelId
  } = ctx;

  const { term, sortedPanels, treeSections, treeViewPanels } = state;

  const tree = panelDom?.tree;
  if (!tree) return;

  tree.innerHTML = '';

  const sanitizedSections = treeSections.map((section) => ({
    ...section,
    name: escapeHtml(section.name || 'Group')
  }));

  const sanitizedPanels = new Map();
  treeViewPanels.forEach((panelList, sectionId) => {
    sanitizedPanels.set(
      sectionId,
      panelList.map((panel) => ({
        id: panel.id,
        name: escapeHtml(panel.name || ''),
        hidden: panel.hidden === true
      }))
    );
  });

  renderTreeView({
    rootEl: tree,
    sections: sanitizedSections,
    panelsBySection: sanitizedPanels,
    activePanelId
  });

  const rerender = () => {
    if (typeof requestRender === 'function') {
      requestRender();
    }
  };

  if (!sortedPanels.length) {
    if (panelDom.empty) {
      panelDom.empty.dataset.mode = 'search-empty';
      panelDom.empty.style.display = '';
      panelDom.empty.textContent = term
        ? 'No graphs match your search.'
        : 'Drop files or use the toolbar to add graphs.';
    }
    ensureChipPanelsMount();
    refreshPanelVisibility();
    return;
  }

  const panelsBySection = new Map();
  sections.forEach((section, id) => {
    panelsBySection.set(id, []);
  });

  sortedPanels.forEach((item) => {
    const sectionId = sections.has(item.meta.sectionId) ? item.meta.sectionId : defaultSectionId;
    item.meta.sectionId = sectionId;
    if (!panelsBySection.has(sectionId)) {
      panelsBySection.set(sectionId, []);
    }
    panelsBySection.get(sectionId).push(item);
  });

  let renderedSomething = false;

  const makeTraceRows = (panelItem) => {
    const { meta, panelId, record } = panelItem;
    const resolvedPanelId = meta.id || panelId;
    const traces = getPanelTraces(resolvedPanelId);
    const labelIndex = meta.index || record?.index || 0;
    const label = labelIndex ? `Graph ${labelIndex}` : 'Graph';
    const graphMatches = !term || label.toLowerCase().includes(term);
    const rows = traces.map((trace, idx) => {
      const name = trace?.name || `Trace ${idx + 1}`;
      const matchesTrace = !term || name.toLowerCase().includes(term);
      return { trace, idx, name, matchesTrace };
    });
    const visibleRows = term ? rows.filter((row) => row.matchesTrace || graphMatches) : rows;
    return {
      rows: visibleRows,
      graphMatches,
      hasVisible: visibleRows.length > 0,
      panelId: resolvedPanelId
    };
  };

  const buildTraceRow = (panelItem, rowInfo) => {
    const panelMeta = panelItem.meta;
    const panelId = panelMeta.id || panelItem.panelId;
    let trace = rowInfo.trace;
    const row = document.createElement('div');
    row.className = 'folder-trace';
    row.dataset.panelId = panelId;
    row.dataset.traceIndex = String(rowInfo.idx);
    let traceId = trace?._canvasId || null;
    if (!traceId) {
      const normalized = normalizePanelTraces(panelId);
      const refreshedTraces = ensureArray(normalized?.data);
      traceId = refreshedTraces[rowInfo.idx]?._canvasId;
      trace = refreshedTraces[rowInfo.idx] || trace;
    }
    row.dataset.id = `${panelId}:${traceId || rowInfo.idx}`;
    if (term && !rowInfo.matchesTrace) {
      row.classList.add('is-muted');
    }

    const safeName = escapeHtml(rowInfo.name || `Trace ${rowInfo.idx + 1}`);
    row.innerHTML = `
      <span class="drag-handle bi bi-grip-vertical" title="Drag trace"></span>
      <input class="form-check-input vis" type="checkbox" ${trace.visible !== false ? 'checked' : ''} title="Toggle visibility">
      <button class="line-chip" type="button" aria-label="Edit line style"></button>
      <button class="color-dot" type="button" style="--c:${toHexColor(trace.line?.color || '#1f77b4')}" title="Pick colour" hidden></button>
      <input class="color form-control form-control-color form-control-sm" type="color" value="${toHexColor(trace.line?.color || '#1f77b4')}" title="Colour picker" hidden>
      <input class="form-control form-control-sm rename" type="text" value="${safeName}" title="Double-click to rename" readonly>
      <button class="trace-info-icon" type="button" title="Trace info"><i class="bi bi-info-circle"></i></button>
      <select class="dash form-select form-select-sm" title="Line style" hidden>
        <option value="solid" ${trace.line?.dash === 'solid' ? 'selected' : ''}>Solid</option>
        <option value="dot" ${trace.line?.dash === 'dot' ? 'selected' : ''}>Dots</option>
        <option value="dash" ${trace.line?.dash === 'dash' ? 'selected' : ''}>Dash</option>
        <option value="longdash" ${trace.line?.dash === 'longdash' ? 'selected' : ''}>Long dash</option>
        <option value="dashdot" ${trace.line?.dash === 'dashdot' ? 'selected' : ''}>Dash + dot</option>
        <option value="longdashdot" ${trace.line?.dash === 'longdashdot' ? 'selected' : ''}>Long dash + dot</option>
      </select>
      <input class="opacity form-range" type="range" min="0.1" max="1" step="0.05" value="${trace.opacity ?? 1}" title="Opacity" hidden>
      <button class="trace-remove" type="button" title="Remove trace"><i class="bi bi-x-circle"></i></button>
    `;

    row.draggable = false;
    let dragFromHandle = false;
    const setDragFromHandle = (enabled) => {
      dragFromHandle = !!enabled;
      row.draggable = dragFromHandle;
    };
    const dragHandle = row.querySelector('.drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('pointerdown', (evt) => {
        if (typeof evt.button === 'number' && evt.button !== 0) return;
        setDragFromHandle(true);
      });
      dragHandle.addEventListener('pointerup', () => setDragFromHandle(false));
      dragHandle.addEventListener('pointercancel', () => setDragFromHandle(false));
    }

    updateTraceChip(row, trace);

    const visToggle = row.querySelector('.vis');
    visToggle?.addEventListener('change', () => {
      pushHistory();
      const figure = getPanelFigure(panelId);
      const tracesData = ensureArray(figure.data);
      const current = tracesData[rowInfo.idx];
      if (!current) {
        history.rewind();
        return;
      }
      tracesData[rowInfo.idx] = {
        ...current,
        visible: visToggle.checked
      };
      figure.data = tracesData;
      normalizePanelTraces(panelId, figure);
      renderPlot(panelId);
      persist();
      rerender();
      updateHistoryButtons();
    });

    const renameInput = row.querySelector('.rename');
    renameInput?.addEventListener('dblclick', (evt) => {
      renameInput.readOnly = false;
      renameInput.focus();
      renameInput.select();
      evt.stopPropagation();
    });
    renameInput?.addEventListener('blur', () => {
      renameInput.readOnly = true;
      const value = renameInput.value.trim();
      if (!value) {
        rerender();
        return;
      }
      const figure = getPanelFigure(panelId);
      const tracesData = ensureArray(figure.data);
      const current = tracesData[rowInfo.idx];
      if (!current) return;
      if ((current.name || '').trim() === value) return;
      pushHistory();
      current.name = value;
      figure.data = tracesData;
      normalizePanelTraces(panelId, figure);
      renderPlot(panelId);
      rerender();
      persist();
      updateHistoryButtons();
    });
    renameInput?.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        renameInput.blur();
      } else if (evt.key === 'Escape') {
        const tracesData = getPanelTraces(panelId);
        const current = tracesData[rowInfo.idx];
        renameInput.value = current?.name || `Trace ${rowInfo.idx + 1}`;
        renameInput.blur();
      }
    });

    const removeBtn = row.querySelector('.trace-remove');
    removeBtn?.addEventListener('click', () => {
      pushHistory();
      const result = panelsModel.removeTrace(panelId, rowInfo.idx);
      if (!result) {
        history.rewind();
        return;
      }
      const remaining = ensureArray(result.figure?.data);
      if (!remaining.length) {
        removePanel(panelId, { pushToHistory: false });
      } else {
        normalizePanelTraces(panelId, result.figure);
        renderPlot(panelId);
      }
      rerender();
      persist();
      updateHistoryButtons();
    });

    row.addEventListener('dragstart', (event) => {
      if (!dragFromHandle) {
        event.preventDefault();
        setDragFromHandle(false);
        return;
      }
      setDragState({ type: 'trace', panelId, traceIndex: rowInfo.idx });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(traceDragMime, JSON.stringify(getDragState()));
      event.dataTransfer.setData('text/plain', `${panelId}:${rowInfo.idx}`);
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      setDragState(null);
      setDropTarget(null);
      setDragFromHandle(false);
    });

    return row;
  };

  const buildGraphNode = (panelItem, sectionId, depth) => {
    const { meta, panelId, record } = panelItem;
    const resolvedPanelId = meta.id || panelId;
    const traceInfo = makeTraceRows(panelItem);
    if (!traceInfo.hasVisible) return null;
    const graphIndex = meta.index || record?.index || 0;
    const graphLabel = graphIndex ? `Graph ${graphIndex}` : 'Graph';
    const collapsed = meta.collapsed === true;
    const hidden = meta.hidden === true;
    const sectionVisibility = isSectionVisible(sectionId);
    const graphVisible = !hidden;
    const node = document.createElement('div');
    node.className = 'folder-node graph-node';
    node.dataset.type = 'graph';
    node.dataset.id = resolvedPanelId;
    node.dataset.panelId = resolvedPanelId;
    node.dataset.sectionId = sectionId;
    node.dataset.depth = String(depth + 1);
    const fullyVisible = sectionVisibility && graphVisible;
    node.dataset.visible = fullyVisible ? 'true' : 'false';
    node.dataset.sectionVisible = sectionVisibility ? 'true' : 'false';
    node.dataset.graphVisible = graphVisible ? 'true' : 'false';
    node.classList.toggle('graph-hidden', !graphVisible);

    const header = document.createElement('div');
    header.className = 'folder-header graph-header';
    header.dataset.panelId = resolvedPanelId;
    header.dataset.sectionId = sectionId;
    header.dataset.depth = String(depth + 1);
    header.setAttribute('draggable', 'true');
    if (!graphVisible) {
      header.classList.add('is-hidden');
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.innerHTML = `<i class="bi ${collapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>`;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('draggable', 'false');
    header.appendChild(toggle);

    const name = document.createElement('span');
    name.className = 'folder-name graph-name';
    name.textContent = graphLabel;
    if (!graphVisible) {
      name.classList.add('is-muted');
    }
    if (term && !traceInfo.graphMatches) {
      name.classList.add('is-muted');
    }
    header.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'folder-actions graph-actions';

    const graphVisibilityBtn = document.createElement('button');
    graphVisibilityBtn.className = 'btn-icon graph-visibility';
    graphVisibilityBtn.type = 'button';
    graphVisibilityBtn.dataset.panelId = resolvedPanelId;
    graphVisibilityBtn.title = graphVisible ? 'Hide graph' : 'Show graph';
    graphVisibilityBtn.setAttribute('draggable', 'false');
    graphVisibilityBtn.innerHTML = `<i class="bi ${graphVisible ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
    actions.appendChild(graphVisibilityBtn);

    const graphBrowseBtn = document.createElement('button');
    graphBrowseBtn.className = 'btn-icon graph-browse';
    graphBrowseBtn.type = 'button';
    graphBrowseBtn.dataset.panelId = resolvedPanelId;
    graphBrowseBtn.title = 'Add traces from file';
    graphBrowseBtn.setAttribute('draggable', 'false');
    graphBrowseBtn.innerHTML = '<i class="bi bi-file-earmark-plus"></i>';
    actions.appendChild(graphBrowseBtn);

    const graphDeleteBtn = document.createElement('button');
    graphDeleteBtn.className = 'btn-icon graph-delete';
    graphDeleteBtn.type = 'button';
    graphDeleteBtn.dataset.panelId = resolvedPanelId;
    graphDeleteBtn.title = 'Delete graph';
    graphDeleteBtn.setAttribute('draggable', 'false');
    graphDeleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
    actions.appendChild(graphDeleteBtn);

    header.appendChild(actions);
    node.appendChild(header);

    const children = document.createElement('div');
    children.className = 'folder-children';
    children.style.display = collapsed ? 'none' : '';

    const tracesWrap = document.createElement('div');
    tracesWrap.className = 'folder-traces';
    if (traceInfo.rows.length) {
      traceInfo.rows.forEach((rowInfo) => {
        const row = buildTraceRow(panelItem, rowInfo);
        tracesWrap.appendChild(row);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'text-muted small px-2 py-1';
      empty.textContent = term ? 'No traces match search.' : 'No traces in this graph yet.';
      tracesWrap.appendChild(empty);
    }

    children.appendChild(tracesWrap);
    node.appendChild(children);

    graphVisibilityBtn.addEventListener('click', () => {
      toggleGraphVisibility(resolvedPanelId);
    });

    graphBrowseBtn.addEventListener('click', () => {
      requestGraphFileBrowse?.(resolvedPanelId);
    });

    graphDeleteBtn.addEventListener('click', () => {
      deleteGraphInteractive(resolvedPanelId);
    });

    toggle.addEventListener('click', () => {
      togglePanelCollapsedState(resolvedPanelId);
    });

    header.addEventListener('click', (evt) => {
      if (evt.target.closest('.btn-icon')) return;
      bringPanelToFront(resolvedPanelId, { scrollBrowser: false });
    });

    return node;
  };

  const renderSectionNode = (sectionId, depth = 0) => {
    const section = sections.get(sectionId);
    if (!section) return null;

    const childIds = Array.isArray(section.children) ? section.children : [];
    const sectionMatches = !term || (section.name || '').toLowerCase().includes(term);

    const childNodes = [];
    childIds.forEach((childId) => {
      const childNode = renderSectionNode(childId, depth + 1);
      if (childNode) childNodes.push(childNode);
    });

    const graphNodes = [];
    (panelsBySection.get(sectionId) || []).forEach((panelItem) => {
      const graphNode = buildGraphNode(panelItem, sectionId, depth);
      if (graphNode) graphNodes.push(graphNode);
    });

    const hasChildContent = childNodes.length > 0;
    const hasGraphContent = graphNodes.length > 0;
    const hasSearchContent = sectionMatches || hasChildContent || hasGraphContent;

    if (term && !hasSearchContent) {
      return null;
    }

    const node = document.createElement('div');
    node.className = 'folder-node section-node';
    node.dataset.type = 'section';
    node.dataset.sectionId = sectionId;
    node.dataset.depth = String(depth);
    node.dataset.parentId = section.parentId || '';
    node.dataset.locked = section.locked ? 'true' : 'false';
    node.dataset.visible = section.visible === false ? 'false' : 'true';
    if (!section.locked) {
      node.setAttribute('draggable', 'true');
    }

    const header = document.createElement('div');
    header.className = 'folder-header section-header';
    header.dataset.sectionId = sectionId;
    header.dataset.depth = String(depth);
    if (section.visible === false) {
      header.classList.add('is-hidden');
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.innerHTML = `<i class="bi ${section.collapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>`;
    toggle.setAttribute('aria-expanded', String(!section.collapsed));
    header.appendChild(toggle);

    const name = document.createElement('span');
    name.className = 'folder-name section-name';
    name.dataset.sectionId = sectionId;
    name.dataset.depth = String(depth);
    name.textContent = section.name || (depth === 0 ? 'Group' : 'Subgroup');
    header.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'folder-actions';

    const visible = section.visible !== false;
    const visibilityBtn = document.createElement('button');
    visibilityBtn.className = 'btn-icon section-visibility';
    visibilityBtn.type = 'button';
    visibilityBtn.dataset.sectionId = sectionId;
    visibilityBtn.title = visible ? 'Hide group' : 'Show group';
    visibilityBtn.innerHTML = `<i class="bi ${visible ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
    actions.appendChild(visibilityBtn);

    const addGraphBtn = document.createElement('button');
    addGraphBtn.className = 'btn-icon section-add-graph';
    addGraphBtn.type = 'button';
    addGraphBtn.dataset.sectionId = sectionId;
    addGraphBtn.title = 'Add graph to this group';
    addGraphBtn.innerHTML = '<i class="bi bi-plus-square"></i>';
    actions.appendChild(addGraphBtn);

    let addSubBtn = null;
    if (depth === 0) {
      addSubBtn = document.createElement('button');
      addSubBtn.className = 'btn-icon section-add-sub';
      addSubBtn.type = 'button';
      addSubBtn.dataset.sectionId = sectionId;
      addSubBtn.title = 'Add subgroup';
      addSubBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
      actions.appendChild(addSubBtn);
    }

    if (!section.locked) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon section-delete';
      deleteBtn.type = 'button';
      deleteBtn.dataset.sectionId = sectionId;
      deleteBtn.title = 'Delete group';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      actions.appendChild(deleteBtn);
    }

    header.appendChild(actions);
    node.appendChild(header);

    const container = document.createElement('div');
    container.className = 'folder-children';
    container.dataset.sectionId = sectionId;
    container.style.display = section.collapsed ? 'none' : '';

    childNodes.forEach((childNode) => container.appendChild(childNode));
    graphNodes.forEach((graphNode) => container.appendChild(graphNode));

    if (!childNodes.length && !graphNodes.length && !term) {
      const empty = document.createElement('div');
      empty.className = 'text-muted small px-2 py-1';
      empty.textContent = depth === 0 ? 'No graphs in this group yet.' : 'No graphs in this subgroup yet.';
      container.appendChild(empty);
    }

    node.appendChild(container);
    renderedSomething = true;

    toggle.addEventListener('click', () => {
      toggleSectionCollapsedState(sectionId);
    });

    visibilityBtn.addEventListener('click', () => {
      toggleSectionVisibility(sectionId);
    });

    addGraphBtn.addEventListener('click', () => {
      addGraphToSection(sectionId);
      rerender();
    });

    addSubBtn?.addEventListener('click', () => {
      pushHistory();
      const section = createSection(null, { parentId: sectionId });
      if (section?.id) {
        queueSectionRename(section.id);
      }
      persist();
      updateHistoryButtons();
      rerender();
    });

    const deleteBtn = actions.querySelector('.section-delete');
    deleteBtn?.addEventListener('click', () => {
      deleteSectionInteractive(sectionId);
    });

    header.addEventListener('click', (evt) => {
      if (evt.target.closest('.btn-icon')) return;
      focusSectionById(sectionId, { scrollBrowser: false });
    });

    return node;
  };

  const topLevelIds = sectionOrder.filter((id) => sections.has(id));
  topLevelIds.forEach((id) => {
    const node = renderSectionNode(id, 0);
    if (node) {
      tree.appendChild(node);
    }
  });

  sections.forEach((section) => {
    if (!section.parentId && !topLevelIds.includes(section.id)) {
      const node = renderSectionNode(section.id, 0);
      if (node) {
        tree.appendChild(node);
      }
    }
  });

  if (!renderedSomething) {
    if (panelDom.empty) {
      panelDom.empty.dataset.mode = 'search-empty';
      panelDom.empty.style.display = '';
      panelDom.empty.textContent = term
        ? 'No graphs match your search.'
        : 'Drop files or use the toolbar to add graphs.';
    }
  } else if (panelDom.empty) {
    delete panelDom.empty.dataset.mode;
    panelDom.empty.style.display = 'none';
  }

  applyActivePanelState();
  ensureChipPanelsMount();
  refreshPanelVisibility();

  const pendingRenameId = getPendingRenameSectionId?.();
  if (pendingRenameId) {
    const nameEl = panelDom.tree?.querySelector(`.section-name[data-section-id="${pendingRenameId}"]`);
    clearPendingRenameSectionId?.();
    if (nameEl) {
      startSectionRename(pendingRenameId, nameEl, { selectAll: true });
    }
  }
}
