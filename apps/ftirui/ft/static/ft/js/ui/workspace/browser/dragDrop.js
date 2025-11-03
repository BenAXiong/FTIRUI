const contexts = new WeakMap();

const noop = () => false;

const resolvePanelId = (target) => {
  const header = target?.closest('.graph-header');
  if (header?.dataset?.panelId) {
    return header.dataset.panelId;
  }
  const node = target?.closest('.graph-node');
  return node?.dataset?.panelId || null;
};

const resolveSectionId = (target) => {
  const sectionHeader = target?.closest('.section-header');
  if (sectionHeader?.dataset?.sectionId) {
    return sectionHeader.dataset.sectionId;
  }
  const sectionNode = target?.closest('.section-node');
  return sectionNode?.dataset?.sectionId || null;
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

export function attach(rootEl, options = {}) {
  if (!rootEl || contexts.has(rootEl)) return;

  const context = {
    rootEl,
    onStateChanged: options.onStateChanged ?? noop,
    onDropPanel: options.onDropPanel ?? noop,
    currentDropTarget: null,
    draggingPanelId: null
  };

  const handleStatefulResult = (result) => {
    if (result !== false) {
      callGuarded(context.onStateChanged);
    }
  };

  const handleDragStart = (event) => {
    const panelId = resolvePanelId(event.target);
    if (!panelId) return;
    if (event.target?.closest('button')) {
      event.preventDefault();
      return;
    }
    context.draggingPanelId = panelId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', panelId);
    }
  };

  const handleDragOver = (event) => {
    if (!context.draggingPanelId) return;
    const sectionId = resolveSectionId(event.target);
    if (!sectionId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const node = event.target.closest('.section-node') || event.target.closest('.section-header');
    setDropTarget(context, node || null);
  };

  const handleDragLeave = (event) => {
    if (!context.draggingPanelId) return;
    if (context.rootEl.contains(event.relatedTarget)) return;
    setDropTarget(context, null);
  };

  const handleDrop = (event) => {
    if (!context.draggingPanelId) return;
    const sectionId = resolveSectionId(event.target);
    setDropTarget(context, null);
    if (!sectionId) return;
    event.preventDefault();
    const panelId = context.draggingPanelId;
    context.draggingPanelId = null;
    const result = callGuarded(context.onDropPanel, panelId, sectionId);
    handleStatefulResult(result);
  };

  const handleDragEnd = () => {
    context.draggingPanelId = null;
    setDropTarget(context, null);
  };

  rootEl.addEventListener('dragstart', handleDragStart, true);
  rootEl.addEventListener('dragover', handleDragOver);
  rootEl.addEventListener('dragleave', handleDragLeave);
  rootEl.addEventListener('drop', handleDrop);
  rootEl.addEventListener('dragend', handleDragEnd);

  contexts.set(rootEl, {
    ...context,
    handlers: {
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd
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
  }
  if (ctx.currentDropTarget) {
    ctx.currentDropTarget.classList.remove('is-drop-target');
  }
  contexts.delete(rootEl);
}
