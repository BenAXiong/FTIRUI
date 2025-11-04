import * as dragDrop from '../../../../workspace/browser/dragDrop.js';

/**
 * Attach drag/drop handlers for the workspace browser tree.
 *
 * @param {object} ctx Runtime context with dependencies supplied by workspaceRuntime.
 * @returns {{ detach(): void }} Teardown handle.
 */
export function attachBrowserDragDrop(ctx = {}) {
  const {
    panelDom,
    getPanelTraces,
    setDropTarget,
    getDragState,
    setDragState,
    pushHistory,
    moveTrace,
    history,
    sections,
    getPanelRecord,
    moveGraph,
    moveSection,
    defaultSectionId,
    renderBrowser,
    persist,
    updateHistoryButtons
  } = ctx;

  const tree = panelDom?.tree;
  if (!tree) {
    return { detach() {} };
  }

  const resolveTraceTarget = (event) => {
    const traceRow = event.target.closest('.folder-trace');
    if (traceRow) {
      return {
        element: traceRow,
        panelId: traceRow.dataset.panelId,
        traceIndex: Number(traceRow.dataset.traceIndex) || 0
      };
    }

    const tracesContainer = event.target.closest('.folder-traces');
    if (tracesContainer) {
      const graphNode = tracesContainer.closest('.graph-node');
      const panelId = graphNode?.dataset?.panelId;
      if (!panelId) return null;
      const traces = getPanelTraces(panelId);
      return {
        element: tracesContainer,
        panelId,
        traceIndex: traces.length
      };
    }

    const graphNode = event.target.closest('.graph-node');
    if (graphNode) {
      const panelId = graphNode.dataset.panelId;
      const traces = getPanelTraces(panelId);
      return {
        element: graphNode,
        panelId,
        traceIndex: traces.length
      };
    }

    return null;
  };

  const handleTreeDragOver = (event) => {
    const state = getDragState();
    if (!state || state.type !== 'trace') return;
    const target = resolveTraceTarget(event);
    if (!target || !target.panelId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target.element);
  };

  const handleTreeDrop = (event) => {
    const state = getDragState();
    if (!state || state.type !== 'trace') return;
    const target = resolveTraceTarget(event);
    if (!target || !target.panelId) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    if (target.panelId === state.panelId && target.traceIndex === state.traceIndex) {
      setDropTarget(null);
      setDragState(null);
      return;
    }
    pushHistory();
    if (!moveTrace(state, { panelId: target.panelId, traceIndex: target.traceIndex })) {
      history.rewind();
    }
    setDropTarget(null);
    setDragState(null);
  };

  const handleTreeDragLeave = (event) => {
    const state = getDragState();
    if (!state) return;
    if (!tree.contains(event.relatedTarget)) {
      setDropTarget(null);
    }
  };

  const handleTreeDragEnd = () => {
    const state = getDragState();
    if (!state) return;
    setDropTarget(null);
    setDragState(null);
  };

  const handlePanelReorder = (panelId, dropContext = {}) => {
    if (!panelId || !dropContext || !dropContext.sectionId) return false;
    const record = getPanelRecord(panelId);
    if (!record) return false;
    const targetSectionId = sections.has(dropContext.sectionId) ? dropContext.sectionId : null;
    if (!targetSectionId) return false;
    if (sections.get(targetSectionId)?.locked) return false;
    const beforeRecord = dropContext.beforePanelId && dropContext.beforePanelId !== panelId
      ? getPanelRecord(dropContext.beforePanelId)
      : null;
    const beforeSectionId = sections.has(beforeRecord?.sectionId) ? beforeRecord.sectionId : defaultSectionId;
    const beforeId = beforeRecord && beforeSectionId === targetSectionId
      ? dropContext.beforePanelId
      : null;
    pushHistory();
    const moved = moveGraph(panelId, { sectionId: targetSectionId, beforePanelId: beforeId });
    if (!moved) {
      history.rewind();
    }
    return false;
  };

  const handleSectionReorder = (sectionId, dropContext = {}) => {
    if (!sectionId || sectionId === defaultSectionId) return false;
    const target = sections.get(sectionId);
    if (!target || target.locked) return false;
    const parentId = dropContext.parentId && sections.has(dropContext.parentId)
      ? dropContext.parentId
      : null;
    const beforeId = dropContext.beforeSectionId && sections.has(dropContext.beforeSectionId)
      ? dropContext.beforeSectionId
      : null;
    if (parentId === sectionId || beforeId === sectionId) {
      return false;
    }
    pushHistory();
    const moved = moveSection(sectionId, {
      parentId,
      beforeSectionId: beforeId
    });
    if (!moved) {
      history.rewind();
      return false;
    }
    renderBrowser();
    persist();
    updateHistoryButtons();
    return false;
  };

  tree.addEventListener('dragover', handleTreeDragOver);
  tree.addEventListener('drop', handleTreeDrop);
  tree.addEventListener('dragleave', handleTreeDragLeave);
  tree.addEventListener('dragend', handleTreeDragEnd);

  dragDrop.attach(tree, {
    onStateChanged: renderBrowser,
    onDropPanel: handlePanelReorder,
    onDropSection: handleSectionReorder
  });

  return {
    detach() {
      tree.removeEventListener('dragover', handleTreeDragOver);
      tree.removeEventListener('drop', handleTreeDrop);
      tree.removeEventListener('dragleave', handleTreeDragLeave);
      tree.removeEventListener('dragend', handleTreeDragEnd);
      setDropTarget(null);
      dragDrop.detach(tree);
    }
  };
}
