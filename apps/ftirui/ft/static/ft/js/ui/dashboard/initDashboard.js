import {
  fetchSections,
  createSection,
  createProject,
  createCanvas,
  updateSection,
  deleteSection,
  updateProject,
  deleteProject,
  updateCanvas,
  deleteCanvas,
  fetchCanvasState
} from '../../services/dashboard.js';

const LIST_SORT_STORAGE_KEY = 'ftir.dashboard.listSort.v1';

const DEFAULT_SECTION_NAME = 'Project';
const DEFAULT_PROJECT_NAME = 'Folder';

export function initDashboard() {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('dashboard_root');
  if (!root) return null;

  const listContainer = root.querySelector('[data-dashboard-list]');
  const galleryContainer = root.querySelector('[data-dashboard-gallery]');
  const emptyState = root.querySelector('[data-dashboard-empty]');
  const newSectionBtn = document.getElementById('dashboard_action_new_section');
  const newCanvasBtn = document.getElementById('dashboard_action_new_canvas');
  const sidebarTree = document.querySelector('[data-dashboard-sidebar]');
  const sidebarScrollContainer = document.querySelector('.dashboard-sidebar-scroll');
  const sidebarNav = document.querySelector('[data-sidebar-nav]');
  const sidebarNewProjectBtn = document.getElementById('dashboard_sidebar_new_project');
  const titleLabel = root.querySelector('[data-dashboard-title]');
  const titleIcon = root.querySelector('[data-dashboard-title-icon]');
  const latestContainer = document.querySelector('[data-dashboard-latest]');
  const latestSection = document.querySelector('[data-dashboard-latest-section]');
  const latestHeader = document.querySelector('[data-dashboard-latest-header]');
  const latestContent = document.querySelector('[data-dashboard-latest-content]');
  const searchInput = document.getElementById('dashboard_filter_search');
  const folderSelect = document.getElementById('dashboard_filter_folder');
  const sortSelect = document.getElementById('dashboard_filter_sort');
  const viewToggle = document.querySelector('[data-dashboard-view-toggle]');
  const devBadge = document.querySelector('[data-dashboard-dev-indicator]');

  const workspaceTabEnabled =
    document.body?.dataset?.workspaceTabEnabled === 'true';
  const workspaceRoute =
    document.body?.dataset?.workspaceRoute || '/workspace/';

  const readStoredListSort = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { field: 'title', direction: 'asc' };
    }
    try {
      const raw = window.localStorage.getItem(LIST_SORT_STORAGE_KEY);
      if (!raw) return { field: 'title', direction: 'asc' };
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.field === 'string' && typeof parsed.direction === 'string') {
        return {
          field: parsed.field,
          direction: parsed.direction === 'desc' ? 'desc' : 'asc'
        };
      }
    } catch {
      /* ignore */
    }
    return { field: 'title', direction: 'asc' };
  };

  const state = {
    sections: [],
    loading: false,
    sidebarView: 'home',
    expandedProjects: new Set(),
    expandedFolders: new Set(),
    activeSectionId: null,
    activeProjectId: null,
    latestCanvases: [],
    latestCanvasesFull: [],
    latestCollapsed: false,
    editingSectionId: null,
    editingFolderId: null,
    editingCanvasId: null,
    editingCanvasContext: null,
    openCanvasMenuId: null,
    openCanvasMenuContext: null,
    openOptionsFolderId: null,
    openSectionMenuId: null,
    filters: {
      search: '',
      section: 'all',
      folder: null,
      sort: 'modified',
      favoritesOnly: false
    },
    viewMode: 'list',
    devMode: new URLSearchParams(window.location.search).get('dev') === 'true',
    listSort: readStoredListSort()
  };
  const ROOT_FOLDER_SUMMARY = '__ftir_root__';
  const ROOT_FOLDER_LABEL = 'Loose canvases';

  const isHomeView = () =>
    state.sidebarView === 'home' &&
    state.filters.section === 'all' &&
    !state.filters.folder &&
    !state.filters.favoritesOnly;

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const escapeAttribute = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));
  const idsMatch = (left, right) => normalizeId(left) === normalizeId(right);

  const resolveClosest = (event, selector) => {
    if (!event || !selector) return null;
    const origin = event.target;
    if (origin instanceof Element) {
      return origin.closest(selector);
    }
    if (origin && origin.nodeType === Node.TEXT_NODE) {
      return origin.parentElement?.closest(selector) ?? null;
    }
    return null;
  };

  const getActiveSection = () => {
    if (!state.activeSectionId) return null;
    return (
      state.sections.find((section) => idsMatch(section.id, state.activeSectionId)) || null
    );
  };

  const shouldShowNewFolder = () =>
    Boolean(
      newSectionBtn &&
        !state.filters.favoritesOnly &&
        state.sidebarView !== 'latest' &&
        state.filters.section &&
        state.filters.section !== 'all' &&
        !state.filters.folder
    );

  const updateNewFolderVisibility = () => {
    if (!newSectionBtn) return;
    newSectionBtn.classList.toggle('d-none', !shouldShowNewFolder());
  };

  const updateMainTitle = () => {
    if (!titleLabel) return;
    let nextTitle = 'All Projects';
    if (state.sidebarView === 'latest') {
      nextTitle = 'Latest canvases';
    } else if (state.filters.favoritesOnly) {
      nextTitle = 'Favorites';
    } else {
      const activeFolder = state.activeProjectId ? findFolder(state.activeProjectId) : null;
      if (activeFolder) {
        nextTitle = activeFolder.title || 'Untitled folder';
      } else if (state.filters.section && state.filters.section !== 'all') {
        const section =
          state.sections.find((item) => idsMatch(item.id, state.filters.section)) || null;
        nextTitle = section?.name || 'All Projects';
      }
    }
    titleLabel.textContent = nextTitle;
    if (titleIcon) {
      let iconClass = 'bi-kanban';
      if (state.sidebarView === 'latest') {
        iconClass = 'bi-clock-history';
      } else if (state.sidebarView === 'favorites') {
        iconClass = 'bi-star';
      }
      titleIcon.className = `bi ${iconClass} text-primary`;
    }
    updateNewFolderVisibility();
    if (devBadge) {
      devBadge.classList.toggle('d-none', !state.devMode);
    }
  };

  const getFilteredSections = () => {
    let sections = Array.isArray(state.sections) ? state.sections : [];
    const {
      search,
      section: sectionFilter,
      folder: folderFilter,
      sort,
      favoritesOnly
    } = state.filters;
    const query = search.trim().toLowerCase();
    const effectiveSectionFilter = favoritesOnly ? 'all' : sectionFilter;
    const effectiveFolderFilter = favoritesOnly ? null : folderFilter;
    if (effectiveSectionFilter && effectiveSectionFilter !== 'all') {
      sections = sections.filter((section) => idsMatch(section.id, effectiveSectionFilter));
    }
    if (effectiveFolderFilter) {
      sections = sections.filter((section) =>
        (section.projects || []).some((project) => idsMatch(project.id, effectiveFolderFilter))
      );
    }
    const filtered = sections
      .map((section) => {
        const projects = (section.projects || [])
          .map((project) => {
            if (effectiveFolderFilter && !idsMatch(project.id, effectiveFolderFilter)) {
              return null;
            }
            let canvases = Array.isArray(project.canvases) ? [...project.canvases] : [];
            const matchesProject = query
              ? project.title?.toLowerCase().includes(query)
              : true;
            if (query && !matchesProject) {
              canvases = canvases.filter((canvas) =>
                (canvas.title || 'Untitled').toLowerCase().includes(query)
              );
              if (!canvases.length) {
                return null;
              }
            }
            if (favoritesOnly) {
              canvases = canvases.filter((canvas) => canvas.is_favorite);
              if (!canvases.length) {
                return null;
              }
            }
            canvases = sortCanvases(canvases, sort);
            return {
              ...project,
              canvases
            };
          })
          .filter(Boolean);
        if (!projects.length) {
          return null;
        }
        const sortedProjects = sortProjects(projects, sort);
        return {
          ...section,
          projects: sortedProjects
        };
      })
      .filter(Boolean);
    return filtered;
  };

  const render = () => {
    const filteredSections = getFilteredSections();
    const canvases = flattenCanvases(filteredSections);
    state.filteredCanvases = canvases;
    if (!canvases.length) {
      emptyState?.classList.add('is-visible');
    } else {
      emptyState?.classList.remove('is-visible');
    }
    renderList(canvases);
    renderGallery(canvases);
    updateView();
    renderSidebar();
    renderSidebarNav();
    updateMainTitle();
  };

  const formatRelative = (iso) => {
    if (!iso) return '—';
    try {
      const value = new Date(iso);
      if (Number.isNaN(value.getTime())) return iso;
      return value.toLocaleString();
    } catch {
      return iso;
    }
  };

  const ensureSectionSelection = () => {
    if (!Array.isArray(state.sections) || !state.sections.length) {
      state.activeSectionId = null;
      return;
    }
    if (state.filters.section === 'all') {
      if (!state.expandedProjects.size && state.sections.length) {
        state.expandedProjects.add(state.sections[0].id);
      }
      return;
    }
    if (!state.activeSectionId) {
      state.activeSectionId = state.filters.section || state.sections[0].id;
    }
    if (!idsMatch(state.activeSectionId, state.filters.section)) {
      state.activeSectionId = state.filters.section;
    }
    if (!state.expandedProjects.size) {
      state.expandedProjects.add(state.activeSectionId);
    }
  };

  const renderSidebarNav = () => {
    if (!sidebarNav) return;
    sidebarNav.querySelectorAll('.sidebar-nav-link').forEach((btn) => {
      const view = btn.dataset.view;
      let isActive = false;
      if (view === 'home') {
        isActive = isHomeView();
      } else {
        isActive = view === state.sidebarView;
      }
      btn.classList.toggle('is-active', isActive);
    });
  };

  const exitFavoritesView = () => {
    if (!state.filters.favoritesOnly && state.sidebarView !== 'favorites') return;
    state.filters.favoritesOnly = false;
    if (state.sidebarView === 'favorites') {
      state.sidebarView = 'home';
      renderSidebarNav();
      applyLatestBandVisibility();
    }
  };

  const applyLatestCollapsedState = () => {
    const collapsed = !!state.latestCollapsed;
    if (latestContent) {
      latestContent.hidden = collapsed;
    }
    if (latestHeader) {
      latestHeader.setAttribute('aria-expanded', String(!collapsed));
    }
    latestSection?.classList.toggle('is-collapsed', collapsed);
  };

  const toggleLatestCollapsed = () => {
    state.latestCollapsed = !state.latestCollapsed;
    applyLatestCollapsedState();
  };

  const applyLatestBandVisibility = () => {
    if (!latestSection) return;
    const hideBand = !isHomeView();
    latestSection.classList.toggle('d-none', hideBand);
  };

  applyLatestCollapsedState();
  applyLatestBandVisibility();

let draggingFolderId = null;
let draggingFolderRow = null;
let draggingCanvasId = null;
let draggingCanvasRow = null;
let sectionMenuPositionQueue = null;
let folderMenuPositionQueue = null;
let canvasMenuPositionQueue = null;

const clearProjectDropIndicators = () => {
  if (!sidebarTree) return;
  sidebarTree
      .querySelectorAll('.sidebar-project-row.is-drop-target')
      .forEach((row) => row.classList.remove('is-drop-target'));
    sidebarTree
      .querySelectorAll('.sidebar-folder-entry.is-drop-target')
      .forEach((row) => row.classList.remove('is-drop-target'));
  };

  const exitLatestView = () => {
    if (state.sidebarView !== 'latest') return;
    state.sidebarView = 'home';
    state.filters.sort = 'modified';
    renderSidebarNav();
    applyLatestBandVisibility();
  };

  const handleFolderDragStart = (event) => {
    const row = event.target.closest('.sidebar-folder-row[draggable="true"]');
    if (!row || !row.dataset.folderEntry) return;
    if (event.target.closest('.sidebar-folder-actions')) {
      event.preventDefault();
      return;
    }
    draggingFolderId = row.dataset.folderEntry;
    draggingFolderRow = row;
    row.classList.add('is-dragging');
    clearProjectDropIndicators();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', draggingFolderId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleFolderDragEnd = () => {
    if (draggingFolderRow) {
      draggingFolderRow.classList.remove('is-dragging');
    }
    draggingFolderId = null;
    draggingFolderRow = null;
    clearProjectDropIndicators();
  };

  const handleProjectDragOver = (event) => {
    if (draggingCanvasId) {
      const projectRow = event.target.closest('.sidebar-project-row[data-drop-project]');
      if (!projectRow) return;
      const sectionId = projectRow.dataset.dropProject;
      const owner = findCanvasOwner(draggingCanvasId);
      if (!owner) {
        projectRow.classList.remove('is-drop-target');
        return;
      }
      const isSameSection = idsMatch(owner.section.id, sectionId);
      const isAlreadyRoot = owner.project?.summary === ROOT_FOLDER_SUMMARY;
      if (isSameSection && isAlreadyRoot) {
        projectRow.classList.remove('is-drop-target');
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'none';
        }
        return;
      }
      event.preventDefault();
      projectRow.classList.add('is-drop-target');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      return;
    }
    if (!draggingFolderId) return;
    const projectRow = event.target.closest('.sidebar-project-row[data-drop-project]');
    if (!projectRow) return;
    const sectionId = projectRow.dataset.dropProject;
    const owner = findFolderOwner(draggingFolderId);
    if (!owner || idsMatch(owner.section.id, sectionId)) {
      projectRow.classList.remove('is-drop-target');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    event.preventDefault();
    projectRow.classList.add('is-drop-target');
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleProjectDragLeave = (event) => {
    const projectRow = event.target.closest('.sidebar-project-row[data-drop-project]');
    if (!projectRow) return;
    if (!projectRow.contains(event.relatedTarget)) {
      projectRow.classList.remove('is-drop-target');
    }
  };

  const handleProjectDrop = async (event) => {
    if (draggingCanvasId) {
      const projectRow = event.target.closest('.sidebar-project-row[data-drop-project]');
      if (!projectRow) return;
      event.preventDefault();
      const targetSectionId = projectRow.dataset.dropProject;
      const canvasId = draggingCanvasId;
      const owner = findCanvasOwner(canvasId);
      handleCanvasDragEnd();
      if (!owner) {
        return;
      }
      const isSameSection = idsMatch(owner.section.id, targetSectionId);
      const isAlreadyRoot = owner.project?.summary === ROOT_FOLDER_SUMMARY;
      if (isSameSection && isAlreadyRoot) {
        return;
      }
      const rootFolder =
        isSameSection && owner.project?.summary === ROOT_FOLDER_SUMMARY
          ? owner.project
          : await ensureRootFolder(targetSectionId);
      if (!rootFolder) return;
      await moveCanvasToFolder(canvasId, rootFolder.id);
      return;
    }
    if (!draggingFolderId) return;
    const projectRow = event.target.closest('.sidebar-project-row[data-drop-project]');
    if (!projectRow) return;
    event.preventDefault();
    const targetSectionId = projectRow.dataset.dropProject;
    const folderId = draggingFolderId;
    const owner = findFolderOwner(folderId);
    handleFolderDragEnd();
    if (!owner || idsMatch(owner.section.id, targetSectionId)) {
      return;
    }
    await moveFolderToSection(folderId, targetSectionId);
  };

  const handleCanvasDragStart = (event) => {
    const row = event.target.closest('.sidebar-folder-item[draggable="true"]');
    if (!row || !row.dataset.canvasEntry) return;
    if (event.target.closest('.sidebar-folder-item-actions')) {
      event.preventDefault();
      return;
    }
    draggingCanvasId = row.dataset.canvasEntry;
    draggingCanvasRow = row;
    row.classList.add('is-dragging');
    clearProjectDropIndicators();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', draggingCanvasId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleCanvasDragEnd = () => {
    if (draggingCanvasRow) {
      draggingCanvasRow.classList.remove('is-dragging');
    }
    draggingCanvasId = null;
    draggingCanvasRow = null;
    clearProjectDropIndicators();
  };

  const handleFolderTargetDragOver = (event) => {
    if (!draggingCanvasId) return;
    const folderEntryEl = event.target.closest('.sidebar-folder-entry[data-folder-entry]');
    if (!folderEntryEl) return;
    const folderId = folderEntryEl.dataset.folderEntry;
    const owner = findCanvasOwner(draggingCanvasId);
    if (!owner || idsMatch(owner.project.id, folderId)) {
      folderEntryEl.classList.remove('is-drop-target');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    event.preventDefault();
    folderEntryEl.classList.add('is-drop-target');
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleFolderTargetDragLeave = (event) => {
    const folderEntryEl = event.target.closest('.sidebar-folder-entry[data-folder-entry]');
    if (!folderEntryEl) return;
    if (!folderEntryEl.contains(event.relatedTarget)) {
      folderEntryEl.classList.remove('is-drop-target');
    }
  };

  const handleFolderTargetDrop = async (event) => {
    if (!draggingCanvasId) return;
    const folderEntryEl = event.target.closest('.sidebar-folder-entry[data-folder-entry]');
    if (!folderEntryEl) return;
    event.preventDefault();
    const targetFolderId = folderEntryEl.dataset.folderEntry;
    const canvasId = draggingCanvasId;
    const owner = findCanvasOwner(canvasId);
    handleCanvasDragEnd();
    if (!owner || idsMatch(owner.project.id, targetFolderId)) {
      return;
    }
    await moveCanvasToFolder(canvasId, targetFolderId);
  };

  function applyFloatingMenuPosition(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.position = 'fixed';
    menu.style.top = `${rect.top + window.scrollY}px`;
    menu.style.left = `${rect.right + window.scrollX}px`;
    menu.style.transformOrigin = '';
    menu.style.transform = '';
    menu.style.zIndex = '2000';
    return rect;
  }

  function resetFloatingMenuPosition(menu) {
    if (!menu) return;
    menu.style.display = '';
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.transform = '';
    menu.style.transformOrigin = '';
    menu.style.zIndex = '';
  }

  function positionSectionMenu(sectionId) {
    if (!sectionId) return;
    const menu = document.querySelector(`[data-section-menu="${sectionId}"]`);
    if (!menu) return;
    const anchor = menu.closest('.table-menu-anchor');
    if (!anchor) return;
    applyFloatingMenuPosition(menu, anchor);
  }

  function resetSectionMenuPosition(sectionId) {
    if (!sectionId) return;
    const menu = document.querySelector(`[data-section-menu="${sectionId}"]`);
    if (!menu) return;
    resetFloatingMenuPosition(menu);
  }

  function queueSectionMenuPosition(sectionId) {
    sectionMenuPositionQueue = sectionId;
    window.requestAnimationFrame(() => {
      if (!sectionMenuPositionQueue) return;
      const target = sectionMenuPositionQueue;
      sectionMenuPositionQueue = null;
      positionSectionMenu(target);
    });
  }

  function positionFolderMenu(folderId) {
    if (!folderId) return;
    const menu = document.querySelector(`[data-folder-menu="${folderId}"]`);
    if (!menu) return;
    const anchor = menu.closest('.table-menu-anchor');
    if (!anchor) return;
    applyFloatingMenuPosition(menu, anchor);
  }

  function resetFolderMenuPosition(folderId) {
    if (!folderId) return;
    const menu = document.querySelector(`[data-folder-menu="${folderId}"]`);
    if (!menu) return;
    resetFloatingMenuPosition(menu);
  }

  function queueFolderMenuPosition(folderId) {
    folderMenuPositionQueue = folderId;
    window.requestAnimationFrame(() => {
      if (!folderMenuPositionQueue) return;
      const target = folderMenuPositionQueue;
      folderMenuPositionQueue = null;
      positionFolderMenu(target);
    });
  }

  function positionCanvasMenu(canvasId) {
    if (!canvasId) return;
    const menu = document.querySelector(`.sidebar-folder-item [data-canvas-menu="${canvasId}"]`);
    if (!menu) return;
    const anchor = menu.closest('.table-menu-anchor');
    if (!anchor) return;
    applyFloatingMenuPosition(menu, anchor);
  }

  function resetCanvasMenuPosition(canvasId) {
    if (!canvasId) return;
    const menu = document.querySelector(`.sidebar-folder-item [data-canvas-menu="${canvasId}"]`);
    if (!menu) return;
    resetFloatingMenuPosition(menu);
  }

  function queueCanvasMenuPosition(canvasId) {
    canvasMenuPositionQueue = canvasId;
    window.requestAnimationFrame(() => {
      if (!canvasMenuPositionQueue) return;
      const target = canvasMenuPositionQueue;
      canvasMenuPositionQueue = null;
      positionCanvasMenu(target);
    });
  }

  const focusInlineEditors = () => {
    const focusInput = (selector) => {
      const node = document.querySelector(selector);
      if (node && typeof node.focus === 'function') {
        node.focus();
        if (typeof node.select === 'function') {
          node.select();
        }
      }
    };
    window.requestAnimationFrame(() => {
      if (state.editingSectionId) {
        const value = normalizeId(state.editingSectionId);
        const escaped = window.CSS?.escape ? window.CSS.escape(value) : value.replace(/"/g, '\\"');
        focusInput(`[data-inline-project="${escaped}"]`);
      }
      if (state.editingFolderId) {
        const value = normalizeId(state.editingFolderId);
        const escaped = window.CSS?.escape ? window.CSS.escape(value) : value.replace(/"/g, '\\"');
        focusInput(`[data-inline-folder="${escaped}"]`);
      }
      if (state.editingCanvasId) {
        const value = normalizeId(state.editingCanvasId);
        const escaped = window.CSS?.escape ? window.CSS.escape(value) : value.replace(/"/g, '\\"');
        const ctx = state.editingCanvasContext || 'sidebar';
        focusInput(`[data-inline-canvas="${escaped}"][data-inline-context="${ctx}"]`);
      }
    });
  };

  const renderSidebar = () => {
    const previousScrollTop =
      typeof sidebarScrollContainer?.scrollTop === 'number'
        ? sidebarScrollContainer.scrollTop
        : null;
    if (!sidebarTree) return;
    ensureSectionSelection();
    const sections = Array.isArray(state.sections) ? state.sections : [];
    if (!sections.length) {
      sidebarTree.innerHTML = '<p class="text-muted small mb-0">No projects yet.</p>';
      if (previousScrollTop !== null && sidebarScrollContainer) {
        sidebarScrollContainer.scrollTop = previousScrollTop;
      }
      return;
    }
    if (!state.expandedProjects.size && sections.length) {
      state.expandedProjects.add(sections[0].id);
    }

    const fragment = document.createDocumentFragment();
    sections.forEach((section) => {
      const projectExpanded = state.expandedProjects.has(section.id);
      const projectBlock = document.createElement('div');
      projectBlock.className = `sidebar-project${projectExpanded ? ' is-open' : ''}`;
      const projectRow = document.createElement('div');
      const projectSelected =
        state.filters.section !== 'all' && idsMatch(state.filters.section, section.id);
      projectRow.className = 'sidebar-project-row';
      const isEditingProject = idsMatch(state.editingSectionId, section.id);
      const isPinned = section.is_pinned === true;
      const pinIcon = isPinned ? 'bi-pin-angle-fill' : 'bi-pin-angle';
      const pinTitle = isPinned ? 'Unpin project' : 'Pin project';
      const projectLabelMarkup = isEditingProject
        ? `
          <div class="sidebar-project-link sidebar-inline-wrapper">
            <input
              type="text"
              class="sidebar-inline-input"
              data-inline-project="${section.id}"
              data-initial-value="${escapeAttribute(section.name)}"
              value="${escapeAttribute(section.name)}"
              maxlength="120"
              placeholder="Project name"
              aria-label="Edit project name"
              autocomplete="off"
            />
          </div>
        `
        : `
          <button
            type="button"
            class="sidebar-project-link${projectSelected ? ' is-selected' : ''}"
            data-action="select-project"
            data-section="${section.id}"
          >
            <span>${escapeHtml(section.name)}</span>
          </button>
        `;
      const sectionMenuOpen = idsMatch(state.openSectionMenuId, section.id);
      projectRow.innerHTML = `
        <button
          type="button"
          class="sidebar-project-toggle"
          data-action="toggle-project"
          data-section="${section.id}"
          aria-label="Toggle project"
        >
          <i class="bi bi-chevron-right sidebar-project-chevron"></i>
        </button>
        ${projectLabelMarkup}
        <span class="sidebar-project-actions${sectionMenuOpen ? ' is-menu-open' : ''}">
          <button type="button" class="sidebar-project-icon${isPinned ? ' is-active' : ''}" data-action="section-pin" data-section="${section.id}" title="${pinTitle}" aria-pressed="${isPinned}">
            <i class="bi ${pinIcon}"></i>
          </button>
          <button type="button" class="sidebar-project-icon" data-action="section-add-folder" data-section="${section.id}" title="Create folder">
            <i class="bi bi-folder-plus"></i>
          </button>
          <button type="button" class="sidebar-project-icon" data-action="section-create-canvas" data-section="${section.id}" title="New canvas">
            <i class="bi bi-plus-square"></i>
          </button>
          <div class="table-menu-anchor">
            <button type="button" class="sidebar-project-icon" data-action="section-options" data-section="${section.id}" title="More options">
              <i class="bi bi-three-dots"></i>
            </button>
            <div class="canvas-menu sidebar-project-menu${sectionMenuOpen ? ' is-open' : ''}" data-section-menu="${section.id}">
              <button type="button" class="sidebar-menu-item" data-action="section-rename" data-section="${section.id}">
                <i class="bi bi-pencil"></i>
                <span>Rename</span>
              </button>
              <button type="button" class="sidebar-menu-item" data-action="section-delete" data-section="${section.id}">
                <i class="bi bi-trash"></i>
                <span>Delete</span>
              </button>
              <button type="button" class="sidebar-menu-item" data-action="section-share" data-section="${section.id}">
                <i class="bi bi-share"></i>
                <span>Share</span>
              </button>
              <button type="button" class="sidebar-menu-item" data-action="section-details" data-section="${section.id}">
                <i class="bi bi-info-circle"></i>
                <span>Details</span>
              </button>
            </div>
          </div>
        </span>
      `;
      projectRow.dataset.dropProject = section.id;
      projectBlock.appendChild(projectRow);

      const folderList = document.createElement('div');
      folderList.className = 'sidebar-folder-children';
      if (!projectExpanded) {
        folderList.hidden = true;
      }

      const folders = Array.isArray(section.projects) ? section.projects : [];
      if (!folders.length) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small px-2';
        empty.textContent = 'No folders yet';
        folderList.appendChild(empty);
      } else {
        folders.forEach((folder) => {
          const folderExpanded = state.expandedFolders.has(folder.id);
          const folderEntry = document.createElement('div');
          const folderSelected = idsMatch(state.filters.folder, folder.id);
          folderEntry.className = `sidebar-folder-entry${folderExpanded ? ' is-open' : ''}`;
          folderEntry.dataset.folderEntry = folder.id;
          const menuOpen = idsMatch(state.openOptionsFolderId, folder.id);
          const isEditingFolder = idsMatch(state.editingFolderId, folder.id);
          const folderLabelMarkup = isEditingFolder
            ? `
              <div class="sidebar-folder-label sidebar-inline-wrapper">
                <input
                  type="text"
                  class="sidebar-inline-input"
                  data-inline-folder="${folder.id}"
                  data-initial-value="${escapeAttribute(folder.title || 'Untitled folder')}"
                  value="${escapeAttribute(folder.title || 'Untitled folder')}"
                  maxlength="140"
                  placeholder="Folder name"
                  aria-label="Edit folder name"
                  autocomplete="off"
                />
              </div>
            `
            : `
              <button
                type="button"
                class="sidebar-folder-label${folderSelected ? ' is-selected' : ''}"
                data-action="select-folder"
                data-folder="${folder.id}"
              >
                <span>${escapeHtml(folder.title || 'Untitled folder')}</span>
              </button>
            `;
          folderEntry.innerHTML = `
            <div class="sidebar-folder-row">
              <button
                type="button"
                class="sidebar-folder-toggle"
                data-action="toggle-folder"
                data-folder="${folder.id}"
                aria-label="Toggle folder"
              >
                <i class="bi bi-chevron-right sidebar-folder-chevron"></i>
              </button>
              ${folderLabelMarkup}
              <div class="sidebar-folder-actions${menuOpen ? ' is-menu-open' : ''}">
                <button type="button" class="sidebar-folder-icon" data-action="folder-create-canvas" data-project="${folder.id}" title="New canvas">
                  <i class="bi bi-plus-lg"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-rename" data-folder="${folder.id}" title="Rename folder">
                  <i class="bi bi-pencil"></i>
                </button>
                <div class="table-menu-anchor">
                  <button type="button" class="sidebar-folder-icon" data-action="folder-options" data-folder="${folder.id}" title="More options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                  <div class="canvas-menu sidebar-folder-menu${menuOpen ? ' is-open' : ''}" data-folder-menu="${folder.id}">
                <button type="button" class="sidebar-menu-item" data-action="folder-menu-move" data-folder="${folder.id}">
                  <i class="bi bi-arrow-left-right"></i>
                  <span>Move to project</span>
                </button>
                <button type="button" class="sidebar-menu-item" data-action="folder-menu-delete" data-folder="${folder.id}">
                  <i class="bi bi-trash"></i>
                  <span>Delete folder</span>
                </button>
                <button type="button" class="sidebar-menu-item" data-action="folder-menu-details" data-folder="${folder.id}">
                  <i class="bi bi-info-circle"></i>
                  <span>Details</span>
                </button>
                <button type="button" class="sidebar-menu-item" data-action="folder-menu-share" data-folder="${folder.id}">
                  <i class="bi bi-share"></i>
                  <span>Share</span>
                </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="sidebar-canvas-list"${folderExpanded ? '' : ' hidden'}>
            </div>
          `;
          const folderRowNode = folderEntry.querySelector('.sidebar-folder-row');
          if (folderRowNode) {
            folderRowNode.dataset.folderEntry = folder.id;
            if (!isEditingFolder) {
              folderRowNode.setAttribute('draggable', 'true');
            } else {
              folderRowNode.removeAttribute('draggable');
            }
          }

          const canvasList = folderEntry.querySelector('.sidebar-canvas-list');
          const canvases = Array.isArray(folder.canvases) ? folder.canvases : [];
          if (!canvases.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'text-muted small px-4';
            placeholder.textContent = 'No canvases yet';
            canvasList?.appendChild(placeholder);
        } else {
          canvases.forEach((canvas) => {
            const canvasRow = document.createElement('div');
            canvasRow.className = 'sidebar-folder-item';
            canvasRow.dataset.canvasEntry = canvas.id;
            const canvasMenuOpen = isCanvasMenuOpen(canvas.id, 'sidebar');
            const canvasFavorite = Boolean(canvas.is_favorite);
            const isEditingCanvas = idsMatch(state.editingCanvasId, canvas.id);
            const isSidebarInline = isEditingCanvas && state.editingCanvasContext === 'sidebar';
            if (!isSidebarInline) {
              canvasRow.setAttribute('draggable', 'true');
            } else {
              canvasRow.removeAttribute('draggable');
            }
            const canvasLabelMarkup = isSidebarInline
              ? `
                <div class="sidebar-folder-link sidebar-inline-wrapper">
                  <input
                    type="text"
                    class="sidebar-inline-input"
                    data-inline-canvas="${canvas.id}"
                    data-inline-context="sidebar"
                    data-initial-value="${escapeAttribute(canvas.title || 'Untitled canvas')}"
                    value="${escapeAttribute(canvas.title || 'Untitled canvas')}"
                    maxlength="140"
                    placeholder="Canvas name"
                    aria-label="Edit canvas name"
                    autocomplete="off"
                  />
                </div>
              `
              : `
                <button
                  type="button"
                  class="sidebar-folder-link"
                  data-action="sidebar-open-canvas"
                  data-canvas="${canvas.id}"
                  data-folder="${folder.id}"
                >
                  ${escapeHtml(canvas.title || 'Untitled canvas')}
                </button>
              `;
            canvasRow.innerHTML = `
                ${canvasLabelMarkup}
                <div class="sidebar-folder-item-actions${canvasMenuOpen ? ' is-menu-open' : ''}">
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-duplicate" data-context="sidebar" data-canvas="${canvas.id}" title="Duplicate canvas">
                    <i class="bi bi-files"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon${canvasFavorite ? ' is-active' : ''}" data-action="canvas-favorite" data-context="sidebar" data-canvas="${canvas.id}" title="Favorite canvas" aria-pressed="${canvasFavorite}" data-favorite="${canvasFavorite ? '1' : '0'}">
                    <i class="bi bi-star"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-rename" data-context="sidebar" data-canvas="${canvas.id}" title="Rename canvas">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <div class="table-menu-anchor">
                    <button type="button" class="sidebar-folder-icon" data-action="canvas-options" data-context="sidebar" data-canvas="${canvas.id}" title="Canvas options">
                      <i class="bi bi-three-dots"></i>
                    </button>
                    <div class="canvas-menu sidebar-canvas-menu${canvasMenuOpen ? ' is-open' : ''}" data-canvas-menu="${canvas.id}">
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-open" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-box-arrow-up-right"></i>
                    <span>Open canvas</span>
                  </button>
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-duplicate" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-files"></i>
                    <span>Duplicate canvas</span>
                  </button>
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-rename" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-pencil"></i>
                    <span>Rename canvas</span>
                  </button>
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-move" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-arrow-left-right"></i>
                    <span>Move to folder</span>
                  </button>
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-delete" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-trash"></i>
                    <span>Delete canvas</span>
                  </button>
                  <button type="button" class="sidebar-menu-item" data-action="canvas-menu-share" data-context="sidebar" data-canvas="${canvas.id}">
                    <i class="bi bi-share"></i>
                    <span>Share canvas</span>
                  </button>
                    </div>
                  </div>
                </div>
              `;
              canvasList?.appendChild(canvasRow);
            });
          }

          folderList.appendChild(folderEntry);
        });
      }

      projectBlock.appendChild(folderList);
      fragment.appendChild(projectBlock);
    });
    sidebarTree.replaceChildren(fragment);
    if (previousScrollTop !== null && sidebarScrollContainer) {
      sidebarScrollContainer.scrollTop = previousScrollTop;
    }
    if (state.openSectionMenuId) {
      queueSectionMenuPosition(state.openSectionMenuId);
    }
    if (state.openOptionsFolderId) {
      queueFolderMenuPosition(state.openOptionsFolderId);
    }
    if (state.openCanvasMenuId && state.openCanvasMenuContext === 'sidebar') {
      queueCanvasMenuPosition(state.openCanvasMenuId);
    }
    focusInlineEditors();
  };

  const clearInlineEditing = () => {
    state.editingSectionId = null;
    state.editingFolderId = null;
    state.editingCanvasId = null;
    state.editingCanvasContext = null;
  };

  const closeFolderMenu = () => {
    if (state.openOptionsFolderId !== null) {
      resetFolderMenuPosition(state.openOptionsFolderId);
      state.openOptionsFolderId = null;
      renderSidebar();
    }
  };

  const toggleFolderMenu = (folderId) => {
    if (!folderId) return;
    const isSame = idsMatch(state.openOptionsFolderId, folderId);
    if (isSame) {
      resetFolderMenuPosition(folderId);
      state.openOptionsFolderId = null;
      renderSidebar();
      return;
    }
    state.openOptionsFolderId = folderId;
    renderSidebar();
    queueFolderMenuPosition(folderId);
  };

  const closeCanvasMenu = () => {
    if (state.openCanvasMenuId !== null) {
      if (state.openCanvasMenuContext === 'sidebar') {
        resetCanvasMenuPosition(state.openCanvasMenuId);
      }
      state.openCanvasMenuId = null;
      state.openCanvasMenuContext = null;
      render();
    }
  };

  const closeSectionMenu = () => {
    if (state.openSectionMenuId !== null) {
      resetSectionMenuPosition(state.openSectionMenuId);
      state.openSectionMenuId = null;
      renderSidebar();
    }
  };

  const toggleSectionMenu = (sectionId) => {
    if (!sectionId) return;
    const isSame = idsMatch(state.openSectionMenuId, sectionId);
    if (isSame) {
      closeSectionMenu();
      return;
    }
    state.openSectionMenuId = sectionId;
    renderSidebar();
    queueSectionMenuPosition(sectionId);
  };

  const toggleCanvasMenu = (canvasId, context = 'sidebar') => {
    if (!canvasId) return;
    const isSame =
      idsMatch(state.openCanvasMenuId, canvasId) && state.openCanvasMenuContext === context;
    if (isSame) {
      if (context === 'sidebar') {
        resetCanvasMenuPosition(canvasId);
      }
      state.openCanvasMenuId = null;
      state.openCanvasMenuContext = null;
      render();
      return;
    }
    state.openCanvasMenuId = canvasId;
    state.openCanvasMenuContext = context;
    render();
    if (context === 'sidebar') {
      queueCanvasMenuPosition(canvasId);
    }
  };

  const isCanvasMenuOpen = (canvasId, context) =>
    idsMatch(state.openCanvasMenuId, canvasId) && state.openCanvasMenuContext === context;

  const handleCanvasAction = (action, trigger, event = null) => {
    if (!action || !trigger) return false;
    const canvasId = trigger.dataset.canvas;
    const context = trigger.dataset.context || 'sidebar';
    const stop = () => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    };
    if (action === 'canvas-duplicate' && canvasId) {
      stop();
      closeCanvasMenu();
      void handleDuplicateCanvas(canvasId);
      return true;
    }
    if (action === 'canvas-favorite' && canvasId) {
      stop();
      closeCanvasMenu();
      void handleToggleCanvasFavorite(canvasId);
      return true;
    }
    if (action === 'canvas-rename' && canvasId) {
      stop();
      beginCanvasRename(canvasId, context);
      return true;
    }
    if (action === 'canvas-options' && canvasId) {
      stop();
      toggleCanvasMenu(canvasId, context);
      return true;
    }
    if (action === 'canvas-menu-open' && canvasId) {
      stop();
      closeCanvasMenu();
      navigateToCanvas(canvasId);
      return true;
    }
    if (action === 'canvas-menu-duplicate' && canvasId) {
      stop();
      closeCanvasMenu();
      void handleDuplicateCanvas(canvasId);
      return true;
    }
    if (action === 'canvas-menu-rename' && canvasId) {
      stop();
      beginCanvasRename(canvasId, context);
      return true;
    }
    if (action === 'canvas-menu-move' && canvasId) {
      stop();
      closeCanvasMenu();
      void handleMoveCanvas(canvasId);
      return true;
    }
    if (action === 'canvas-menu-delete' && canvasId) {
      stop();
      closeCanvasMenu();
      void handleDeleteCanvas(canvasId);
      return true;
    }
    if (action === 'canvas-menu-share' && canvasId) {
      stop();
      closeCanvasMenu();
      window.showAppToast?.({
        title: 'Share coming soon',
        message: 'Sharing workflow is not enabled yet.',
        variant: 'info'
      });
      return true;
    }
    return false;
  };

  const beginProjectRename = (sectionId) => {
    if (!sectionId) return;
    state.editingSectionId = sectionId;
    state.editingFolderId = null;
    state.editingCanvasId = null;
    renderSidebar();
  };

  const beginFolderRename = (folderId) => {
    if (!folderId) return;
    state.editingFolderId = folderId;
    state.editingSectionId = null;
    state.editingCanvasId = null;
    renderSidebar();
  };

  const beginCanvasRename = (canvasId, context = 'sidebar') => {
    if (!canvasId) return;
    state.editingCanvasId = canvasId;
    state.editingCanvasContext = context;
    state.editingSectionId = null;
    state.editingFolderId = null;
    closeCanvasMenu();
    render();
  };

  const resetToAllProjects = () => {
    state.filters.favoritesOnly = false;
    state.filters.section = 'all';
    state.filters.folder = null;
    state.activeSectionId = null;
    state.activeProjectId = null;
    if (folderSelect) {
      folderSelect.value = 'all';
    }
  };

  const isInlineInput = (node) =>
    node instanceof HTMLInputElement &&
    (node.dataset.inlineProject || node.dataset.inlineFolder || node.dataset.inlineCanvas);

  const finalizeInlineEdit = (input, { cancel = false } = {}) => {
    if (!input || input.dataset.inlineSubmitted === 'true') return;
    input.dataset.inlineSubmitted = 'true';
    const value = input.value;
    const sectionId = input.dataset.inlineProject;
    const folderId = input.dataset.inlineFolder;
    const canvasId = input.dataset.inlineCanvas;
    clearInlineEditing();
    renderSidebar();
    if (cancel) return;
    if (sectionId) {
      void handleRenameProject(sectionId, value);
    } else if (folderId) {
      void handleRenameFolder(folderId, value);
    } else if (canvasId) {
      void handleRenameCanvas(canvasId, value);
    }
  };

  const updateFolderOptions = () => {
    if (!folderSelect) return;
    if (state.filters.favoritesOnly) {
      folderSelect.value = 'all';
      state.filters.section = 'all';
      state.filters.folder = null;
      return;
    }
    const current = state.filters.section || 'all';
    const options = ['<option value="all">All folders</option>'];
    (state.sections || []).forEach((section) => {
      options.push(`<option value="${section.id}">${escapeHtml(section.name)}</option>`);
    });
    folderSelect.innerHTML = options.join('');
    const valid =
      current === 'all' ||
      (state.sections || []).some((section) => idsMatch(section.id, current));
    const nextValue = valid ? current : 'all';
    folderSelect.value = nextValue;
    state.filters.section = nextValue;
  };

  const ensureFilterTargets = () => {
    if (state.filters.favoritesOnly) {
      state.filters.section = 'all';
      state.filters.folder = null;
      if (folderSelect) {
        folderSelect.value = 'all';
      }
      return;
    }
    const hasSection =
      state.filters.section === 'all' ||
      (state.sections || []).some((section) => idsMatch(section.id, state.filters.section));
    if (!hasSection) {
      state.filters.section = 'all';
      state.activeSectionId = null;
      if (folderSelect) {
        folderSelect.value = 'all';
      }
    }
    if (state.filters.folder) {
      const folderExists = (state.sections || []).some((section) =>
        (section.projects || []).some((project) => idsMatch(project.id, state.filters.folder))
      );
      if (!folderExists) {
        state.filters.folder = null;
        state.activeProjectId = null;
      }
    }
  };

  const computeLatestCanvases = () => {
    const canvases = [];
    (state.sections || []).forEach((section) => {
      (section.projects || []).forEach((project) => {
        (project.canvases || []).forEach((canvas) => {
          canvases.push({
            id: canvas.id,
            title: canvas.title || 'Untitled canvas',
            updated: canvas.updated,
            folderName: project.title || 'Untitled folder',
            projectTitle: section.name || 'Untitled project',
            owner: canvas.owner || 'You'
          });
        });
      });
    });
    canvases.sort((a, b) => {
      const aTime = new Date(a.updated || 0).getTime();
      const bTime = new Date(b.updated || 0).getTime();
      return bTime - aTime;
    });
    state.latestCanvasesFull = canvases;
    state.latestCanvases = canvases.slice(0, 6);
    renderLatest();
  };

  const renderLatest = () => {
    if (!latestContainer) return;
    latestContainer.innerHTML = '';
    if (!state.latestCanvases.length) {
      latestContainer.innerHTML =
        '<p class="text-muted small mb-0">No recent canvases yet.</p>';
      return;
    }
    state.latestCanvases.forEach((canvas) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'latest-card';
      card.dataset.canvas = canvas.id;
      card.innerHTML = `
        <div class="latest-card-thumb" aria-hidden="true"></div>
        <div class="latest-card-title">${escapeHtml(canvas.title)}</div>
        <div class="latest-card-time">${formatRelative(canvas.updated)}</div>
        <div class="latest-card-meta">
          ${escapeHtml(canvas.projectTitle)} &bull; ${escapeHtml(canvas.folderName)}
        </div>
      `;
      card.addEventListener('click', () => navigateToCanvas(canvas.id));
      latestContainer.appendChild(card);
    });
  };

  const flattenCanvases = (sections) => {
    const rows = [];
    sections.forEach((section) => {
      (section.projects || []).forEach((project) => {
        (project.canvases || []).forEach((canvas) => {
          rows.push({
            id: canvas.id,
            title: canvas.title || 'Untitled canvas',
            projectTitle: section.name || 'Untitled project',
            folderName: project.title || 'Untitled folder',
            updated: canvas.updated,
            owner: canvas.owner || 'You',
            tags: canvas.tags || [],
            type: canvas.type || '',
            isFavorite: Boolean(canvas.is_favorite)
          });
        });
      });
    });
    return rows;
  };

  const getListSortConfig = () => {
    const sort = state.listSort || { field: 'title', direction: 'asc' };
    const allowed = new Set(['title', 'projectTitle', 'folderName', 'updated', 'owner']);
    const field = allowed.has(sort.field) ? sort.field : 'title';
    const direction = sort.direction === 'desc' ? 'desc' : 'asc';
    return { field, direction };
  };

  const formatModifiedDay = (iso) => {
    if (!iso) return 'Unknown date';
    try {
      const value = new Date(iso);
      if (Number.isNaN(value.getTime())) return 'Unknown date';
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const sameDay = value.toDateString() === today.toDateString();
      const sameYesterday = value.toDateString() === yesterday.toDateString();
      if (sameDay) return 'Today';
      if (sameYesterday) return 'Yesterday';
      return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Unknown date';
    }
  };

  const formatModifiedSummary = (canvas) => {
    const owner = canvas.owner || 'You';
    const day = formatModifiedDay(canvas.updated);
    return `Modified by ${owner} • ${day}`;
  };

  const renderTagList = (tags) => {
    if (!Array.isArray(tags) || !tags.length) {
      return '<span class="dashboard-tag is-empty">—</span>';
    }
    return tags
      .slice(0, 5)
      .map((tag) => `<span class="dashboard-tag">${escapeHtml(tag)}</span>`)
      .join('');
  };

  const renderListHeaderCell = (label, field) => {
    const sortConfig = getListSortConfig();
    const isActive = sortConfig.field === field;
    const iconClass = isActive
      ? sortConfig.direction === 'asc'
        ? 'bi-caret-up-fill'
        : 'bi-caret-down-fill'
      : 'bi-caret-up';
    return `
      <th>
        <button
          type="button"
          class="table-sort-btn${isActive ? ' is-active' : ''}"
          data-action="list-sort"
          data-sort="${field}"
        >
          <span class="table-sort-label">${label}</span>
          <span class="table-sort-icon">
            <i class="bi ${iconClass}" aria-hidden="true"></i>
          </span>
        </button>
      </th>
    `;
  };

  const getActiveViewContext = () => {
    if (state.filters.favoritesOnly) {
      return { mode: 'favorites' };
    }
    if (state.filters.folder) {
      return {
        mode: 'folder',
        sectionId: state.filters.section,
        folderId: state.filters.folder
      };
    }
    if (state.filters.section && state.filters.section !== 'all') {
      return {
        mode: 'section',
        sectionId: state.filters.section,
        folderId: null
      };
    }
    return {
      mode: 'section',
      sectionId: 'all',
      folderId: null
    };
  };

  const applyViewContext = (context) => {
    if (!context) return;
    if (context.mode === 'favorites') {
      state.filters.favoritesOnly = true;
      state.filters.section = 'all';
      state.filters.folder = null;
      state.activeSectionId = null;
      state.activeProjectId = null;
      state.sidebarView = 'favorites';
      if (folderSelect) {
        folderSelect.value = 'all';
      }
      renderSidebarNav();
      return;
    }
    exitFavoritesView();
    if (context.mode === 'folder' && context.folderId) {
      const owner = findFolderOwner(context.folderId);
      if (owner) {
        state.filters.section = owner.section.id;
        state.filters.folder = owner.project.id;
        state.activeSectionId = owner.section.id;
        state.activeProjectId = owner.project.id;
        if (folderSelect) {
          folderSelect.value = owner.section.id;
        }
        state.expandedProjects.add(owner.section.id);
        state.expandedFolders.add(owner.project.id);
        return;
      }
    }
    if (context.mode === 'section' && context.sectionId && context.sectionId !== 'all') {
      const exists = (state.sections || []).some((section) => idsMatch(section.id, context.sectionId));
      if (exists) {
        state.filters.section = context.sectionId;
        state.filters.folder = null;
        state.activeSectionId = context.sectionId;
        state.activeProjectId = null;
        if (folderSelect) {
          folderSelect.value = context.sectionId;
        }
        state.expandedProjects.add(context.sectionId);
        return;
      }
    }
    state.filters.section = 'all';
    state.filters.folder = null;
    state.activeSectionId = null;
    state.activeProjectId = null;
    if (folderSelect) {
      folderSelect.value = 'all';
    }
  };

  const renderList = (canvases) => {
    if (!listContainer) return;
    if (!canvases.length) {
      listContainer.innerHTML = '';
      return;
    }
    const sortConfig = getListSortConfig();
    const rows = [...canvases]
      .sort((a, b) => {
        const { field, direction } = sortConfig;
        const dir = direction === 'desc' ? -1 : 1;
        if (field === 'updated') {
          const timeA = new Date(a.updated || 0).getTime();
          const timeB = new Date(b.updated || 0).getTime();
          return (timeA - timeB) * dir;
        }
        const valueA = (a[field] || '').toString().toLowerCase();
        const valueB = (b[field] || '').toString().toLowerCase();
        if (valueA === valueB) return 0;
        return valueA > valueB ? dir : -dir;
      })
      .map((canvas) => {
        const canvasMenuOpen = isCanvasMenuOpen(canvas.id, 'list');
        const isFavorite = Boolean(canvas.isFavorite);
        const isEditingCanvas = idsMatch(state.editingCanvasId, canvas.id);
        const showInline = isEditingCanvas && state.editingCanvasContext === 'list';
        const titleCell = showInline
          ? `
            <div class="sidebar-inline-wrapper w-100">
              <input
                type="text"
                class="sidebar-inline-input"
                data-inline-canvas="${canvas.id}"
                data-inline-context="list"
                data-initial-value="${escapeAttribute(canvas.title)}"
                value="${escapeAttribute(canvas.title)}"
                maxlength="140"
                placeholder="Canvas name"
                aria-label="Edit canvas name"
                autocomplete="off"
              />
            </div>
          `
          : `
            <button type="button" class="dashboard-list-name" data-action="open-canvas" data-canvas="${canvas.id}">
              <span class="dashboard-list-name-title">${escapeHtml(canvas.title)}</span>
              <span class="dashboard-list-name-meta">${formatModifiedSummary(canvas)}</span>
            </button>
          `;
        return `
          <tr>
            <td class="cell-name">
              ${titleCell}
            </td>
            <td class="cell-tags">
              <div class="dashboard-tags-list">${renderTagList(canvas.tags)}</div>
            </td>
            <td>${escapeHtml(canvas.projectTitle)}</td>
            <td>${escapeHtml(canvas.folderName)}</td>
            <td class="cell-meta">${formatRelative(canvas.updated)}</td>
            <td class="cell-meta">${escapeHtml(canvas.owner)}</td>
            <td class="table-actions">
              <div class="table-action-buttons">
                <button type="button" class="table-icon-btn" data-action="canvas-duplicate" data-context="list" data-canvas="${canvas.id}" title="Duplicate canvas">
                  <i class="bi bi-files"></i>
                </button>
                <button type="button" class="table-icon-btn${isFavorite ? ' is-active' : ''}" data-action="canvas-favorite" data-context="list" data-canvas="${canvas.id}" title="Favorite canvas" aria-pressed="${isFavorite}" data-favorite="${isFavorite ? '1' : '0'}">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-rename" data-context="list" data-canvas="${canvas.id}" title="Rename canvas">
                  <i class="bi bi-pencil"></i>
                </button>
                <div class="table-menu-anchor">
                  <button type="button" class="table-icon-btn" data-action="canvas-options" data-context="list" data-canvas="${canvas.id}" title="Canvas options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                  <div class="canvas-menu dashboard-canvas-menu${canvasMenuOpen ? ' is-open' : ''}" data-canvas-menu="${canvas.id}">
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-open" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-box-arrow-up-right"></i>
                      <span>Open canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-duplicate" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-files"></i>
                      <span>Duplicate canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-rename" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-pencil"></i>
                      <span>Rename canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-move" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-arrow-left-right"></i>
                      <span>Move to folder</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-delete" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-trash"></i>
                      <span>Delete canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-share" data-context="list" data-canvas="${canvas.id}">
                      <i class="bi bi-share"></i>
                      <span>Share canvas</span>
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
    listContainer.innerHTML = `
      <div class="dashboard-table-wrapper">
        <table class="dashboard-table">
          <thead>
            <tr>
              ${renderListHeaderCell('Name', 'title')}
              <th class="dashboard-tags-header">tags</th>
              ${renderListHeaderCell('Project', 'projectTitle')}
              ${renderListHeaderCell('Folder', 'folderName')}
              ${renderListHeaderCell('Last modified', 'updated')}
              ${renderListHeaderCell('Owner', 'owner')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderGallery = (canvases) => {
    if (!galleryContainer) return;
    if (!canvases.length) {
      galleryContainer.innerHTML = '';
      return;
    }
    galleryContainer.innerHTML = canvases
      .map((canvas) => {
        const canvasMenuOpen = isCanvasMenuOpen(canvas.id, 'gallery');
        const isFavorite = Boolean(canvas.isFavorite);
        const isEditingCanvas = idsMatch(state.editingCanvasId, canvas.id);
        const showInline = isEditingCanvas && state.editingCanvasContext === 'gallery';
        const titleBlock = showInline
          ? `
            <div class="sidebar-inline-wrapper w-100">
              <input
                type="text"
                class="sidebar-inline-input"
                data-inline-canvas="${canvas.id}"
                data-inline-context="gallery"
                data-initial-value="${escapeAttribute(canvas.title)}"
                value="${escapeAttribute(canvas.title)}"
                maxlength="140"
                placeholder="Canvas name"
                aria-label="Edit canvas name"
                autocomplete="off"
              />
            </div>
          `
          : `<div class="dashboard-gallery-title">${escapeHtml(canvas.title)}</div>`;
        return `
          <article class="dashboard-gallery-card">
            <div class="dashboard-gallery-thumb" aria-hidden="true"></div>
            ${titleBlock}
            <div class="dashboard-gallery-meta">${formatRelative(canvas.updated)} • ${escapeHtml(canvas.projectTitle)}</div>
            <div class="table-actions">
              <div class="table-action-buttons">
                <button type="button" class="table-icon-btn" data-action="canvas-duplicate" data-context="gallery" data-canvas="${canvas.id}" title="Duplicate canvas">
                  <i class="bi bi-files"></i>
                </button>
                <button type="button" class="table-icon-btn${isFavorite ? ' is-active' : ''}" data-action="canvas-favorite" data-context="gallery" data-canvas="${canvas.id}" title="Favorite canvas" aria-pressed="${isFavorite}" data-favorite="${isFavorite ? '1' : '0'}">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-rename" data-context="gallery" data-canvas="${canvas.id}" title="Rename canvas">
                  <i class="bi bi-pencil"></i>
                </button>
                <div class="table-menu-anchor">
                  <button type="button" class="table-icon-btn" data-action="canvas-options" data-context="gallery" data-canvas="${canvas.id}" title="Canvas options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                  <div class="canvas-menu dashboard-canvas-menu${canvasMenuOpen ? ' is-open' : ''}" data-canvas-menu="${canvas.id}">
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-open" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-box-arrow-up-right"></i>
                      <span>Open canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-duplicate" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-files"></i>
                      <span>Duplicate canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-rename" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-pencil"></i>
                      <span>Rename canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-move" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-arrow-left-right"></i>
                      <span>Move to folder</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-delete" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-trash"></i>
                      <span>Delete canvas</span>
                    </button>
                    <button type="button" class="sidebar-menu-item" data-action="canvas-menu-share" data-context="gallery" data-canvas="${canvas.id}">
                      <i class="bi bi-share"></i>
                      <span>Share canvas</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const updateView = () => {
    if (!listContainer || !galleryContainer || !viewToggle) return;
    listContainer.classList.toggle('d-none', state.viewMode !== 'list');
    galleryContainer.classList.toggle('d-none', state.viewMode !== 'gallery');
    viewToggle.querySelectorAll('button[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    });
  };

  const loadSections = async () => {
    try {
      state.loading = true;
      const data = await fetchSections({ include: true });
      state.sections = Array.isArray(data?.items) ? data.items : [];
      if (state.activeProjectId && !findFolder(state.activeProjectId)) {
        state.activeProjectId = null;
      }
      if (
        state.activeSectionId &&
        !state.sections.some((section) => idsMatch(section.id, state.activeSectionId))
      ) {
        state.activeSectionId = null;
      }
      const sectionIds = new Set(state.sections.map((section) => section.id));
      state.expandedProjects = new Set(
        [...state.expandedProjects].filter((id) => sectionIds.has(id))
      );
      const folderIds = new Set();
      state.sections.forEach((section) => {
        (section.projects || []).forEach((project) => folderIds.add(project.id));
      });
      state.expandedFolders = new Set(
        [...state.expandedFolders].filter((id) => folderIds.has(id))
      );
      if (state.openOptionsFolderId && !folderIds.has(state.openOptionsFolderId)) {
        state.openOptionsFolderId = null;
      }
      const canvasIds = new Set();
      state.sections.forEach((section) => {
        (section.projects || []).forEach((project) => {
          (project.canvases || []).forEach((canvas) => canvasIds.add(canvas.id));
        });
      });
      if (state.openCanvasMenuId && !canvasIds.has(state.openCanvasMenuId)) {
        state.openCanvasMenuId = null;
        state.openCanvasMenuContext = null;
      }
      ensureFilterTargets();
      updateFolderOptions();
      computeLatestCanvases();
      render();
    } catch (err) {
      console.warn('Dashboard load failed', err);
      window.showAppToast?.({
        title: 'Unable to load projects',
        message: err?.message || String(err),
        variant: 'danger'
      });
    } finally {
      state.loading = false;
    }
  };

  const ensureProject = async () => {
    let section = state.sections[0];
    if (!section) {
      section = await createSection({
        name: DEFAULT_SECTION_NAME,
        description: ''
      });
      section.projects = [];
      state.sections.push(section);
    }

    let project = section.projects?.[0];
    if (!project) {
      project = await createProject(section.id, {
        title: DEFAULT_PROJECT_NAME,
        summary: ''
      });
      project.canvases = [];
      section.projects = section.projects || [];
      section.projects.push(project);
    }

    return { section, project };
  };

  const handleCreateCanvas = async (projectId) => {
    try {
      exitFavoritesView();
      let project = findFolder(projectId);
      if (!project) {
        const ensured = await ensureProject();
        project = ensured.project;
      }
      const payload = await createCanvas(project.id, {
        title: 'Untitled canvas',
        state: createEmptyWorkspaceSnapshot()
      });
      project.canvases = [payload, ...(project.canvases || [])];
      const owner = findFolderOwner(project.id);
      if (owner) {
        state.filters.section = owner.section.id;
        state.activeSectionId = owner.section.id;
        if (folderSelect) {
          folderSelect.value = owner.section.id;
        }
        state.expandedProjects.add(owner.section.id);
      }
      state.filters.folder = project.id;
      state.expandedFolders.add(project.id);
      state.activeProjectId = project.id;
      computeLatestCanvases();
      render();
      navigateToCanvas(payload.id);
    } catch (err) {
      console.warn('Failed to create canvas', err);
      window.showAppToast?.({
        title: 'Unable to create canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const createEmptyWorkspaceSnapshot = () => ({
    sections: {
      counter: 1,
      order: ['section_all'],
      items: [
        {
          id: 'section_all',
          name: 'Group 1',
          collapsed: false,
          locked: true,
          parentId: null,
          children: [],
          visible: true
        }
      ]
    },
    panels: {
      counter: 0,
      zIndexCursor: 0,
      items: []
    },
    figures: {},
    uiPrefs: {
      colorCursor: 0
    }
  });

  const generateDuplicateTitle = (project, baseTitle) => {
    const trimmedBase = (baseTitle || 'Untitled canvas').trim() || 'Untitled canvas';
    const existingTitles = new Set(
      (project?.canvases || []).map((item) => (item.title || '').trim().toLowerCase())
    );
    const suffix = ' Copy';
    let candidate = `${trimmedBase}${suffix}`;
    let counter = 2;
    while (existingTitles.has(candidate.trim().toLowerCase())) {
      candidate = `${trimmedBase}${suffix} ${counter}`;
      counter += 1;
      if (counter > 99) break;
    }
    return candidate;
  };

  const findFolder = (folderId) => {
    for (const section of state.sections) {
      const projects = section.projects || [];
      const match = projects.find((project) => idsMatch(project.id, folderId));
      if (match) return match;
    }
    return null;
  };

  const findFolderOwner = (folderId) => {
    if (!folderId && folderId !== 0) return null;
    for (const section of state.sections) {
      const project =
        section.projects?.find((candidate) => idsMatch(candidate.id, folderId)) || null;
      if (project) {
        return { section, project };
      }
    }
    return null;
  };

  const findRootFolderForSection = (sectionId) => {
    if (!sectionId) return null;
    for (const section of state.sections || []) {
      if (!idsMatch(section.id, sectionId)) continue;
      const project =
        section.projects?.find(
          (candidate) => candidate?.summary === ROOT_FOLDER_SUMMARY
        ) || null;
      return project || null;
    }
    return null;
  };

  const ensureRootFolder = async (sectionId) => {
    if (!sectionId) return null;
    const existing = findRootFolderForSection(sectionId);
    if (existing) return existing;
    try {
      const created = await createProject(sectionId, {
        title: ROOT_FOLDER_LABEL,
        summary: ROOT_FOLDER_SUMMARY,
        position: -100
      });
      await loadSections();
      return created;
    } catch (err) {
      console.warn('Failed to create default folder', err);
      window.showAppToast?.({
        title: 'Unable to prepare folder',
        message: 'Try creating a folder manually first.',
        variant: 'danger'
      });
      return null;
    }
  };

  const findCanvasOwner = (canvasId) => {
    if (!canvasId && canvasId !== 0) return null;
    for (const section of state.sections) {
      for (const project of section.projects || []) {
        const canvas =
          (project.canvases || []).find((candidate) => idsMatch(candidate.id, canvasId)) || null;
        if (canvas) {
          return { section, project, canvas };
        }
      }
    }
    return null;
  };

  const resolveSectionName = (section) => {
    if (typeof section?.name === 'string' && section.name.trim()) {
      return section.name.trim();
    }
    return DEFAULT_SECTION_NAME;
  };

  const resolveFolderName = (project) => {
    if (typeof project?.title === 'string' && project.title.trim()) {
      return project.title.trim();
    }
    return 'Untitled folder';
  };

  const listFolderTargets = () => {
    const folders = [];
    (state.sections || []).forEach((section) => {
      const sectionName = resolveSectionName(section);
      (section.projects || []).forEach((project) => {
        folders.push({
          sectionId: section.id,
          sectionName,
          projectId: project.id,
          projectTitle: resolveFolderName(project),
          label: `${sectionName} / ${resolveFolderName(project)}`
        });
      });
    });
    return folders;
  };

  const promptFolderTargetSelection = ({ entityTitle, currentProjectId, sectionId = null }) => {
    let folders = listFolderTargets();
    if (sectionId) {
      folders = folders.filter((entry) => idsMatch(entry.sectionId, sectionId));
    }
    if (!folders.length) {
      window.showAppToast?.({
        title: 'No folders available',
        message: 'Create a folder before moving canvases.',
        variant: 'warning'
      });
      return null;
    }
    const hasAlternative = folders.some((entry) =>
      currentProjectId ? !idsMatch(entry.projectId, currentProjectId) : true
    );
    if (!hasAlternative) {
      window.showAppToast?.({
        title: 'Another folder required',
        message: 'Create a different folder before moving this canvas.',
        variant: 'info'
      });
      return null;
    }
    const lines = folders.map((entry, index) => {
      const isCurrent = idsMatch(entry.projectId, currentProjectId);
      return `${index + 1}. ${entry.label}${isCurrent ? ' (current)' : ''}`;
    });
    const defaultValue =
      folders.find((entry) => idsMatch(entry.projectId, currentProjectId))?.label || '';
    const choice = window.prompt(
      `Move "${entityTitle}" to which folder?\n${lines.join('\n')}`,
      defaultValue
    );
    if (!choice) return null;
    const trimmed = choice.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const target =
      folders.find((entry) => idsMatch(entry.projectId, trimmed)) ||
      folders.find((entry, index) => `${index + 1}` === normalized) ||
      folders.find((entry) => entry.label.toLowerCase() === normalized) ||
      folders.find((entry) => entry.projectTitle.toLowerCase() === normalized);
    if (!target) {
      window.showAppToast?.({
        title: 'Folder not found',
        message: 'Enter the folder number, ID, or full label.',
        variant: 'warning'
      });
      return null;
    }
    if (idsMatch(target.projectId, currentProjectId)) {
      return null;
    }
    return target;
  };

  const handleCreateProject = async (initialName = null) => {
    exitFavoritesView();
    let name =
      typeof initialName === 'string'
        ? initialName
        : window.prompt('Project name', DEFAULT_SECTION_NAME);
    if (!name) return;
    name = name.trim();
    if (!name) return;
    try {
      const section = await createSection({ name, description: '' });
      section.projects = [];
      state.sections.push(section);
      state.activeSectionId = section.id;
      state.expandedProjects.add(section.id);
      state.activeProjectId = null;
      state.filters.section = section.id;
      state.filters.folder = null;
      if (folderSelect) {
        folderSelect.value = section.id;
      }
      updateFolderOptions();
      render();
      window.showAppToast?.({
        title: 'Project created',
        message: name,
        variant: 'success'
      });
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to create project',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const navigateToCanvas = (canvasId) => {
    if (!canvasId) return;
    if (workspaceTabEnabled) {
      const url = new URL(window.location.href);
      url.searchParams.set('canvas', canvasId);
      url.hash = '#pane-plotC';
      window.location.href = url.toString();
      return;
    }
    const target = new URL(workspaceRoute, window.location.origin);
    target.searchParams.set('canvas', canvasId);
    if (state.devMode) {
      target.searchParams.set('dev', 'true');
    }
    window.location.assign(target.toString());
  };

  const handleCreateFolder = async (sectionId) => {
    exitFavoritesView();
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    const title = window.prompt('Folder name', DEFAULT_PROJECT_NAME);
    if (!title) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const project = await createProject(section.id, { title: trimmed, summary: '' });
      project.canvases = [];
      section.projects = section.projects || [];
      section.projects.push(project);
      state.activeProjectId = project.id;
      state.activeSectionId = section.id;
      state.filters.section = section.id;
      state.filters.folder = project.id;
      state.expandedProjects.add(section.id);
      state.expandedFolders.add(project.id);
      if (folderSelect) {
        folderSelect.value = section.id;
      }
      updateFolderOptions();
      computeLatestCanvases();
      render();
      window.showAppToast?.({
        title: 'Folder created',
        message: trimmed,
        variant: 'success'
      });
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to create folder',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const resolveSectionIdForNewFolder = () => {
    const candidates = [];
    if (state.activeSectionId) candidates.push(state.activeSectionId);
    if (state.filters.section && state.filters.section !== 'all') {
      candidates.push(state.filters.section);
    }
    if (state.sections.length === 1) {
      candidates.push(state.sections[0].id);
    }
    for (const candidate of candidates) {
      if (!candidate) continue;
      const section = state.sections.find((item) => idsMatch(item.id, candidate));
      if (section) return section.id;
    }
    return null;
  };

  newSectionBtn?.addEventListener('click', () => {
    const sectionId = resolveSectionIdForNewFolder();
    if (!sectionId) {
      window.showAppToast?.({
        title: 'Project required',
        message: 'Select a project in the sidebar before creating a folder.',
        variant: 'warning'
      });
      return;
    }
    void handleCreateFolder(sectionId);
  });

  newCanvasBtn?.addEventListener('click', () => {
    void handleCreateCanvas();
  });

  const selectProject = (sectionId) => {
    if (!sectionId) return;
    exitFavoritesView();
    exitLatestView();
    const section =
      state.sections.find((item) => idsMatch(item.id, sectionId)) || null;
    if (!section) return;
    state.filters.section = section.id;
    state.filters.folder = null;
    state.activeSectionId = section.id;
    state.activeProjectId = null;
    if (folderSelect) {
      folderSelect.value = section.id;
    }
    state.expandedProjects.add(section.id);
    renderSidebar();
    render();
    updateMainTitle();
    renderSidebarNav();
    applyLatestBandVisibility();
  };

  const selectFolder = (folderId) => {
    if (!folderId) return;
    exitFavoritesView();
    exitLatestView();
    const owner = findFolderOwner(folderId);
    if (!owner) return;
    state.filters.section = owner.section.id;
    state.filters.folder = owner.project.id;
    state.activeSectionId = owner.section.id;
    state.activeProjectId = owner.project.id;
    if (folderSelect) {
      folderSelect.value = owner.section.id;
    }
    state.expandedProjects.add(owner.section.id);
    state.expandedFolders.add(owner.project.id);
    renderSidebar();
    render();
    updateMainTitle();
    renderSidebarNav();
    applyLatestBandVisibility();
  };

  const moveFolderToSection = async (folderId, targetSectionId) => {
    if (!folderId || !targetSectionId) return false;
    const owner = findFolderOwner(folderId);
    if (!owner) {
      window.showAppToast?.({
        title: 'Folder not found',
        message: 'Refresh the dashboard and try again.',
        variant: 'warning'
      });
      return false;
    }
    if (idsMatch(owner.section.id, targetSectionId)) {
      return false;
    }
    exitFavoritesView();
    exitLatestView();
    try {
        await updateProject(folderId, { section_id: targetSectionId });
        state.filters.section = targetSectionId;
        state.filters.folder = folderId;
        state.activeSectionId = targetSectionId;
        state.activeProjectId = folderId;
        state.expandedProjects.add(targetSectionId);
        state.expandedFolders.add(folderId);
        await loadSections();
        const targetSection =
          state.sections.find((section) => idsMatch(section.id, targetSectionId)) || null;
        window.showAppToast?.({
          title: 'Folder moved',
          message: targetSection
            ? `Moved to ${targetSection.name || 'project'}.`
            : 'Folder moved successfully.',
          variant: 'success'
        });
        return true;
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to move folder',
        message: err?.message || String(err),
        variant: 'danger'
      });
      return false;
    }
  };

  const createCanvasForSection = async (sectionId) => {
    if (!sectionId) return;
    exitFavoritesView();
    exitLatestView();
    const targetFolder = await ensureRootFolder(sectionId);
    if (!targetFolder?.id) return;
    void handleCreateCanvas(targetFolder.id);
  };

  const handleSectionShare = (sectionId) => {
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    window.showAppToast?.({
      title: 'Sharing coming soon',
      message: `Project "${section.name || 'Untitled'}" sharing will be available soon.`,
      variant: 'info'
    });
  };

  const handleSectionDetails = (sectionId) => {
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    const folderCount = section.projects?.length || 0;
    window.showAppToast?.({
      title: section.name || 'Project details',
      message: `${folderCount} folder${folderCount === 1 ? '' : 's'} in this project.`,
      variant: 'primary'
    });
  };

  const moveCanvasToFolder = async (canvasId, targetFolderId, options = {}) => {
    if (!canvasId || !targetFolderId) return false;
    const owner = findCanvasOwner(canvasId);
    if (!owner || !owner.canvas) {
      window.showAppToast?.({
        title: 'Canvas not found',
        message: 'Refresh the dashboard and try again.',
        variant: 'warning'
      });
      return false;
    }
    if (!options.newSectionId && idsMatch(owner.project.id, targetFolderId)) {
      return false;
    }
    exitFavoritesView();
    exitLatestView();
    const viewContext = getActiveViewContext();
    try {
      await updateCanvas(canvasId, { project_id: targetFolderId });
      const nextSectionId = options.newSectionId || owner.section.id;
      state.filters.section = nextSectionId;
      state.filters.folder = targetFolderId;
      state.activeSectionId = nextSectionId;
      state.activeProjectId = targetFolderId;
      state.expandedProjects.add(nextSectionId);
      state.expandedFolders.add(targetFolderId);
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
      const targetFolder =
        findFolder(targetFolderId) || { title: 'Project updated' };
      window.showAppToast?.({
        title: 'Canvas moved',
        message: `Moved to ${targetFolder.title || 'folder'}.`,
        variant: 'success'
      });
      return true;
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to move canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
      return false;
    }
  };

  const toggleProject = (sectionId) => {
    if (!sectionId) return;
    if (state.expandedProjects.has(sectionId)) {
      state.expandedProjects.delete(sectionId);
    } else {
      state.expandedProjects.add(sectionId);
      state.activeSectionId = sectionId;
    }
    renderSidebar();
    updateMainTitle();
  };

  const toggleFolder = (folderId) => {
    if (!folderId) return;
    if (state.expandedFolders.has(folderId)) {
      state.expandedFolders.delete(folderId);
    } else {
      state.expandedFolders.add(folderId);
    }
    renderSidebar();
  };

  sidebarTree?.addEventListener('click', (event) => {
    const trigger = resolveClosest(event, 'button[data-action]');
    if (!trigger) return;
    const { action } = trigger.dataset;
    if (action === 'select-project' && trigger.dataset.section) {
      selectProject(trigger.dataset.section);
      return;
    }
    if (action === 'select-folder' && trigger.dataset.folder) {
      selectFolder(trigger.dataset.folder);
      return;
    }
    if (action === 'toggle-project' && trigger.dataset.section) {
      toggleProject(trigger.dataset.section);
      return;
    }
    if (action === 'toggle-folder' && trigger.dataset.folder) {
      toggleFolder(trigger.dataset.folder);
      return;
    }
    if (action === 'folder-create' && trigger.dataset.section) {
      event.stopPropagation();
      void handleCreateFolder(trigger.dataset.section);
      return;
    }
    if (action === 'folder-create-canvas' && trigger.dataset.project) {
      event.stopPropagation();
      void handleCreateCanvas(trigger.dataset.project);
      return;
    }
    if (action === 'section-rename' && trigger.dataset.section) {
      event.stopPropagation();
      closeSectionMenu();
      beginProjectRename(trigger.dataset.section);
      return;
    }
    if (action === 'section-add-folder' && trigger.dataset.section) {
      event.stopPropagation();
      const targetSectionId = trigger.dataset.section;
      const target = state.sections.find((item) => idsMatch(item.id, targetSectionId));
      if (!target) return;
      state.activeSectionId = targetSectionId;
      state.expandedProjects.add(targetSectionId);
      state.activeProjectId = null;
      renderSidebar();
      render();
      void handleCreateFolder(targetSectionId);
      return;
    }
    if (action === 'section-create-canvas' && trigger.dataset.section) {
      event.stopPropagation();
      createCanvasForSection(trigger.dataset.section);
      return;
    }
    if (action === 'section-options' && trigger.dataset.section) {
      event.stopPropagation();
      toggleSectionMenu(trigger.dataset.section);
      return;
    }
    if (action === 'section-share' && trigger.dataset.section) {
      event.stopPropagation();
      closeSectionMenu();
      handleSectionShare(trigger.dataset.section);
      return;
    }
    if (action === 'section-details' && trigger.dataset.section) {
      event.stopPropagation();
      closeSectionMenu();
      handleSectionDetails(trigger.dataset.section);
      return;
    }
    if (action === 'section-pin' && trigger.dataset.section) {
      event.stopPropagation();
      const sectionId = trigger.dataset.section;
      const section = state.sections.find((item) => idsMatch(item.id, sectionId)) || null;
      const nextState =
        section && typeof section.is_pinned === 'boolean'
          ? !section.is_pinned
          : trigger.getAttribute('aria-pressed') !== 'true';
      void handleToggleProjectPin(sectionId, nextState);
      return;
    }
    if (action === 'section-delete' && trigger.dataset.section) {
      event.stopPropagation();
      closeSectionMenu();
      void handleDeleteProject(trigger.dataset.section);
      return;
    }
    if (action === 'folder-rename' && trigger.dataset.folder) {
      event.stopPropagation();
      beginFolderRename(trigger.dataset.folder);
      return;
    }
    if (action === 'folder-options' && trigger.dataset.folder) {
      event.stopPropagation();
      toggleFolderMenu(trigger.dataset.folder);
      return;
    }
    if (action === 'folder-menu-move' && trigger.dataset.folder) {
      event.stopPropagation();
      state.openOptionsFolderId = null;
      renderSidebar();
      void handleMoveFolder(trigger.dataset.folder);
      return;
    }
    if (action === 'folder-menu-delete' && trigger.dataset.folder) {
      event.stopPropagation();
      state.openOptionsFolderId = null;
      renderSidebar();
      void handleDeleteFolder(trigger.dataset.folder);
      return;
    }
    if (action === 'folder-menu-details' && trigger.dataset.folder) {
      event.stopPropagation();
      closeFolderMenu();
      window.showAppToast?.({
        title: 'Folder details',
        message: 'Details view will arrive soon.',
        variant: 'info'
      });
      return;
    }
    if (action === 'folder-menu-share' && trigger.dataset.folder) {
      event.stopPropagation();
      closeFolderMenu();
      window.showAppToast?.({
        title: 'Share folder',
        message: 'Sharing workflow is not enabled yet.',
        variant: 'info'
      });
      return;
    }
    if (handleCanvasAction(action, trigger, event)) {
      return;
    }
    if (action === 'sidebar-open-canvas' && trigger.dataset.canvas) {
      if (trigger.dataset.folder) {
        selectFolder(trigger.dataset.folder);
      }
      navigateToCanvas(trigger.dataset.canvas);
    }
  });

  const handleInlineKeydown = (event) => {
    const input = event.target;
    if (!isInlineInput(input)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      finalizeInlineEdit(input);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const original = input.dataset.initialValue ?? '';
      input.value = original;
      finalizeInlineEdit(input, { cancel: true });
    }
  };

  const handleInlineBlur = (event) => {
    const input = event.target;
    if (!isInlineInput(input)) return;
    finalizeInlineEdit(input);
  };

  sidebarTree?.addEventListener('keydown', handleInlineKeydown);
  sidebarTree?.addEventListener('focusout', handleInlineBlur, true);
  sidebarTree?.addEventListener('dragstart', handleFolderDragStart);
  sidebarTree?.addEventListener('dragend', handleFolderDragEnd);
  sidebarTree?.addEventListener('dragover', handleProjectDragOver);
  sidebarTree?.addEventListener('dragleave', handleProjectDragLeave);
  sidebarTree?.addEventListener('drop', handleProjectDrop);
  sidebarTree?.addEventListener('dragstart', handleCanvasDragStart);
  sidebarTree?.addEventListener('dragend', handleCanvasDragEnd);
  sidebarTree?.addEventListener('dragover', handleFolderTargetDragOver);
  sidebarTree?.addEventListener('dragleave', handleFolderTargetDragLeave);
  sidebarTree?.addEventListener('drop', handleFolderTargetDrop);
  root.addEventListener('keydown', handleInlineKeydown, true);
  root.addEventListener('focusout', handleInlineBlur, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (
      state.openOptionsFolderId &&
      !(
        target &&
        (target.closest?.('[data-folder-menu]') || target.closest?.('[data-action="folder-options"]'))
      )
    ) {
      closeFolderMenu();
    }
    if (
      state.openCanvasMenuId &&
      !(
        target &&
        (target.closest?.('[data-canvas-menu]') || target.closest?.('[data-action="canvas-options"]'))
      )
    ) {
      closeCanvasMenu();
    }
    if (
      state.openSectionMenuId &&
      !(
        target &&
        (target.closest?.('[data-section-menu]') || target.closest?.('[data-action="section-options"]'))
      )
    ) {
      closeSectionMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.openOptionsFolderId) {
        closeFolderMenu();
      }
      if (state.openCanvasMenuId) {
        closeCanvasMenu();
      }
      if (state.openSectionMenuId) {
        closeSectionMenu();
      }
    }
  });

  const handleMainActionClick = (event) => {
    const trigger = resolveClosest(event, '[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'list-sort' && trigger.dataset.sort) {
      event.preventDefault();
      updateListSort(trigger.dataset.sort);
      render();
      return;
    }
    if (handleCanvasAction(action, trigger, event)) {
      return;
    }
    if (action === 'list-pin') {
      event.preventDefault();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'Pinning will be available soon.',
        variant: 'info'
      });
      return;
    }
    if (action === 'list-more') {
      event.preventDefault();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'More options will arrive soon.',
        variant: 'info'
      });
      return;
    }
    if (action === 'open-canvas' && trigger.dataset.canvas) {
      event.preventDefault();
      navigateToCanvas(trigger.dataset.canvas);
    }
  };

  listContainer?.addEventListener('click', handleMainActionClick);
  galleryContainer?.addEventListener('click', handleMainActionClick);

  sidebarNav?.addEventListener('click', (event) => {
    const button = resolveClosest(event, '[data-view]');
    if (!button) return;
    const nextView = button.dataset.view || 'home';
    state.sidebarView = nextView;
    state.activeProjectId = null;
    if (nextView === 'favorites') {
      state.filters.favoritesOnly = true;
      state.filters.section = 'all';
      state.filters.folder = null;
      state.filters.sort = 'modified';
      state.activeSectionId = null;
      state.activeProjectId = null;
      if (folderSelect) {
        folderSelect.value = 'all';
      }
      renderSidebarNav();
      renderSidebar();
      render();
      updateMainTitle();
      applyLatestBandVisibility();
      return;
    }
    state.filters.favoritesOnly = false;
    if (nextView === 'home') {
      resetToAllProjects();
      state.filters.sort = 'modified';
      renderSidebarNav();
      renderSidebar();
      render();
      updateMainTitle();
      applyLatestBandVisibility();
      return;
    }
    if (state.sidebarView === 'latest') {
      state.filters.sort = 'modified';
      renderSidebarNav();
      renderSidebar();
      render();
      updateMainTitle();
      applyLatestBandVisibility();
      return;
    }
    state.filters.sort = 'modified';
    renderSidebarNav();
    renderSidebar();
    render();
    updateMainTitle();
    applyLatestBandVisibility();
  });

  sidebarNewProjectBtn?.addEventListener('click', () => {
    const sectionName = window.prompt('Project name', DEFAULT_SECTION_NAME);
    if (!sectionName || !sectionName.trim()) return;
    void handleCreateProject(sectionName.trim());
  });

  const handleRenameProject = async (sectionId, nextName) => {
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    const trimmed = nextName?.trim();
    if (!trimmed) {
      window.showAppToast?.({
        title: 'Project name required',
        message: 'Enter a project name before saving.',
        variant: 'warning'
      });
      return;
    }
    if (trimmed === section.name) return;
    try {
      await updateSection(sectionId, { name: trimmed });
      window.showAppToast?.({
        title: 'Project renamed',
        message: trimmed,
        variant: 'success'
      });
      await loadSections();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to rename project',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleDeleteProject = async (sectionId) => {
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    const confirmed = window.confirm(
      `Delete project "${section.name}"? Folders and canvases inside will also be removed.`
    );
    if (!confirmed) return;
    try {
      await deleteSection(sectionId);
      window.showAppToast?.({
        title: 'Project deleted',
        message: section.name,
        variant: 'info'
      });
      await loadSections();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to delete project',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleToggleProjectPin = async (sectionId, nextPinned) => {
    if (!sectionId) return;
    const section = state.sections.find((item) => idsMatch(item.id, sectionId)) || null;
    const name = section?.name || 'Untitled project';
    const viewContext = getActiveViewContext();
    try {
      await updateSection(sectionId, { is_pinned: nextPinned });
      window.showAppToast?.({
        title: nextPinned ? 'Project pinned' : 'Pin removed',
        message: name,
        variant: 'success'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to update pin',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const updateListSort = (field) => {
    if (!field) return;
    const current = state.listSort || { field: 'title', direction: 'asc' };
    const nextDirection =
      current.field === field ? (current.direction === 'asc' ? 'desc' : 'asc') : 'asc';
    state.listSort = { field, direction: nextDirection };
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          LIST_SORT_STORAGE_KEY,
          JSON.stringify(state.listSort)
        );
      } catch {
        /* ignore */
      }
    }
  };

  const handleRenameFolder = async (projectId, nextTitle) => {
    const project = findFolder(projectId);
    if (!project) return;
    const trimmed = nextTitle?.trim();
    if (!trimmed) {
      window.showAppToast?.({
        title: 'Folder name required',
        message: 'Enter a folder name before saving.',
        variant: 'warning'
      });
      return;
    }
    if (trimmed === project.title) return;
    try {
      await updateProject(projectId, { title: trimmed });
      window.showAppToast?.({
        title: 'Folder renamed',
        message: trimmed,
        variant: 'success'
      });
      await loadSections();
      selectFolder(projectId);
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to rename folder',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleDeleteFolder = async (projectId) => {
    const project = findFolder(projectId);
    if (!project) return;
    const confirmed = window.confirm(
      `Delete folder "${project.title || 'Untitled folder'}"? All canvases inside will also be removed.`
    );
    if (!confirmed) return;
    try {
      await deleteProject(projectId);
      window.showAppToast?.({
        title: 'Folder deleted',
        message: project.title || 'Untitled folder',
        variant: 'info'
      });
      await loadSections();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to delete folder',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleMoveFolder = async (projectId) => {
    const project = findFolder(projectId);
    if (!project) return;
    if (!state.sections.length) {
      window.showAppToast?.({
        title: 'No projects available',
        message: 'Create a project before moving a folder.',
        variant: 'warning'
      });
      return;
    }
    const options = state.sections
      .map((section, index) => `${index + 1}. ${section.name}`)
      .join('\n');
    const choice = window.prompt(
      `Move "${project.title || 'Untitled folder'}" to which project?\n${options}`,
      state.sections.find((section) => idsMatch(section.id, project.section_id || project.sectionId))?.name || ''
    );
    if (!choice) return;
    const normalized = choice.trim().toLowerCase();
    const target =
      state.sections.find(
        (section, index) =>
          idsMatch(section.id, choice.trim()) ||
          section.name.toLowerCase() === normalized ||
          `${index + 1}` === normalized
      ) || null;
    if (!target) {
      window.showAppToast?.({
        title: 'Project not found',
        message: 'Enter the project number or exact name.',
        variant: 'warning'
      });
      return;
    }
    if (idsMatch(target.id, project.section_id || project.sectionId)) {
      return;
    }
    try {
      await updateProject(projectId, { section_id: target.id });
      window.showAppToast?.({
        title: 'Folder moved',
        message: `Moved to ${target.name}`,
        variant: 'success'
      });
      await loadSections();
      selectFolder(projectId);
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to move project',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleRenameCanvas = async (canvasId, nextTitle) => {
    const owner = findCanvasOwner(canvasId);
    if (!owner) return;
    const currentTitle = owner.canvas?.title || 'Untitled canvas';
    const trimmed = nextTitle?.trim();
    if (!trimmed) {
      window.showAppToast?.({
        title: 'Canvas name required',
        message: 'Enter a canvas name before saving.',
        variant: 'warning'
      });
      return;
    }
    if (trimmed === currentTitle) return;
    const viewContext = getActiveViewContext();
    try {
      await updateCanvas(canvasId, { title: trimmed });
      window.showAppToast?.({
        title: 'Canvas renamed',
        message: trimmed,
        variant: 'success'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to rename canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleDuplicateCanvas = async (canvasId) => {
    const owner = findCanvasOwner(canvasId);
    if (!owner || !owner.project) {
      window.showAppToast?.({
        title: 'Canvas not found',
        message: 'Refresh the dashboard and try again.',
        variant: 'warning'
      });
      return;
    }
    const baseTitle = owner.canvas?.title || 'Untitled canvas';
    const duplicateTitle = generateDuplicateTitle(owner.project, baseTitle);
    const viewContext = getActiveViewContext();
    try {
      clearInlineEditing();
      const payload = await fetchCanvasState(canvasId);
      const snapshot = payload?.state || createEmptyWorkspaceSnapshot();
      const newCanvas = await createCanvas(owner.project.id, {
        title: duplicateTitle,
        state: snapshot,
        version_label: payload?.version_label || ''
      });
      window.showAppToast?.({
        title: 'Canvas duplicated',
        message: `${baseTitle} → ${newCanvas?.title || duplicateTitle}`,
        variant: 'success'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to duplicate canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleMoveCanvas = async (canvasId) => {
    const owner = findCanvasOwner(canvasId);
    if (!owner || !owner.canvas || !owner.project) {
      window.showAppToast?.({
        title: 'Canvas not found',
        message: 'Refresh the dashboard and try again.',
        variant: 'warning'
      });
      return;
    }
    const canvasTitle = owner.canvas.title || 'Untitled canvas';
    const selection = promptFolderTargetSelection({
      entityTitle: canvasTitle,
      currentProjectId: owner.project.id
    });
    if (!selection) return;
    const viewContext = getActiveViewContext();
    try {
      await updateCanvas(canvasId, { project_id: selection.projectId });
      window.showAppToast?.({
        title: 'Canvas moved',
        message: `Moved to ${selection.label}`,
        variant: 'success'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to move canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleToggleCanvasFavorite = async (canvasId) => {
    const owner = findCanvasOwner(canvasId);
    if (!owner || !owner.canvas) {
      window.showAppToast?.({
        title: 'Canvas not found',
        message: 'Refresh the dashboard and try again.',
        variant: 'warning'
      });
      return;
    }
    const nextState = !owner.canvas.is_favorite;
    const viewContext = getActiveViewContext();
    try {
      await updateCanvas(canvasId, { is_favorite: nextState });
      window.showAppToast?.({
        title: nextState ? 'Added to favorites' : 'Removed from favorites',
        message: owner.canvas.title || 'Untitled canvas',
        variant: 'success'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to update favorite',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  const handleDeleteCanvas = async (canvasId) => {
    const owner = findCanvasOwner(canvasId);
    const title = owner?.canvas?.title || 'Untitled canvas';
    const confirmed = window.confirm(
      `Delete canvas "${title}"? This cannot be undone and removes all autosaves.`
    );
    if (!confirmed) return;
    const viewContext = getActiveViewContext();
    try {
      await deleteCanvas(canvasId);
      window.showAppToast?.({
        title: 'Canvas deleted',
        message: title,
        variant: 'info'
      });
      await loadSections();
      applyViewContext(viewContext);
      render();
      updateMainTitle();
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to delete canvas',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  if (latestHeader) {
    const handleLatestHeaderToggle = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-action="view-latest"]')) {
        return;
      }
      event.preventDefault();
      toggleLatestCollapsed();
    };
    latestHeader.addEventListener('click', handleLatestHeaderToggle);
    latestHeader.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleLatestCollapsed();
      }
    });
  }

  searchInput?.addEventListener('input', (event) => {
    state.filters.search = event.target.value || '';
    render();
  });

  folderSelect?.addEventListener('change', (event) => {
    const nextValue = event.target.value || 'all';
    state.filters.favoritesOnly = false;
    state.sidebarView = 'home';
    renderSidebarNav();
    state.filters.section = nextValue;
    state.filters.folder = null;
    if (nextValue === 'all') {
      state.activeSectionId = null;
    } else {
      state.activeSectionId = nextValue;
      state.expandedProjects.add(nextValue);
    }
    state.activeProjectId = null;
    renderSidebar();
    render();
    updateMainTitle();
  });

  sortSelect?.addEventListener('change', (event) => {
    state.filters.sort = event.target.value || 'recent';
    render();
    renderLatest();
  });

  viewToggle?.addEventListener('click', (event) => {
    const button = resolveClosest(event, 'button[data-view]');
    if (!button) return;
    state.viewMode = button.dataset.view || 'list';
    updateView();
  });

  void loadSections();
  return {
    reload: loadSections
  };
}

function sortCanvases(canvases, mode) {
  const copy = [...canvases];
  if (mode === 'alpha') {
    copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else {
    copy.sort((a, b) => {
      const field =
        mode === 'created' ? 'created' : mode === 'modified' ? 'updated' : 'updated';
      const aTime = new Date(a[field] || a.updated || 0).getTime();
      const bTime = new Date(b[field] || b.updated || 0).getTime();
      return bTime - aTime;
    });
  }
  return copy;
}

function sortProjects(projects, mode) {
  const copy = [...projects];
  if (mode === 'alpha') {
    copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (mode === 'created') {
    copy.sort((a, b) => {
      const aTime = new Date(a.created || a.canvases?.[0]?.created || 0).getTime();
      const bTime = new Date(b.created || b.canvases?.[0]?.created || 0).getTime();
      return bTime - aTime;
    });
  } else {
    copy.sort((a, b) => {
      const aTime = new Date(a.updated || a.canvases?.[0]?.updated || 0).getTime();
      const bTime = new Date(b.updated || b.canvases?.[0]?.updated || 0).getTime();
      return bTime - aTime;
    });
  }
  return copy;
}
