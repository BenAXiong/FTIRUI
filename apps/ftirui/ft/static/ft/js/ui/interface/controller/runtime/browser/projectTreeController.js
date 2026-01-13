import { escapeHtml } from '../../../../utils/dom.js';
import { fetchSections } from '../../../../../services/dashboard.js';

export function createProjectTreeController({
  root,
  getActiveCanvasId,
  getWorkspaceRoute,
  notify,
  readCollapsedState,
  writeCollapsedState
} = {}) {
  if (!root || typeof root.querySelector !== 'function') return null;

  const treeEl = root.querySelector('[data-project-tree]');
  const placeholderEl = root.querySelector('[data-project-placeholder]');
  if (!treeEl || !placeholderEl) return null;

  let isLoading = false;
  let hasLoaded = false;
  let dragState = null;
  let suppressClickUntil = 0;
  let collapseAllButton = null;
  let collapseAllHandler = null;
  const collapsedSections = new Set();
  const collapsedFolders = new Set();

  const sectionKeyFor = (section, index) =>
    String(section?.id ?? section?.name ?? `section-${index}`);
  const folderKeyFor = (project, index) =>
    String(project?.id ?? project?.title ?? `folder-${index}`);

  const hydrateCollapsedState = () => {
    if (typeof readCollapsedState !== 'function') return;
    const stored = readCollapsedState();
    const sections = Array.isArray(stored?.sections) ? stored.sections : [];
    const folders = Array.isArray(stored?.folders) ? stored.folders : [];
    collapsedSections.clear();
    sections.forEach((key) => {
      if (key == null) return;
      collapsedSections.add(String(key));
    });
    collapsedFolders.clear();
    folders.forEach((key) => {
      if (key == null) return;
      collapsedFolders.add(String(key));
    });
  };

  const syncCollapseAllButton = () => {
    if (!collapseAllButton) return;
    const sections = Array.from(treeEl.querySelectorAll('.workspace-project-section'));
    const folders = Array.from(treeEl.querySelectorAll('.workspace-project-folder'));
    const hasItems = sections.length > 0 || folders.length > 0;
    const allCollapsed =
      hasItems
      && sections.every((node) => node.classList.contains('is-collapsed'))
      && folders.every((node) => node.classList.contains('is-collapsed'));
    collapseAllButton.disabled = !hasItems;
    collapseAllButton.setAttribute('aria-pressed', String(allCollapsed));
    collapseAllButton.title = allCollapsed ? 'Expand all' : 'Collapse all';
    collapseAllButton.setAttribute('aria-label', collapseAllButton.title);
    const icon = collapseAllButton.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-chevron-bar-down', allCollapsed);
      icon.classList.toggle('bi-chevron-bar-up', !allCollapsed);
    }
  };

  const setAllCollapsed = (collapsed) => {
    const sections = Array.from(treeEl.querySelectorAll('.workspace-project-section'));
    const folders = Array.from(treeEl.querySelectorAll('.workspace-project-folder'));
    collapsedSections.clear();
    collapsedFolders.clear();
    sections.forEach((node) => {
      node.classList.toggle('is-collapsed', collapsed);
      const title = node.querySelector('[data-tree-toggle="section"]');
      if (title) {
        title.setAttribute('aria-expanded', String(!collapsed));
      }
      if (collapsed && node.dataset.sectionKey) {
        collapsedSections.add(node.dataset.sectionKey);
      }
    });
    folders.forEach((node) => {
      node.classList.toggle('is-collapsed', collapsed);
      const title = node.querySelector('[data-tree-toggle="folder"]');
      if (title) {
        title.setAttribute('aria-expanded', String(!collapsed));
      }
      if (collapsed && node.dataset.folderKey) {
        collapsedFolders.add(node.dataset.folderKey);
      }
    });
    if (typeof writeCollapsedState === 'function') {
      writeCollapsedState({
        sections: Array.from(collapsedSections),
        folders: Array.from(collapsedFolders)
      });
    }
    syncCollapseAllButton();
  };

  const setPlaceholder = (message) => {
    placeholderEl.textContent = message;
    placeholderEl.hidden = false;
    treeEl.hidden = true;
    syncCollapseAllButton();
  };

  const showTree = () => {
    placeholderEl.hidden = true;
    treeEl.hidden = false;
  };

  const getActiveCanvas = () => {
    if (typeof getActiveCanvasId === 'function') return getActiveCanvasId();
    return null;
  };

  const buildTreeActions = ({ scope, label, createLabel }) => {
    const group = document.createElement('div');
    group.className = 'workspace-tree-actions';
    const actions = [
      { action: 'create', icon: 'bi-plus-lg', label: createLabel || 'Create' },
      { action: 'rename', icon: 'bi-pencil', label: 'Rename' },
      { action: 'delete', icon: 'bi-trash', label: 'Delete' }
    ];
    actions.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-tree-action';
      btn.dataset.treeAction = entry.action;
      btn.dataset.treeScope = scope;
      btn.dataset.treeLabel = label || scope;
      btn.title = entry.label;
      btn.setAttribute('aria-label', entry.label);
      btn.innerHTML = `<i class="bi ${entry.icon}" aria-hidden="true"></i>`;
      group.appendChild(btn);
    });
    return group;
  };

  const buildCanvasRow = (canvas, activeId) => {
    const row = document.createElement('div');
    row.className = 'workspace-project-canvas-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'workspace-project-canvas';
    btn.dataset.canvasId = canvas.id;
    if (activeId && String(canvas.id) === String(activeId)) {
      btn.classList.add('is-active');
    }
    btn.innerHTML = `
      <i class="bi bi-file-earmark-bar-graph"></i>
      <span>${escapeHtml(canvas.title || 'Untitled canvas')}</span>
    `;
    row.appendChild(btn);
    row.appendChild(
      buildTreeActions({
        scope: 'canvas',
        label: canvas.title || 'Untitled canvas',
        createLabel: 'Duplicate'
      })
    );
    return row;
  };


  const renderTree = (sections = []) => {
    treeEl.innerHTML = '';
    const activeId = getActiveCanvas();

    if (!sections.length) {
      setPlaceholder('No projects found.');
      return;
    }

    const matchesActive = (canvasId) => activeId != null && String(canvasId) === String(activeId);
    sections.forEach((section, sectionIndex) => {
      const sectionKey = sectionKeyFor(section, sectionIndex);
      const sectionEl = document.createElement('div');
      sectionEl.className = 'workspace-project-section';
      sectionEl.dataset.sectionKey = sectionKey;
      const projects = Array.isArray(section.projects) ? section.projects : [];
      const hasActiveCanvas = projects.some((project) =>
        (Array.isArray(project.canvases) ? project.canvases : [])
          .some((canvas) => matchesActive(canvas?.id))
      );
      if (hasActiveCanvas) {
        sectionEl.classList.add('is-active');
      }
      if (collapsedSections.has(sectionKey)) {
        sectionEl.classList.add('is-collapsed');
      }
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'workspace-project-section-title workspace-project-row';
      sectionTitle.dataset.treeToggle = 'section';
      sectionTitle.dataset.sectionKey = sectionKey;
      sectionTitle.setAttribute('aria-expanded', String(!collapsedSections.has(sectionKey)));
      sectionTitle.innerHTML = `
        <span class="workspace-project-row-main">
          <i class="bi bi-collection"></i>
          <span>${escapeHtml(section.name || 'Project')}</span>
        </span>
      `;
      sectionTitle.appendChild(
        buildTreeActions({
          scope: 'section',
          label: section.name || 'Project',
          createLabel: 'New folder'
        })
      );
      sectionEl.appendChild(sectionTitle);
      if (!projects.length) {
        const empty = document.createElement('div');
        empty.className = 'workspace-project-empty text-muted small';
        empty.textContent = 'No folders yet.';
        sectionEl.appendChild(empty);
      } else {
        projects.forEach((project, projectIndex) => {
          const folderKey = folderKeyFor(project, projectIndex);
          const folderEl = document.createElement('div');
          folderEl.className = 'workspace-project-folder';
          folderEl.dataset.folderKey = folderKey;
          if (collapsedFolders.has(folderKey)) {
            folderEl.classList.add('is-collapsed');
          }
          const folderTitle = document.createElement('div');
          folderTitle.className = 'workspace-project-folder-title workspace-project-row';
          folderTitle.dataset.treeToggle = 'folder';
          folderTitle.dataset.folderKey = folderKey;
          folderTitle.setAttribute('aria-expanded', String(!collapsedFolders.has(folderKey)));
          folderTitle.innerHTML = `
            <span class="workspace-project-row-main">
              <i class="bi bi-folder2-open"></i>
              <span>${escapeHtml(project.title || 'Folder')}</span>
            </span>
          `;
          folderTitle.appendChild(
            buildTreeActions({
              scope: 'folder',
              label: project.title || 'Folder',
              createLabel: 'New canvas'
            })
          );
          folderEl.appendChild(folderTitle);
          const canvasList = document.createElement('div');
          canvasList.className = 'workspace-project-canvas-list';
          const canvases = Array.isArray(project.canvases) ? project.canvases : [];
          const hasActiveInFolder = canvases.some((canvas) => matchesActive(canvas?.id));
          if (hasActiveInFolder) {
            folderEl.classList.add('is-active');
          }
          if (!canvases.length) {
            const empty = document.createElement('div');
            empty.className = 'workspace-project-empty text-muted small';
            empty.textContent = 'No canvases.';
            canvasList.appendChild(empty);
          } else {
            canvases.forEach((canvas) => {
              canvasList.appendChild(buildCanvasRow(canvas, activeId));
            });
          }
          folderEl.appendChild(canvasList);
          sectionEl.appendChild(folderEl);
        });
      }
      treeEl.appendChild(sectionEl);
    });

    showTree();
    syncCollapseAllButton();
  };

  const handleTreeClick = (event) => {
    if (Date.now() < suppressClickUntil) return;
    const actionBtn = event.target?.closest?.('[data-tree-action]');
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      notify?.('Please modify the projects in the dashboard.', 'info');
      return;
    }
    const toggleRow = event.target?.closest?.('[data-tree-toggle]');
    if (toggleRow) {
      const kind = toggleRow.dataset.treeToggle;
      if (kind === 'section') {
        const sectionKey = toggleRow.dataset.sectionKey;
        const sectionEl = toggleRow.closest('.workspace-project-section');
        if (sectionEl) {
          const next = !sectionEl.classList.contains('is-collapsed');
          sectionEl.classList.toggle('is-collapsed', next);
          toggleRow.setAttribute('aria-expanded', String(!next));
          if (sectionKey) {
            if (next) {
              collapsedSections.add(sectionKey);
            } else {
              collapsedSections.delete(sectionKey);
            }
          }
        }
      } else if (kind === 'folder') {
        const folderKey = toggleRow.dataset.folderKey;
        const folderEl = toggleRow.closest('.workspace-project-folder');
        if (folderEl) {
          const next = !folderEl.classList.contains('is-collapsed');
          folderEl.classList.toggle('is-collapsed', next);
          toggleRow.setAttribute('aria-expanded', String(!next));
          if (folderKey) {
            if (next) {
              collapsedFolders.add(folderKey);
            } else {
              collapsedFolders.delete(folderKey);
            }
          }
        }
      }
      if (typeof writeCollapsedState === 'function') {
        writeCollapsedState({
          sections: Array.from(collapsedSections),
          folders: Array.from(collapsedFolders)
        });
      }
      syncCollapseAllButton();
      return;
    }
    const btn = event.target?.closest?.('[data-canvas-id]');
    if (!btn) return;
    const canvasId = btn.dataset.canvasId;
    if (!canvasId) return;
    const route = typeof getWorkspaceRoute === 'function' ? getWorkspaceRoute() : null;
    try {
      const url = new URL(route || window.location.href, window.location.origin);
      url.searchParams.set('canvas', canvasId);
      window.location.assign(url.toString());
    } catch (err) {
      console.warn('Failed to navigate to canvas', err);
      notify?.('Unable to open canvas.', 'warning');
    }
  };

  const load = async () => {
    if (isLoading || hasLoaded) return;
    if (typeof document !== 'undefined') {
      const dataset = document.body?.dataset || {};
      const authed = dataset.userAuthenticated === 'true' || dataset.userAuthenticated === '1';
      if (!authed) {
        setPlaceholder('Sign in to view project canvases.');
        return;
      }
    }
    isLoading = true;
    setPlaceholder('Loading projects...');
    try {
      const data = await fetchSections({ include: true });
      const sections = Array.isArray(data?.items) ? data.items : [];
      renderTree(sections);
      hasLoaded = true;
    } catch (err) {
      console.warn('Failed to load project tree', err);
      setPlaceholder('Unable to load projects.');
      notify?.(err?.message || 'Unable to load projects.', 'warning');
    } finally {
      isLoading = false;
    }
  };

  const handlePointerDown = (event) => {
    const btn = event.target?.closest?.('[data-canvas-id]');
    if (!btn) return;
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  };

  const handlePointerMove = (event) => {
    if (!dragState) return;
    const dx = Math.abs(event.clientX - dragState.startX);
    const dy = Math.abs(event.clientY - dragState.startY);
    if (dx > 4 || dy > 4) {
      dragState.moved = true;
    }
  };

  const handlePointerUp = () => {
    if (dragState?.moved) {
      suppressClickUntil = Date.now() + 250;
    }
    dragState = null;
  };

  treeEl.addEventListener('pointerdown', handlePointerDown);
  treeEl.addEventListener('pointermove', handlePointerMove);
  treeEl.addEventListener('pointerup', handlePointerUp);
  treeEl.addEventListener('pointerleave', handlePointerUp);
  treeEl.addEventListener('click', handleTreeClick);
  hydrateCollapsedState();

  return {
    ensureLoaded: load,
    bindCollapseAllButton: (button) => {
      if (!button) return;
      if (collapseAllButton && collapseAllHandler) {
        collapseAllButton.removeEventListener('click', collapseAllHandler);
      }
      collapseAllButton = button;
      collapseAllHandler = () => {
        const sections = Array.from(treeEl.querySelectorAll('.workspace-project-section'));
        const folders = Array.from(treeEl.querySelectorAll('.workspace-project-folder'));
        const hasItems = sections.length > 0 || folders.length > 0;
        const allCollapsed =
          hasItems
          && sections.every((node) => node.classList.contains('is-collapsed'))
          && folders.every((node) => node.classList.contains('is-collapsed'));
        setAllCollapsed(!allCollapsed);
      };
      collapseAllButton.addEventListener('click', collapseAllHandler);
      syncCollapseAllButton();
    },
    refresh: async () => {
      if (isLoading) return;
      hasLoaded = false;
      await load();
    },
    render: renderTree,
    teardown() {
      treeEl.removeEventListener('pointerdown', handlePointerDown);
      treeEl.removeEventListener('pointermove', handlePointerMove);
      treeEl.removeEventListener('pointerup', handlePointerUp);
      treeEl.removeEventListener('pointerleave', handlePointerUp);
      treeEl.removeEventListener('click', handleTreeClick);
      if (collapseAllButton && collapseAllHandler) {
        collapseAllButton.removeEventListener('click', collapseAllHandler);
      }
      collapseAllButton = null;
      collapseAllHandler = null;
    }
  };
}
