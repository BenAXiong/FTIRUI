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
  const sidebarNav = document.querySelector('[data-sidebar-nav]');
  const sidebarNewProjectBtn = document.getElementById('dashboard_sidebar_new_project');
  const titleLabel = root.querySelector('[data-dashboard-title]');
  const latestContainer = root.querySelector('[data-dashboard-latest]');
  const searchInput = document.getElementById('dashboard_filter_search');
  const folderSelect = document.getElementById('dashboard_filter_folder');
  const sortSelect = document.getElementById('dashboard_filter_sort');
  const viewToggle = document.querySelector('[data-dashboard-view-toggle]');
  const devBadge = document.querySelector('[data-dashboard-dev-indicator]');

  const workspaceTabEnabled =
    document.body?.dataset?.workspaceTabEnabled === 'true';
  const workspaceRoute =
    document.body?.dataset?.workspaceRoute || '/workspace/';

  const state = {
    sections: [],
    loading: false,
    sidebarView: 'home',
    expandedProjects: new Set(),
    expandedFolders: new Set(),
    activeSectionId: null,
    activeProjectId: null,
    latestCanvases: [],
    editingSectionId: null,
    editingFolderId: null,
    editingCanvasId: null,
    editingCanvasContext: null,
    openCanvasMenuId: null,
    openOptionsFolderId: null,
    filters: {
      search: '',
      section: 'all',
      folder: null,
      sort: 'recent'
    },
    viewMode: 'list',
    devMode: new URLSearchParams(window.location.search).get('dev') === 'true'
  };

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

  const updateMainTitle = () => {
    if (!titleLabel) return;
    const activeFolder = state.activeProjectId ? findFolder(state.activeProjectId) : null;
    if (activeFolder) {
      titleLabel.textContent = activeFolder.title || 'Untitled folder';
    } else if (state.filters.section && state.filters.section !== 'all') {
      const section =
        state.sections.find((item) => idsMatch(item.id, state.filters.section)) || null;
      titleLabel.textContent = section?.name || 'All Projects';
    } else {
      titleLabel.textContent = 'All Projects';
    }
    if (devBadge) {
      devBadge.classList.toggle('d-none', !state.devMode);
    }
  };

  const getFilteredSections = () => {
    let sections = Array.isArray(state.sections) ? state.sections : [];
    const { search, section: sectionFilter, folder: folderFilter, sort } = state.filters;
    const query = search.trim().toLowerCase();
    if (sectionFilter && sectionFilter !== 'all') {
      sections = sections.filter((section) => idsMatch(section.id, sectionFilter));
    }
    if (folderFilter) {
      sections = sections.filter((section) =>
        (section.projects || []).some((project) => idsMatch(project.id, folderFilter))
      );
    }
    const filtered = sections
      .map((section) => {
        const projects = (section.projects || [])
          .map((project) => {
            if (folderFilter && !idsMatch(project.id, folderFilter)) {
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
      btn.classList.toggle('is-active', btn.dataset.view === state.sidebarView);
    });
  };

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
    if (!sidebarTree) return;
    ensureSectionSelection();
    const sections = Array.isArray(state.sections) ? state.sections : [];
    if (!sections.length) {
      sidebarTree.innerHTML = '<p class="text-muted small mb-0">No projects yet.</p>';
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
        <span class="sidebar-project-actions">
          <button type="button" class="sidebar-project-icon" data-action="section-add-folder" data-section="${section.id}" title="Create folder">
            <i class="bi bi-folder-plus"></i>
          </button>
          <button type="button" class="sidebar-project-icon" data-action="section-rename" data-section="${section.id}" title="Rename project">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="sidebar-project-icon" data-action="section-delete" data-section="${section.id}" title="Delete project">
            <i class="bi bi-trash"></i>
          </button>
        </span>
      `;
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
              <span class="sidebar-folder-actions">
                <button type="button" class="sidebar-folder-icon" data-action="folder-create-canvas" data-project="${folder.id}" title="New canvas">
                  <i class="bi bi-plus-lg"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-favorite" data-folder="${folder.id}" title="Favorite folder">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-rename" data-folder="${folder.id}" title="Rename folder">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-options" data-folder="${folder.id}" title="More options">
                  <i class="bi bi-three-dots"></i>
                </button>
              </span>
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
            <div class="sidebar-canvas-list"${folderExpanded ? '' : ' hidden'}>
            </div>
          `;

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
            const canvasMenuOpen = idsMatch(state.openCanvasMenuId, canvas.id);
            const isEditingCanvas = idsMatch(state.editingCanvasId, canvas.id);
            const isSidebarInline = isEditingCanvas && state.editingCanvasContext === 'sidebar';
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
                <span class="sidebar-folder-item-actions">
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-duplicate" data-context="sidebar" data-canvas="${canvas.id}" title="Duplicate canvas">
                    <i class="bi bi-files"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-favorite" data-context="sidebar" data-canvas="${canvas.id}" title="Favorite canvas">
                    <i class="bi bi-star"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-rename" data-context="sidebar" data-canvas="${canvas.id}" title="Rename canvas">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="canvas-options" data-context="sidebar" data-canvas="${canvas.id}" title="Canvas options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                </span>
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
      state.openOptionsFolderId = null;
      renderSidebar();
    }
  };

  const toggleFolderMenu = (folderId) => {
    if (!folderId) return;
    state.openOptionsFolderId = idsMatch(state.openOptionsFolderId, folderId) ? null : folderId;
    renderSidebar();
  };

  const closeCanvasMenu = () => {
    if (state.openCanvasMenuId !== null) {
      state.openCanvasMenuId = null;
      renderSidebar();
    }
  };

  const toggleCanvasMenu = (canvasId) => {
    if (!canvasId) return;
    state.openCanvasMenuId = idsMatch(state.openCanvasMenuId, canvasId) ? null : canvasId;
    render();
  };

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
      window.showAppToast?.({
        title: 'Favorites coming soon',
        message: 'Pin canvases once the API is available.',
        variant: 'info'
      });
      return true;
    }
    if (action === 'canvas-rename' && canvasId) {
      stop();
      beginCanvasRename(canvasId, context);
      return true;
    }
    if (action === 'canvas-options' && canvasId) {
      stop();
      toggleCanvasMenu(canvasId);
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
            projectTitle: project.title || 'Untitled project',
            sectionName: section.name || 'Folder'
          });
        });
      });
    });
    canvases.sort((a, b) => {
      const aTime = new Date(a.updated || 0).getTime();
      const bTime = new Date(b.updated || 0).getTime();
      return bTime - aTime;
    });
    state.latestCanvases = canvases.slice(0, 30);
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
        <div class="latest-card-meta">
          ${formatRelative(canvas.updated)} • ${escapeHtml(canvas.projectTitle)}
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
            type: canvas.type || ''
          });
        });
      });
    });
    return rows;
  };

  const getActiveViewContext = () => {
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
    const rows = canvases
      .map((canvas) => {
        const canvasMenuOpen = idsMatch(state.openCanvasMenuId, canvas.id);
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
            <button type="button" class="btn btn-link p-0" data-action="open-canvas" data-canvas="${canvas.id}">
              ${escapeHtml(canvas.title)}
            </button>
          `;
        return `
          <tr>
            <td class="cell-name">
              ${titleCell}
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
                <button type="button" class="table-icon-btn" data-action="canvas-favorite" data-context="list" data-canvas="${canvas.id}" title="Favorite canvas">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-rename" data-context="list" data-canvas="${canvas.id}" title="Rename canvas">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-options" data-context="list" data-canvas="${canvas.id}" title="Canvas options">
                  <i class="bi bi-three-dots"></i>
                </button>
              </div>
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
              <th>Name</th>
              <th>Project</th>
              <th>Folder</th>
              <th>Last opened</th>
              <th>Owner</th>
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
        const canvasMenuOpen = idsMatch(state.openCanvasMenuId, canvas.id);
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
                <button type="button" class="table-icon-btn" data-action="canvas-favorite" data-context="gallery" data-canvas="${canvas.id}" title="Favorite canvas">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-rename" data-context="gallery" data-canvas="${canvas.id}" title="Rename canvas">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="table-icon-btn" data-action="canvas-options" data-context="gallery" data-canvas="${canvas.id}" title="Canvas options">
                  <i class="bi bi-three-dots"></i>
                </button>
              </div>
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
    version: 2,
    global: {
      sessionTitle: 'Untitled canvas'
    },
    order: [],
    traces: {},
    folders: {},
    folderOrder: [],
    ui: {}
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

  const promptFolderTargetSelection = ({ entityTitle, currentProjectId }) => {
    const folders = listFolderTargets();
    if (!folders.length) {
      window.showAppToast?.({
        title: 'No folders available',
        message: 'Create a folder before moving canvases.',
        variant: 'warning'
      });
      return null;
    }
    const hasAlternative = folders.some((entry) => !idsMatch(entry.projectId, currentProjectId));
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
  };

  const selectFolder = (folderId) => {
    if (!folderId) return;
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
    if (action === 'section-delete' && trigger.dataset.section) {
      event.stopPropagation();
      void handleDeleteProject(trigger.dataset.section);
      return;
    }
    if (action === 'folder-favorite' && trigger.dataset.folder) {
      event.stopPropagation();
      window.showAppToast?.({
        title: 'Favorites coming soon',
        message: 'Pin folders once the API is available.',
        variant: 'info'
      });
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
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.openOptionsFolderId) {
        closeFolderMenu();
      }
      if (state.openCanvasMenuId) {
        closeCanvasMenu();
      }
    }
  });

  const handleMainActionClick = (event) => {
    const trigger = resolveClosest(event, '[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
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
    state.sidebarView = button.dataset.view || 'home';
    state.activeProjectId = null;
    renderSidebarNav();
    renderSidebar();
    updateMainTitle();
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

  searchInput?.addEventListener('input', (event) => {
    state.filters.search = event.target.value || '';
    render();
  });

  folderSelect?.addEventListener('change', (event) => {
    const nextValue = event.target.value || 'all';
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

  root.querySelector('[data-action="view-latest"]')?.addEventListener('click', () => {
    state.filters.search = '';
    state.filters.section = 'all';
    state.filters.folder = null;
    state.filters.sort = 'recent';
    if (searchInput) searchInput.value = '';
    if (folderSelect) folderSelect.value = 'all';
    if (sortSelect) sortSelect.value = 'recent';
    state.activeSectionId = null;
    state.activeProjectId = null;
    render();
    const top = state.latestCanvases[0];
    if (top) {
      navigateToCanvas(top.id);
    } else {
      window.showAppToast?.({
        title: 'No recent canvases',
        message: 'Canvases will appear here as you open them.',
        variant: 'info'
      });
    }
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
