/**
 * Responsibility: Coordinate drag-and-drop between browser tree nodes and delegate results to runtime callbacks.
 * Inputs: accepts a root element plus handlers for move/drop operations supplied by the controller.
 * Outputs: invokes callbacks with inferred panel/section targets and provides teardown support.
 * Never: never mutate DOM structure beyond drag affordances, never talk to Plotly, never update models directly.
 */
const contexts = new WeakMap();

const noop = () => false;

const resolvePanelId = (target) => {
  const header = target?.closest('.graph-header');
  if (header?.dataset?.panelId) {
    return header.dataset.panelId;
  }
  return null;
};

const resolveSectionId = (target) => {
  const sectionHeader = target?.closest('.section-header');
  if (sectionHeader?.dataset?.sectionId) {
    return sectionHeader.dataset.sectionId;
  }
  return null;
};

const setDropTarget = (ctx, element) => {
  if (ctx.currentDropTarget === element) return;
  if (ctx.currentDropTarget) {
    ctx.currentDropTarget.classList.remove('is-drop-target');
  }
  ctx.currentDropTarget = element || null;
  if (ctx.currentDropTarget) {
    ctx.currentDropTarget.classList.add('is-drop-target');
  }
};

const callGuarded = (fn, ...args) => {
  if (typeof fn !== 'function') return false;
  try {
    return fn(...args);
  } catch (err) {
    console.error('[dragDrop] handler failed', err);
    return false;
  }
};

const resolveSectionDrop = (context, event) => {
  const sectionNode = event.target.closest('.section-node');
  if (!sectionNode) {
    if (event.target !== context.rootEl) return null;
    return {
      element: context.rootEl,
      parentId: null,
      beforeSectionId: null,
      mode: 'root'
    };
  }
  const sectionId = sectionNode.dataset?.sectionId;
  if (!sectionId) return null;

  const children = sectionNode.querySelector(':scope > .folder-children');
  if (children && children.contains(event.target)) {
    return {
      element: children,
      parentId: sectionId,
      beforeSectionId: null,
      mode: 'into'
    };
  }

  const header = sectionNode.querySelector(':scope > .section-header') || sectionNode;
  const rect = header.getBoundingClientRect();
  const midway = rect.top + rect.height / 2;
  const isBefore = event.clientY < midway;
  const parentId = sectionNode.dataset?.parentId || null;

  if (isBefore) {
    return {
      element: sectionNode,
      parentId: parentId || null,
      beforeSectionId: sectionId,
      mode: 'before'
    };
  }

  let nextSectionId = null;
  let pointer = sectionNode.nextElementSibling;
  while (pointer) {
    if (pointer.classList?.contains('section-node')) {
      nextSectionId = pointer.dataset?.sectionId || null;
      break;
    }
    pointer = pointer.nextElementSibling;
  }

  return {
    element: sectionNode,
    parentId: parentId || null,
    beforeSectionId: nextSectionId,
    mode: 'after'
  };
};

const resolveGraphDrop = (context, event) => {
  const graphNode = event.target.closest('.graph-node');
  if (graphNode) {
    const sectionId = graphNode.dataset?.sectionId || null;
    if (!sectionId) return null;
    const header = graphNode.querySelector(':scope > .graph-header') || graphNode;
    const rect = header.getBoundingClientRect();
    const midway = rect.top + rect.height / 2;
    const isBefore = event.clientY < midway;
    if (isBefore) {
      return {
        element: graphNode,
        sectionId,
        beforePanelId: graphNode.dataset?.panelId || null,
        position: 'before'
      };
    }
    let nextGraph = graphNode.nextElementSibling;
    while (nextGraph) {
      if (nextGraph.classList?.contains('graph-node')) break;
      nextGraph = nextGraph.nextElementSibling;
    }
    return {
      element: graphNode,
      sectionId,
      beforePanelId: nextGraph?.dataset?.panelId || null,
      position: 'after'
    };
  }

  const sectionNode = event.target.closest('.section-node');
  if (sectionNode) {
    const sectionId = sectionNode.dataset?.sectionId || null;
    if (!sectionId) return null;
    const children = sectionNode.querySelector(':scope > .folder-children');
    return {
      element: children || sectionNode,
      sectionId,
      beforePanelId: null,
      position: 'into'
    };
  }

  return null;
};

export function attach(rootEl, options = {}) {
  if (!rootEl || contexts.has(rootEl)) return;

  const context = {
    rootEl,
    onStateChanged: options.onStateChanged ?? noop,
    onDropPanel: options.onDropPanel ?? noop,
    onCopyPanel: options.onCopyPanel ?? noop,
    onDropSection: options.onDropSection ?? noop,
    onCopySection: options.onCopySection ?? noop,
    currentDropTarget: null,
    draggingPanelId: null,
    draggingSectionId: null,
    draggingSectionParentId: null,
    pendingSectionDrop: null,
    pendingPanelDrop: null,
    dragMode: 'move',
    copyHoverEligible: false
  };

  const handleStatefulResult = (result) => {
    if (result !== false) {
      callGuarded(context.onStateChanged);
    }
  };

  const isCopyModifier = (event) => !!(event?.ctrlKey && event?.altKey);

  const isDuplicateTarget = (target) => {
    if (!target) return false;
    if (target.closest('.graph-header')) {
      return true;
    }
    const sectionHeader = target.closest('.section-header');
    if (sectionHeader) {
      const sectionNode = sectionHeader.closest('.section-node');
      if (sectionNode?.dataset?.locked === 'true') return false;
      return true;
    }
    return false;
  };

  const updateCopyHoverState = (active) => {
    if (!context.rootEl?.classList) return;
    context.rootEl.classList.toggle('is-copy-hover', !!active);
  };

  const resetDragState = () => {
    context.draggingPanelId = null;
    context.draggingSectionId = null;
    context.draggingSectionParentId = null;
    context.pendingSectionDrop = null;
    context.pendingPanelDrop = null;
    context.dragMode = 'move';
    context.rootEl?.classList?.remove('is-copy-drag');
    context.rootEl?.classList?.remove('is-copy-hover');
    context.copyHoverEligible = false;
    if (context.rootEl?.dataset) {
      delete context.rootEl.dataset.dragMode;
    }
    setDropTarget(context, null);
  };

  const handleDragStart = (event) => {
    if (event.target?.closest('button')) {
      event.preventDefault();
      return;
    }
    if (event.target?.closest('.folder-trace')) {
      return;
    }
    if (event.target?.closest('input, textarea, select')) {
      return;
    }
    if (event.target?.closest('.drag-handle')) {
      return;
    }
    const inGraphHeader = event.target?.closest('.graph-header');
    const inSectionHeader = event.target?.closest('.section-header');
    if (!inGraphHeader && !inSectionHeader && event.target?.closest('.folder-traces, .folder-children')) {
      event.preventDefault();
      return;
    }
    if (!inGraphHeader && !inSectionHeader) {
      event.preventDefault();
      return;
    }
    const panelId = resolvePanelId(event.target);
    if (panelId) {
      context.draggingPanelId = panelId;
      context.draggingSectionId = null;
      context.draggingSectionParentId = null;
      context.pendingPanelDrop = null;
      context.pendingSectionDrop = null;
    } else {
      const sectionId = resolveSectionId(event.target);
      const sectionNode = event.target.closest('.section-node');
      const locked = sectionNode?.dataset?.locked === 'true';
      if (!sectionId || locked) return;
      context.draggingSectionId = sectionId;
      context.draggingPanelId = null;
      context.draggingSectionParentId = sectionNode?.dataset?.parentId || null;
      context.pendingSectionDrop = null;
      context.pendingPanelDrop = null;
    }
    if (!context.draggingPanelId && !context.draggingSectionId) return;
    const isCopy = !!(event.ctrlKey && event.altKey);
    context.dragMode = isCopy ? 'copy' : 'move';
    if (context.rootEl?.classList) {
      context.rootEl.classList.toggle('is-copy-drag', isCopy);
      context.rootEl.classList.remove('is-copy-hover');
    }
    if (context.rootEl?.dataset) {
      context.rootEl.dataset.dragMode = context.dragMode;
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = isCopy ? 'copy' : 'move';
      const payload = context.draggingPanelId || context.draggingSectionId;
      event.dataTransfer.setData('text/plain', payload);
    }
  };

  const handleDragOver = (event) => {
    if (context.draggingPanelId) {
      const drop = resolveGraphDrop(context, event);
      if (!drop || !drop.sectionId) return;
      const targetNode = drop.element?.closest('.section-node') || context.rootEl.querySelector(`[data-section-id="${drop.sectionId}"]`);
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = context.dragMode === 'copy' ? 'copy' : 'move';
      }
      setDropTarget(context, drop.element || targetNode || null);
      context.pendingPanelDrop = drop;
      context.pendingSectionDrop = null;
      return;
    }
    if (context.draggingSectionId) {
      const drop = resolveSectionDrop(context, event);
      if (!drop) return;
      if (!context.draggingSectionParentId && drop.parentId) {
        return;
      }
      const targetNode = drop.element?.closest('.section-node') || (drop.parentId ? context.rootEl.querySelector(`[data-section-id="${drop.parentId}"]`) : null);
      if (targetNode?.dataset?.locked === 'true') return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = context.dragMode === 'copy' ? 'copy' : 'move';
      }
      setDropTarget(context, drop.element || targetNode || null);
      context.pendingSectionDrop = drop;
    }
  };

  const handleDragLeave = (event) => {
    if (!context.draggingPanelId && !context.draggingSectionId) return;
    if (context.rootEl.contains(event.relatedTarget)) return;
    setDropTarget(context, null);
    context.pendingSectionDrop = null;
    context.pendingPanelDrop = null;
  };

  const handleDrop = (event) => {
    if (context.draggingPanelId) {
      const drop = context.pendingPanelDrop || resolveGraphDrop(context, event);
      setDropTarget(context, null);
      context.pendingPanelDrop = null;
      if (!drop || !drop.sectionId) {
        resetDragState();
        return;
      }
      event.preventDefault();
      const panelId = context.draggingPanelId;
      const isCopy = context.dragMode === 'copy';
      resetDragState();
      const result = isCopy
        ? callGuarded(context.onCopyPanel, panelId, drop)
        : callGuarded(context.onDropPanel, panelId, drop);
      handleStatefulResult(result);
      return;
    }
    if (context.draggingSectionId) {
      const drop = context.pendingSectionDrop || resolveSectionDrop(context, event);
      setDropTarget(context, null);
      context.pendingSectionDrop = null;
      if (!drop) {
        resetDragState();
        return;
      }
      if (!context.draggingSectionParentId && drop.parentId) {
        resetDragState();
        return;
      }
      const targetNode = drop.element?.closest('.section-node') || (drop.parentId ? context.rootEl.querySelector(`[data-section-id="${drop.parentId}"]`) : null);
      if (targetNode?.dataset?.locked === 'true') {
        resetDragState();
        return;
      }
      event.preventDefault();
      const sectionId = context.draggingSectionId;
      const isCopy = context.dragMode === 'copy';
      resetDragState();
      const result = isCopy
        ? callGuarded(context.onCopySection, sectionId, {
            parentId: drop.parentId,
            beforeSectionId: drop.beforeSectionId
          })
        : callGuarded(context.onDropSection, sectionId, {
            parentId: drop.parentId,
            beforeSectionId: drop.beforeSectionId
          });
      handleStatefulResult(result);
    }
  };

  const handleDragEnd = () => {
    resetDragState();
  };

  const handlePointerMove = (event) => {
    if (!event) return;
    const eligible = isDuplicateTarget(event.target);
    context.copyHoverEligible = eligible;
    updateCopyHoverState(eligible && isCopyModifier(event));
  };

  const handlePointerLeave = () => {
    context.copyHoverEligible = false;
    updateCopyHoverState(false);
  };

  const handleKeyToggle = (event) => {
    if (!context.copyHoverEligible) return;
    updateCopyHoverState(isCopyModifier(event));
  };

  rootEl.addEventListener('dragstart', handleDragStart, true);
  rootEl.addEventListener('dragover', handleDragOver);
  rootEl.addEventListener('dragleave', handleDragLeave);
  rootEl.addEventListener('drop', handleDrop);
  rootEl.addEventListener('dragend', handleDragEnd);
  rootEl.addEventListener('pointermove', handlePointerMove);
  rootEl.addEventListener('pointerleave', handlePointerLeave);
  document.addEventListener('keydown', handleKeyToggle);
  document.addEventListener('keyup', handleKeyToggle);

  contexts.set(rootEl, {
    ...context,
    handlers: {
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
      handlePointerMove,
      handlePointerLeave,
      handleKeyToggle
    }
  });
}

export function detach(rootEl) {
  const ctx = contexts.get(rootEl);
  if (!ctx) return;
  const { handlers } = ctx;
  if (handlers) {
    ctx.rootEl.removeEventListener('dragstart', handlers.handleDragStart, true);
    ctx.rootEl.removeEventListener('dragover', handlers.handleDragOver);
    ctx.rootEl.removeEventListener('dragleave', handlers.handleDragLeave);
    ctx.rootEl.removeEventListener('drop', handlers.handleDrop);
    ctx.rootEl.removeEventListener('dragend', handlers.handleDragEnd);
    ctx.rootEl.removeEventListener('pointermove', handlers.handlePointerMove);
    ctx.rootEl.removeEventListener('pointerleave', handlers.handlePointerLeave);
    document.removeEventListener('keydown', handlers.handleKeyToggle);
    document.removeEventListener('keyup', handlers.handleKeyToggle);
  }
  if (ctx.currentDropTarget) {
    ctx.currentDropTarget.classList.remove('is-drop-target');
  }
  ctx.rootEl?.classList?.remove('is-copy-drag');
  ctx.rootEl?.classList?.remove('is-copy-hover');
  if (ctx.rootEl?.dataset) {
    delete ctx.rootEl.dataset.dragMode;
  }
  ctx.pendingSectionDrop = null;
  ctx.pendingPanelDrop = null;
  ctx.draggingSectionParentId = null;
  contexts.delete(rootEl);
}
