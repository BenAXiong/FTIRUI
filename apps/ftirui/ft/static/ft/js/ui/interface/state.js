import { rootFolderId, newFolderId } from '../../core/state.js';

export function ensureFolderStructure(state) {
  if (!state) return;
  const rootId = rootFolderId();
  state.folders = state.folders && typeof state.folders === 'object' ? state.folders : {};
  if (!state.folders[rootId]) {
    state.folders[rootId] = {
      id: rootId,
      name: 'All Traces',
      parent: null,
      folders: [],
      traces: [],
      collapsed: false
    };
  }
  state.folderOrder = Array.isArray(state.folderOrder) ? [...new Set(state.folderOrder)] : [rootId];
  if (!state.folderOrder.includes(rootId)) {
    state.folderOrder.unshift(rootId);
  }
  state.ui = state.ui || {};
  if (!state.ui.activeFolder || !state.folders[state.ui.activeFolder]) {
    state.ui.activeFolder = rootId;
  }
  Object.values(state.folders).forEach((folder) => {
    if (!folder) return;
    folder.folders = Array.isArray(folder.folders) ? folder.folders.filter((id) => state.folders[id]) : [];
    folder.traces = Array.isArray(folder.traces) ? folder.traces.filter((id) => state.traces?.[id]) : [];
    folder.collapsed = !!folder.collapsed;
  });
  Object.entries(state.folders).forEach(([id, folder]) => {
    if (!folder) return;
    if (folder.parent && !state.folders[folder.parent]) {
      folder.parent = rootFolderId();
    }
    if (folder.parent && !state.folders[folder.parent].folders.includes(id)) {
      state.folders[folder.parent].folders.push(id);
    }
  });
  const rootFolder = state.folders[rootId];
  const order = Array.isArray(state.order) ? state.order : [];
  Object.values(state.folders).forEach((folder) => {
    if (folder) folder.traces = [];
  });
  order.forEach((traceId) => {
    const trace = state.traces?.[traceId];
    if (!trace) return;
    if (!trace.folderId || !state.folders[trace.folderId]) {
      trace.folderId = rootId;
    }
    const folder = state.folders[trace.folderId] || rootFolder;
    if (!folder.traces.includes(traceId)) folder.traces.push(traceId);
  });
}

export function resolveFolderId(state, folderId) {
  ensureFolderStructure(state);
  const candidate = folderId && state.folders[folderId] ? folderId : state.ui.activeFolder;
  return state.folders[candidate] ? candidate : rootFolderId();
}

export function setActiveFolder(state, folderId) {
  ensureFolderStructure(state);
  if (!folderId || !state.folders[folderId]) return;
  state.ui.activeFolder = folderId;
}

export function addTraceToFolder(state, traceId, folderId) {
  ensureFolderStructure(state);
  const folder = state.folders[folderId] || state.folders[rootFolderId()];
  if (!folder.traces.includes(traceId)) {
    folder.traces.push(traceId);
  }
  const trace = state.traces[traceId];
  if (trace) trace.folderId = folder.id;
}

export function reorderTraceBefore(state, draggedId, targetId) {
  ensureFolderStructure(state);
  if (!draggedId || !targetId || draggedId === targetId) return;
  const dragged = state.traces[draggedId];
  const target = state.traces[targetId];
  if (!dragged || !target) return;

  const destFolderId = target.folderId || rootFolderId();
  const sourceFolder = state.folders[dragged.folderId] || state.folders[rootFolderId()];
  const destFolder = state.folders[destFolderId] || state.folders[rootFolderId()];

  const order = Array.isArray(state.order) ? state.order.slice() : [];
  const filtered = order.filter((id) => id !== draggedId);
  const targetIdx = filtered.indexOf(targetId);
  if (targetIdx >= 0) {
    filtered.splice(targetIdx, 0, draggedId);
  } else {
    filtered.push(draggedId);
  }
  state.order = filtered;

  if (sourceFolder && sourceFolder.traces) {
    sourceFolder.traces = sourceFolder.traces.filter((id) => id !== draggedId);
  }
  if (destFolder && destFolder.traces) {
    const withoutDragged = destFolder.traces.filter((id) => id !== draggedId);
    const targetPos = withoutDragged.indexOf(targetId);
    if (targetPos >= 0) {
      withoutDragged.splice(targetPos, 0, draggedId);
    } else {
      withoutDragged.push(draggedId);
    }
    destFolder.traces = withoutDragged;
  }
  dragged.folderId = destFolder.id;
}

export function moveTraceToFolder(state, traceId, folderId) {
  ensureFolderStructure(state);
  const trace = state.traces[traceId];
  if (!trace) return;
  const currentFolder = state.folders[trace.folderId];
  const targetFolder = state.folders[folderId];
  if (!targetFolder) return;
  if (currentFolder) {
    currentFolder.traces = currentFolder.traces.filter((id) => id !== traceId);
  }
  trace.folderId = targetFolder.id;
  if (!targetFolder.traces.includes(traceId)) {
    targetFolder.traces.push(traceId);
  }
}

export function removeTrace(state, traceId) {
  delete state.traces[traceId];
  state.order = state.order.filter((id) => id !== traceId);
  Object.values(state.folders).forEach((folder) => {
    if (!folder) return;
    folder.traces = folder.traces.filter((id) => id !== traceId);
  });
}

export function toggleFolderCollapse(state, folderId) {
  ensureFolderStructure(state);
  const folder = state.folders[folderId];
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
}

export function createFolder(state, parentId, name) {
  ensureFolderStructure(state);
  const parent = state.folders[parentId] || state.folders[rootFolderId()];
  const id = newFolderId();
  state.folders[id] = {
    id,
    name: name || 'New folder',
    parent: parent.id,
    folders: [],
    traces: [],
    collapsed: false
  };
  parent.folders.push(id);
  if (parent.id === rootFolderId() && !state.folderOrder.includes(id)) {
    state.folderOrder.push(id);
  }
  state.ui.activeFolder = id;
}

export function renameFolder(state, folderId, name) {
  const folder = state.folders[folderId];
  if (!folder) return;
  folder.name = name || folder.name;
}

export function deleteFolder(state, folderId) {
  ensureFolderStructure(state);
  if (!folderId || folderId === rootFolderId()) return false;
  const folder = state.folders[folderId];
  if (!folder) return false;
  if ((folder.traces && folder.traces.length) || (folder.folders && folder.folders.length)) {
    return false;
  }
  const parent = state.folders[folder.parent] || state.folders[rootFolderId()];
  parent.folders = parent.folders.filter((id) => id !== folderId);
  delete state.folders[folderId];
  if (state.folderOrder) {
    state.folderOrder = state.folderOrder.filter((id) => id !== folderId);
  }
  if (state.ui.activeFolder === folderId) {
    state.ui.activeFolder = parent.id;
  }
  return true;
}

export function sortTracesByName(state) {
  ensureFolderStructure(state);
  const getName = (id) => {
    const t = state.traces?.[id];
    if (!t) return '' + id;
    return (t.name || t.filename || t.id || '').toString().toLowerCase();
  };
  const order = Array.isArray(state.order) ? state.order.slice() : [];
  order.sort((a, b) => {
    const na = getName(a);
    const nb = getName(b);
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });
  state.order = order;
  // folder.traces will be rebuilt from order by ensureFolderStructure in callers
}
