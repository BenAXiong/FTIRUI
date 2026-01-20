import { rootFolderId } from '../../core/state.js';
import {
  ensureFolderStructure,
  setActiveFolder,
  toggleFolderCollapse,
  createFolder,
  renameFolder,
  deleteFolder,
  removeTrace as removeTraceFromState,
  reorderTraceBefore,
  moveTraceToFolder
} from './state.js';
import { applyDashIcon, normalizeDashValue, toHexColor } from '../utils/styling.js';
import { applyLineChip } from '../utils/styling_linechip.js';
import { normalizeTraceMeta, summarizeTraceMeta } from '../utils/traceMeta.js';
import { escapeHtml } from '../utils/dom.js';
import { sanitizeTraceName, traceNameToPlainText } from '../utils/traceName.js';
import { collectDroppedFiles } from './dropzone.js';
import { createChipPanels } from './chipPanels.js';

const TRACE_DRAG_MIME = 'application/x-ftir-trace';

function applyTraceMetaToRow(row, trace) {
  if (!row) return;
  const summary = summarizeTraceMeta(trace?.meta);
  if (summary) {
    row.title = summary;
    row.classList.add('has-meta');
  } else {
    row.removeAttribute('title');
    row.classList.remove('has-meta');
  }
}

function buildTraceRow(trace) {
  const row = document.createElement('div');
  row.className = 'folder-trace';
  row.dataset.id = trace.id;
  const dashValue = normalizeDashValue(trace.dash);
  const dashOptions = [
    ['solid', 'Solid'],
    ['dot', 'Dots'],
    ['dash', 'Dash'],
    ['longdash', 'Long dash'],
    ['dashdot', 'Dash + dot'],
    ['longdashdot', 'Long dash + dot']
  ];

  const rawName = sanitizeTraceName(trace.name || trace.filename || trace.id);
  const displayName = traceNameToPlainText(rawName);
  row.innerHTML = `
    <span class="drag-handle bi bi-grip-vertical" draggable="true" title="Drag trace"></span>
    <input class="form-check-input vis" type="checkbox" ${trace.visible ? 'checked' : ''} title="Toggle visibility">
    <button class="line-chip" type="button" aria-label="Edit line style"></button>
    <button class="color-dot" type="button" style="--c:${toHexColor(trace.color)}" title="Pick colour"></button>
    <input class="color form-control form-control-color form-control-sm" type="color" value="${toHexColor(trace.color)}" title="Colour picker">
    <input class="form-control form-control-sm rename" type="text" value="${escapeHtml(displayName)}" title="Double-click to rename" readonly>
    <button class="trace-info-icon" type="button" title="Trace info"><i class="bi bi-info-circle"></i></button>
    <select class="dash form-select form-select-sm" title="Line style">
      ${dashOptions.map(([value, label]) => `<option value="${value}" ${dashValue === value ? 'selected' : ''}></option>`).join('')}
    </select>
    <input class="opacity form-range" type="range" min="0.1" max="1" step="0.05" value="${trace.opacity ?? 1}" title="Opacity">
    <button class="trace-remove" type="button" title="Remove trace"><i class="bi bi-x-circle"></i></button>
  `;

  applyDashIcon(row.querySelector('.dash'), dashValue);
  applyTraceMetaToRow(row, trace);
  const renameInput = row.querySelector('.rename');
  if (renameInput) {
    renameInput.dataset.richName = rawName;
    renameInput.value = displayName;
    renameInput.readOnly = true;
    renameInput.tabIndex = 0;
    renameInput.setAttribute('aria-readonly', 'true');
    renameInput.setAttribute('draggable', 'false');
    renameInput.addEventListener('dragstart', (event) => event.preventDefault());
  }

  // Ensure a chip exists (create or select)
  let chip = row.querySelector('.line-chip');
  if (!chip) {
    chip = document.createElement('button');
    chip.className = 'line-chip';
    chip.type = 'button';
    chip.setAttribute('aria-label', 'Edit line style');
    // put it where you want in the row:
    (row.querySelector('.folder-trace-controls') || row).prepend(chip);
  }

  // Paint once on build
  applyLineChip(chip, {
    color: toHexColor(trace.color),
    width: trace.width || 2,
    opacity: trace.opacity ?? 1,
    dash: trace.dash || 'solid'
  });

  // hide old controls for compact UI
  row.querySelector('.color')?.toggleAttribute('hidden', true);
  row.querySelector('.color-dot')?.toggleAttribute('hidden', true);
  row.querySelector('.dash')?.toggleAttribute('hidden', true);
  row.querySelector('.opacity')?.toggleAttribute('hidden', true);

  return row;
}

function buildFolderNode(instance, folderId, target, depth) {
  const { state } = instance;
  const folder = state.folders[folderId];
  if (!folder) return;

  const node = document.createElement('div');
  node.className = 'folder-node';
  node.dataset.id = folderId;
  node.dataset.depth = String(depth);
  if (state.ui.activeFolder === folderId) {
    node.dataset.active = 'true';
  }
  node.setAttribute('draggable', folderId !== rootFolderId());

  const header = document.createElement('div');
  header.className = 'folder-header';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle';
  toggle.innerHTML = `<i class="bi ${folder.collapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>`;
  toggle.setAttribute('aria-expanded', String(!folder.collapsed));
  header.appendChild(toggle);

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name || 'Untitled folder';
  header.appendChild(name);

  const actions = document.createElement('div');
  actions.className = 'folder-actions';
  actions.innerHTML = `
    <button class="btn-icon folder-add" type="button" title="New folder"><i class="bi bi-plus-lg"></i></button>
    <button class="btn-icon folder-menu" type="button" title="Section options"><i class="bi bi-three-dots"></i></button>
  `;
  header.appendChild(actions);

  node.appendChild(header);

  const children = document.createElement('div');
  children.className = 'folder-children';
  if (folder.collapsed) children.classList.add('collapsed');
  children.dataset.folderId = folderId;

  (folder.folders || []).forEach((childId) => {
    if (!state.folders[childId]) return;
    buildFolderNode(instance, childId, children, depth + 1);
  });

  (folder.traces || []).forEach((traceId) => {
    const trace = state.traces[traceId];
    if (!trace) return;
    const row = buildTraceRow(trace);
    children.appendChild(row);
  });

  node.appendChild(children);
  target.appendChild(node);
}

export function renderFolderTree(instance) {
  ensureFolderStructure(instance.state);

  const tree = instance.dom.panel?.tree;
  if (!tree) return false;

  const frag = document.createDocumentFragment();
  buildFolderNode(instance, rootFolderId(), frag, 0);
  tree.replaceChildren(frag);
  return (instance.state.order || []).length > 0;
}

function clearTraceDragHighlight(panel) {
  panel.root?.classList.remove('trace-dragging');
  panel.tree?.querySelectorAll('.folder-drop-target').forEach((el) => el.classList.remove('folder-drop-target'));
  panel.tree?.querySelectorAll('.folder-trace.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
  panel.tree?.querySelectorAll('.folder-trace.drop-before').forEach((el) => el.classList.remove('drop-before'));
}

function handleTreeClick(event, instance, deps) {
  const { target } = event;
  const folderHeader = target.closest('.folder-header');
  const folderNode = target.closest('.folder-node');
  const traceRow = target.closest('.folder-trace');

  if (target.closest('.toggle')) {
    event.preventDefault();
    toggleFolderCollapse(instance.state, folderNode?.dataset.id);
    deps.renderTree();
    deps.syncDemoButton();
    return;
  }

  if (target.closest('.folder-name')) {
    return;
  }

  const addBtn = target.closest('.folder-add');
  if (addBtn) {
    event.preventDefault();
    const parentId = folderNode?.dataset.id || rootFolderId();
    const name = prompt('Section name', 'New folder');
    if (!name) return;
    deps.recordHistory();
    createFolder(instance.state, parentId, name.trim());
    deps.renderTree();
    deps.updateHistoryButtons();
    deps.syncDemoButton();
    return;
  }

  const menuBtn = target.closest('.folder-menu');
  if (menuBtn) {
    event.preventDefault();
    const id = folderNode?.dataset.id;
    if (!id) return;
    const action = prompt('Section action: rename / delete', 'rename');
    if (!action) return;
    if (action.toLowerCase().startsWith('del')) {
      if (!confirm('Delete section? Only empty sections can be deleted.')) return;
      deps.recordHistory();
      if (!deleteFolder(instance.state, id)) {
        alert('Section must be empty before deleting.');
      }
    } else {
      const name = prompt('Section name', instance.state.folders[id]?.name || 'Section');
      if (name) {
        deps.recordHistory();
        renameFolder(instance.state, id, name.trim());
      }
    }
    deps.renderTree();
    deps.updateHistoryButtons();
    deps.syncDemoButton();
    return;
  }

  if (folderHeader) {
    const id = folderNode?.dataset.id;
    setActiveFolder(instance.state, id);
    deps.renderTree();
    return;
  }

  const colorButton = target.closest('.color-dot');
  if (colorButton) {
    const row = colorButton.closest('.folder-trace');
    const colorPicker = row?.querySelector('.color');
    if (colorPicker) colorPicker.click();
    return;
  }

  const removeBtn = target.closest('.trace-remove');
  if (removeBtn) {
    event.preventDefault();
    const id = traceRow?.dataset.id;
    if (!id) return;
    deps.recordHistory();
    removeTraceFromState(instance.state, id);
    deps.renderPlot();
    deps.renderTree();
    deps.updateHistoryButtons();
    deps.syncDemoButton();
    return;
  }
}

function handleTreeChange(event, instance, deps) {
  const { target } = event;
  const row = target.closest('.folder-trace');
  if (!row) return;
  const traceId = row.dataset.id;
  const trace = instance.state.traces[traceId];
  if (!trace) return;

  // Color finalization (optional if you want to normalize to hex on commit)
  if (target.classList.contains('color')) {
    trace.color = toHexColor(target.value);
    applyLineChip(row.querySelector('.line-chip'), {
      color: trace.color,
      width: trace.width || 2,
      opacity: trace.opacity ?? 1,
      dash: trace.dash || 'solid'
    });
    deps.renderPlot();
    return;
  }

  // Dash pattern picked from the <select>
  if (target.classList.contains('dash')) {
    const value = normalizeDashValue(target.value);
    trace.dash = value;
    applyLineChip(row.querySelector('.line-chip'), {
      color: trace.color,
      width: trace.width || 2,
      opacity: trace.opacity ?? 1,
      dash: trace.dash
    });
    deps.renderPlot();
    return;
  }

  // old visibility/rename/remove/etc handlers
  // if (target.classList.contains('vis')) {
  //   trace.visible = target.checked;
  //   deps.renderPlot();
  //   return;
  // }

  // if (target.classList.contains('color')) {
  //   trace.color = target.value;
  //   traceRow.querySelector('.color-dot')?.style.setProperty('--c', trace.color);
  //   deps.renderPlot();
  //   return;
  // }

  // if (target.classList.contains('dash')) {
  //   const value = normalizeDashValue(target.value);
  //   trace.dash = value;
  //   applyDashIcon(target, value);
  //   deps.renderPlot();
  //   return;
  // }

  // if (target.classList.contains('opacity')) {
  //   trace.opacity = Number(target.value);
  //   deps.renderPlot();
  // }
}

function handleTreeInput(event, instance, deps) {
  const { target } = event;
  const row = target.closest('.folder-trace');
  if (!row) return;
  const traceId = row.dataset.id;
  const trace = instance.state.traces[traceId];
  if (!trace) return;

  // Live color as the picker moves
  if (target.classList.contains('color')) {
    trace.color = target.value; // if want hex: trace.color = toHexColor(target.value);
    applyLineChip(row.querySelector('.line-chip'), {
      color: trace.color,
      width: trace.width || 2,
      opacity: trace.opacity ?? 1,
      dash: trace.dash || 'solid'
    });
    deps.renderPlot(); // instant plot update
    return;
  }

  // Live opacity while sliding
  if (target.classList.contains('opacity')) {
    trace.opacity = Number(target.value);
    applyLineChip(row.querySelector('.line-chip'), {
      color: trace.color,
      width: trace.width || 2,
      opacity: trace.opacity,
      dash: trace.dash || 'solid'
    });
    deps.renderPlot();
    return;
  }

  // If add thickness
  if (target.classList.contains('thick')) {
    trace.width = Number(target.value);
    applyLineChip(row.querySelector('.line-chip'), {
      color: trace.color,
      width: trace.width,
      opacity: trace.opacity ?? 1,
      dash: trace.dash || 'solid'
    });
    deps.renderPlot();
    return;
  }

  // Rename
  if (target.classList.contains('rename')) {
    const traceRow = target.closest('.folder-trace');
    const traceId = traceRow?.dataset.id;
    if (!traceId) return;
    const trace = instance.state.traces[traceId];
    if (!trace) return;
    trace.name = sanitizeTraceName(target.value || trace.name);
    deps.renderPlot();
  }
}

function handleTraceDragStart(event, instance) {
  const traceRow = event.target.closest('.folder-trace');
  if (!traceRow) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!event.target.closest('.drag-handle')) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(TRACE_DRAG_MIME, traceRow.dataset.id);
  event.dataTransfer.setData('text/plain', traceRow.dataset.id);
  traceRow.classList.add('is-dragging');
  instance.dom.panel?.root?.classList.add('trace-dragging');
}

function handleTreeDragOver(event, instance) {
  if (!event.dataTransfer) return;
  const dt = event.dataTransfer;
  const isTrace = dt.types?.includes(TRACE_DRAG_MIME);
  const hasFiles = dt.types?.includes('Files');

  if (!isTrace && !hasFiles) return;

  if (isTrace) {
    const traceRow = event.target.closest('.folder-trace');
    if (traceRow) {
      const draggedId = dt.getData(TRACE_DRAG_MIME) || dt.getData('text/plain');
      if (!draggedId || traceRow.dataset.id === draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      instance.dom.panel?.tree?.querySelectorAll('.folder-trace.drop-before').forEach((el) => el.classList.remove('drop-before'));
      traceRow.classList.add('drop-before');
      return;
    }
  }

  const folderNode = event.target.closest('.folder-node');
  if (!folderNode) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = isTrace ? 'move' : 'copy';
  folderNode.classList.add('folder-drop-target');
}

function handleTreeDragLeave(event, panel) {
  const folderNode = event.target.closest('.folder-node');
  const traceRow = event.target.closest('.folder-trace');
  if (folderNode) {
    folderNode.classList.remove('folder-drop-target');
  }
  if (traceRow) {
    traceRow.classList.remove('drop-before');
  }
  panel.root?.classList.remove('trace-dragging');
}

async function handleTreeDrop(event, instance, deps, panel) {
  if (!event.dataTransfer) return;
  instance.dom.panel?.tree?.querySelectorAll('.folder-trace.drop-before').forEach((el) => el.classList.remove('drop-before'));
  const folderNode = event.target.closest('.folder-node');
  const folderId = folderNode?.dataset.id;

  const dt = event.dataTransfer;
  const isTrace = dt.types?.includes(TRACE_DRAG_MIME);

  folderNode?.classList.remove('folder-drop-target');
  panel.root?.classList.remove('trace-dragging');

  if (isTrace) {
    const traceRow = event.target.closest('.folder-trace');
    const traceId = dt.getData(TRACE_DRAG_MIME) || dt.getData('text/plain');
    if (!traceId) return;
    if (traceRow) {
      event.preventDefault();
      const targetId = traceRow.dataset.id;
      reorderTraceBefore(instance.state, traceId, targetId);
      deps.renderTree();
      deps.renderPlot();
      return;
    }
  }

  if (!folderId) return;

  if (isTrace) {
    event.preventDefault();
    const traceId = dt.getData(TRACE_DRAG_MIME) || dt.getData('text/plain');
    if (!traceId) return;
    moveTraceToFolder(instance.state, traceId, folderId);
    deps.renderTree();
    return;
  }

  if (dt.types?.includes('Files')) {
    event.preventDefault();
    const files = await collectDroppedFiles(dt);
    if (!files.length) return;
    await deps.handleFiles(files, { folderId });
  }
}

function beginFolderRename(instance, deps, nameSpanEl) {
  const header = nameSpanEl.closest('.folder-header');
  const node = nameSpanEl.closest('.folder-node');
  if (!header || !node) return;

  const folderId = node.dataset.id;
  const oldName = String(nameSpanEl.textContent || 'Untitled folder');

  // Build input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control form-control-sm';
  input.value = oldName;
  input.size = Math.max(8, oldName.length + 2);

  // Swap span -> input
  nameSpanEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const cleanup = () => {
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKey);
  };

  const commit = () => {
    if (done) return; done = true;
    const next = (input.value || '').trim() || oldName;

    // Restore span
    nameSpanEl.textContent = next;
    input.replaceWith(nameSpanEl);
    cleanup();

    if (next !== oldName) {
      // Mirror menu-based rename flow
      deps.recordHistory();
      renameFolder(instance.state, folderId, next);
      deps.renderTree();
      deps.updateHistoryButtons();
      deps.syncDemoButton();
    }
  };

  const cancel = () => {
    if (done) return; done = true;
    input.replaceWith(nameSpanEl);
    cleanup();
  };

  const onBlur = () => commit();
  const onKey = (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  };

  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);
}


export function bindFolderTree(instance, deps) {
  const panel = instance.dom.panel;
  const tree = panel?.tree;
  if (!tree) console.error('[FT] No tree element found; selector is wrong or DOM not ready');

  if (!tree || tree.dataset.bound) return;
  tree.dataset.bound = '1';

  tree.addEventListener('click', (e) => handleTreeClick(e, instance, deps));
  tree.addEventListener('click', (e) => {
    if (e.target.closest('.trace-name, .file-name, .rename')) {
      // single-click on name should only select/focus, not enter edit mode
      return;
    }
  });
  tree.addEventListener('change', (e) => handleTreeChange(e, instance, deps));
  tree.addEventListener('input', (e) => handleTreeInput(e, instance, deps));
  // Double-click to enable rename on the name input only
  tree.addEventListener('dblclick', (e) => {
    const input = e.target.closest('.rename');
    if (!input) return;
    // Enable editing
    input.readOnly = false;
    input.value = input.dataset.richName || input.value;
    input.focus();
    input.select();
    // Commit and lock on blur/Enter
    const finish = () => {
      input.readOnly = true;
      const sanitized = sanitizeTraceName(input.value || '');
      input.dataset.richName = sanitized;
      input.value = traceNameToPlainText(sanitized);
      input.removeEventListener('blur', finish);
      input.removeEventListener('keydown', onKey);
      // Trigger change to persist name via existing handlers
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const onKey = (ev) => { if (ev.key === 'Enter') input.blur(); };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', onKey);
    e.stopPropagation();
    e.preventDefault();
  });
  // Double-click on folder name to inline-rename the section/graph (“Graph X”)
  tree.addEventListener('dblclick', (e) => {
    const nameSpan = e.target.closest('.folder-name');
    if (!nameSpan) return;
    e.preventDefault();
    e.stopPropagation(); // avoid toggling collapse / selection
    beginFolderRename(instance, deps, nameSpan);
  });


  // BEGIN chipPanels mounting
  const chipPanels = createChipPanels(document.body);
  chipPanels.mount({
    tree,
    getTraceById: (rowId) => instance.state.traces[rowId],
    repaintChip: (rowEl) => {
      const chip = rowEl.querySelector('.line-chip');
      const tr = instance.state.traces[rowEl.dataset.id];
      if (!chip || !tr) return;
      // You already have toHexColor/applyLineChip in your project:
      applyLineChip(chip, {
        color: toHexColor(tr.color),
        width: tr.width || 2,
        opacity: tr.opacity ?? 1,
        dash: tr.dash || 'solid'
      });
    },
    renderPlot: () => deps.renderPlot(),
    openRawData: (rowId) => {
      // Hook your raw-data viewer here (for now, simple log)
      console.log('Open raw data for', rowId, instance.state.traces[rowId]);
    }
  });
  // END chipPanels mounting

  // Clicking info icon pins the info panel for that trace
  tree.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.trace-info-icon');
    if (!btn) return;
    const row = btn.closest('.folder-trace');
    if (!row) return;
    // Fallback approach: click the chip to pin panels, then hover the info icon to switch to Info
    const chip = row.querySelector('.line-chip');
    if (chip) chip.click();
    try {
      const evt = new PointerEvent('pointerover', { bubbles: true });
      btn.dispatchEvent(evt);
    } catch {}
  });

  tree.addEventListener('dragstart', (e) => handleTraceDragStart(e, instance));
  tree.addEventListener('dragend', () => clearTraceDragHighlight(panel));
  tree.addEventListener('dragover', (e) => handleTreeDragOver(e, instance));
  tree.addEventListener('dragleave', (e) => handleTreeDragLeave(e, panel));
  tree.addEventListener('drop', async (e) => {
    await handleTreeDrop(e, instance, deps, panel);
    clearTraceDragHighlight(panel);
  });
}
