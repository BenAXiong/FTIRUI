import { resolveFolderId, createFolder, sortTracesByName } from './state.js';
import { collectDroppedFiles } from './dropzone.js';
import { syncDemoButton } from './demos.js';

const PANEL_COLLAPSE_KEY = 'plotB.panelCollapsed';

export function bindPanel(instance, { renderTree, onFiles, recordHistory, updateHistoryButtons } = {}) {
  const panel = instance.dom.panel;
  if (!panel || panel.bound) return;
  panel.bound = true;

  panel.toggle?.addEventListener('click', () => {
    const collapsed = panel.root?.classList.toggle('collapsed');
    const expanded = !collapsed;
    if (collapsed) {
      sessionStorage.setItem(PANEL_COLLAPSE_KEY, '1');
    } else {
      sessionStorage.removeItem(PANEL_COLLAPSE_KEY);
    }
    panel.toggle?.setAttribute('aria-expanded', String(expanded));
    panel.toggle.innerHTML = expanded
      ? '<i class="bi bi-chevron-double-left"></i>'
      : '<i class="bi bi-chevron-double-right"></i>';
    panel.toggle.title = expanded ? 'Collapse browser' : 'Expand browser';
    // When collapsed by click, ensure we are not peeking
    if (collapsed) panel.root?.classList.remove('peeking');
  });

  panel.newFolder?.addEventListener('click', () => {
    const parent = resolveFolderId(instance.state);
    const name = prompt('Folder name', 'New folder');
    if (!name) return;
    createFolder(instance.state, parent, name.trim());
    renderTree();
  });

  const dropzone = panel.dropzone;
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', async (e) => {
      const files = await collectDroppedFiles(e.dataTransfer);
      if (!files.length) return;
      await onFiles(files);
    });
  }

  // Search UI
  const searchBtn = panel.search || null;
  const searchInput = panel.searchInput || null;
  if (searchBtn && searchInput) {
    panel.search = searchBtn; panel.searchInput = searchInput;
    const clearHighlights = () => {
      panel.root?.querySelectorAll('.folder-trace.trace-match').forEach((el) => el.classList.remove('trace-match'));
    };
    const applyHighlights = () => {
      const q = (searchInput.value || '').trim().toLowerCase();
      clearHighlights();
      if (!q) return [];
      const rows = Array.from(panel.root?.querySelectorAll('.folder-trace') || []);
      const matches = [];
      rows.forEach((row) => {
        const nameEl = row.querySelector('.rename');
        const val = (nameEl?.value || '').toLowerCase();
        if (val.includes(q)) {
          row.classList.add('trace-match');
          matches.push(row);
        }
      });
      return matches;
    };
    const scrollTo = (row) => {
      try { row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
    };
    panel._searchIdx = 0; panel._searchLast = '';
    searchBtn.addEventListener('click', () => {
      const showing = searchInput.style.display !== 'none';
      if (showing) {
        searchInput.style.display = 'none';
        searchInput.value = '';
        clearHighlights();
      } else {
        searchInput.style.display = '';
        searchInput.focus();
        searchInput.select();
      }
    });
    searchInput.addEventListener('input', () => {
      const q = (searchInput.value || '').trim().toLowerCase();
      panel._searchIdx = 0; panel._searchLast = q;
      const matches = applyHighlights();
      if (matches.length) scrollTo(matches[0]);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        clearHighlights();
        searchInput.style.display = 'none';
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        const q = (searchInput.value || '').trim().toLowerCase();
        const matches = applyHighlights();
        if (!matches.length) return;
        if (panel._searchLast !== q) panel._searchIdx = 0;
        const idx = panel._searchIdx % matches.length;
        panel._searchIdx = (idx + 1) % matches.length;
        scrollTo(matches[idx]);
        e.preventDefault();
      }
    });
  }

  // Sort A–Z
  const sortBtn = panel.sort || null;
  if (sortBtn) {
    panel.sort = sortBtn;
    sortBtn.addEventListener('click', () => {
      if (typeof recordHistory === 'function') recordHistory();
      sortTracesByName(instance.state);
      renderTree?.();
      if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    });
  }

  // Hover-peek behavior like Notion
  panel.root?.addEventListener('mouseenter', () => {
    if (panel.root?.classList.contains('collapsed')) {
      panel.root.classList.add('peeking');
    }
  });
  panel.root?.addEventListener('mouseleave', () => {
    if (panel.root?.classList.contains('collapsed')) {
      panel.root.classList.remove('peeking');
    }
  });
}

export function restorePanelCollapsed(panel) {
  if (!panel?.root) return;
  const collapsed = sessionStorage.getItem(PANEL_COLLAPSE_KEY) === '1';
  panel.root.classList.toggle('collapsed', collapsed);
  const expanded = !collapsed;
  panel.toggle?.setAttribute('aria-expanded', String(expanded));
  panel.toggle.innerHTML = expanded
    ? '<i class="bi bi-chevron-double-left"></i>'
    : '<i class="bi bi-chevron-double-right"></i>';
  panel.toggle.title = expanded ? 'Collapse browser' : 'Expand browser';
  // Ensure peeking is off on load when expanded
  if (expanded) panel.root.classList.remove('peeking');
}

export function updatePanelEmptyState(instance) {
  const empty = instance.dom.panel?.empty;
  if (empty) {
    const hasTraces = (instance.state.order || []).length > 0;
    empty.style.display = hasTraces ? 'none' : '';
  }
  syncDemoButton(instance);
}
