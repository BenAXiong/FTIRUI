import { signalAutosaveActivity } from './sessions.js';

function cloneStateSnapshot(state) {
  return {
    traces: JSON.parse(JSON.stringify(state.traces || {})),
    order: Array.isArray(state.order) ? state.order.slice() : [],
    folders: JSON.parse(JSON.stringify(state.folders || {})),
    folderOrder: Array.isArray(state.folderOrder) ? state.folderOrder.slice() : [],
    ui: JSON.parse(JSON.stringify(state.ui || {})),
    global: { ...(state.global || {}) }
  };
}

function applySnapshot(state, snapshot) {
  state.traces = JSON.parse(JSON.stringify(snapshot.traces || {}));
  state.order = Array.isArray(snapshot.order) ? snapshot.order.slice() : [];
  state.folders = JSON.parse(JSON.stringify(snapshot.folders || {}));
  state.folderOrder = Array.isArray(snapshot.folderOrder) ? snapshot.folderOrder.slice() : [];
  state.ui = JSON.parse(JSON.stringify(snapshot.ui || {}));
  state.global = { ...(snapshot.global || {}) };
}

export function ensureHistoryStacks(state) {
  state.history = Array.isArray(state.history) ? state.history : [];
  state.future = Array.isArray(state.future) ? state.future : [];
}

export function recordHistory(instance) {
  const { state } = instance;
  ensureHistoryStacks(state);
  signalAutosaveActivity(instance);
  state.history.push(cloneStateSnapshot(state));
  if (state.history.length > 50) state.history.shift();
  state.future = [];
  updateHistoryButtons(instance);
}

export function updateHistoryButtons(instance) {
  const { state } = instance;
  ensureHistoryStacks(state);
  const undoBtn = instance.dom.panel?.undo;
  const redoBtn = instance.dom.panel?.redo;
  if (undoBtn) undoBtn.disabled = state.history.length === 0;
  if (redoBtn) redoBtn.disabled = state.future.length === 0;
}

function undo(instance, { renderFolderTree, renderPlot, syncDemoButton, ensureFolderStructure }) {
  const { state } = instance;
  ensureHistoryStacks(state);
  if (!state.history.length) return;
  const snapshot = state.history.pop();
  state.future.push(cloneStateSnapshot(state));
  applySnapshot(state, snapshot);
  ensureFolderStructure(state);
  renderFolderTree(instance);
  renderPlot(instance);
  updateHistoryButtons(instance);
  syncDemoButton(instance);
  signalAutosaveActivity(instance);
}

function redo(instance, { renderFolderTree, renderPlot, syncDemoButton, ensureFolderStructure }) {
  const { state } = instance;
  ensureHistoryStacks(state);
  if (!state.future.length) return;
  const snapshot = state.future.pop();
  state.history.push(cloneStateSnapshot(state));
  applySnapshot(state, snapshot);
  ensureFolderStructure(state);
  renderFolderTree(instance);
  renderPlot(instance);
  updateHistoryButtons(instance);
  syncDemoButton(instance);
  signalAutosaveActivity(instance);
}

export function bindHistoryControls(instance, deps) {
  const undoBtn = instance.dom.panel?.undo;
  const redoBtn = instance.dom.panel?.redo;
  if (undoBtn) undoBtn.addEventListener('click', () => undo(instance, deps));
  if (redoBtn) redoBtn.addEventListener('click', () => redo(instance, deps));
}
