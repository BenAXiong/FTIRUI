import {
  fetchSections,
  createSection,
  createProject,
  createCanvas
} from '../../services/dashboard.js';

const DEFAULT_SECTION_NAME = 'Folder';
const DEFAULT_PROJECT_NAME = 'Workspace';

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

  const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));
  const idsMatch = (left, right) => normalizeId(left) === normalizeId(right);

  const getActiveSection = () => {
    if (!state.activeSectionId) return null;
    return (
      state.sections.find((section) => idsMatch(section.id, state.activeSectionId)) || null
    );
  };

  const updateMainTitle = () => {
    if (!titleLabel) return;
    const activeFolder = state.activeProjectId ? findProject(state.activeProjectId) : null;
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
        <button
          type="button"
          class="sidebar-project-link${projectSelected ? ' is-selected' : ''}"
          data-action="select-project"
          data-section="${section.id}"
        >
          <span>${escapeHtml(section.name)}</span>
        </button>
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
              <button
                type="button"
                class="sidebar-folder-label${folderSelected ? ' is-selected' : ''}"
                data-action="select-folder"
                data-folder="${folder.id}"
              >
                <span>${escapeHtml(folder.title || 'Untitled folder')}</span>
              </button>
              <span class="sidebar-folder-actions">
                <button type="button" class="sidebar-folder-icon" data-action="folder-create-canvas" data-project="${folder.id}" title="New canvas">
                  <i class="bi bi-plus-lg"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-pin" data-folder="${folder.id}" title="Pin folder">
                  <i class="bi bi-star"></i>
                </button>
                <button type="button" class="sidebar-folder-icon" data-action="folder-options" data-folder="${folder.id}" title="Folder options">
                  <i class="bi bi-three-dots"></i>
                </button>
              </span>
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
              canvasRow.innerHTML = `
                <button
                  type="button"
                  class="sidebar-folder-link"
                  data-action="sidebar-open-canvas"
                  data-canvas="${canvas.id}"
                  data-folder="${folder.id}"
                >
                  ${escapeHtml(canvas.title || 'Untitled canvas')}
                </button>
                <span class="sidebar-folder-item-actions">
                  <button type="button" class="sidebar-folder-icon" data-action="folder-pin" data-canvas="${canvas.id}" title="Pin canvas">
                    <i class="bi bi-star"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="folder-options" data-canvas="${canvas.id}" title="Canvas options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                </span>
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
            projectTitle: project.title || 'Untitled project',
            folderName: section.name || 'Folder',
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

  const renderList = (canvases) => {
    if (!listContainer) return;
    if (!canvases.length) {
      listContainer.innerHTML = '';
      return;
    }
    const rows = canvases
      .map(
        (canvas) => `
          <tr>
            <td class="cell-name">
              <button type="button" class="btn btn-link p-0" data-action="open-canvas" data-canvas="${canvas.id}">
                ${escapeHtml(canvas.title)}
              </button>
            </td>
            <td>${escapeHtml(canvas.projectTitle)}</td>
            <td>${escapeHtml(canvas.folderName)}</td>
            <td class="cell-meta">${formatRelative(canvas.updated)}</td>
            <td class="cell-meta">${escapeHtml(canvas.owner)}</td>
            <td class="table-actions">
              <button type="button" class="table-icon-btn" data-action="list-pin" data-canvas="${canvas.id}" title="Pin">
                <i class="bi bi-star"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-more" data-canvas="${canvas.id}" title="More options">
                <i class="bi bi-three-dots"></i>
              </button>
            </td>
          </tr>
        `
      )
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
      .map(
        (canvas) => `
          <article class="dashboard-gallery-card">
            <div class="dashboard-gallery-thumb" aria-hidden="true"></div>
            <div class="dashboard-gallery-title">${escapeHtml(canvas.title)}</div>
            <div class="dashboard-gallery-meta">${formatRelative(canvas.updated)} • ${escapeHtml(canvas.projectTitle)}</div>
            <div class="table-actions">
              <button type="button" class="table-icon-btn" data-action="open-canvas" data-canvas="${canvas.id}" title="Open">
                <i class="bi bi-box-arrow-up-right"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-pin" data-canvas="${canvas.id}" title="Pin">
                <i class="bi bi-star"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-more" data-canvas="${canvas.id}" title="More options">
                <i class="bi bi-three-dots"></i>
              </button>
            </div>
          </article>
        `
      )
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
      if (state.activeProjectId && !findProject(state.activeProjectId)) {
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
      let project = findProject(projectId);
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

  const findProject = (projectId) => {
    for (const section of state.sections) {
      const projects = section.projects || [];
      const match = projects.find((project) => idsMatch(project.id, projectId));
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

  const handleCreateSection = async () => {
    const name = window.prompt('Folder name', DEFAULT_SECTION_NAME);
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
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to create section',
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
    const openedWindow = window.open(target.toString(), '_blank', 'noopener');
    if (!openedWindow) {
      window.location.assign(target.toString());
    }
  };

  const handleCreateProject = async (sectionId) => {
    const section = state.sections.find((item) => idsMatch(item.id, sectionId));
    if (!section) return;
    const title = window.prompt('Project title', DEFAULT_PROJECT_NAME);
    if (!title) return;
    try {
      const project = await createProject(section.id, { title, summary: '' });
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
    } catch (err) {
      window.showAppToast?.({
        title: 'Unable to create project',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  newSectionBtn?.addEventListener('click', () => {
    void handleCreateSection();
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
    const trigger = event.target.closest('button[data-action]');
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
      void handleCreateProject(trigger.dataset.section);
      return;
    }
    if (action === 'folder-create-canvas' && trigger.dataset.project) {
      event.stopPropagation();
      void handleCreateCanvas(trigger.dataset.project);
      return;
    }
    if (
      (action === 'folder-pin' || action === 'folder-options') &&
      (trigger.dataset.section || trigger.dataset.canvas || trigger.dataset.folder)
    ) {
      event.stopPropagation();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'This action will arrive in a future update.',
        variant: 'info'
      });
      return;
    }
    if (action === 'sidebar-open-canvas' && trigger.dataset.canvas) {
      if (trigger.dataset.folder) {
        selectFolder(trigger.dataset.folder);
      }
      navigateToCanvas(trigger.dataset.canvas);
    }
  });

  sidebarNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    state.sidebarView = button.dataset.view || 'home';
    state.activeProjectId = null;
    renderSidebarNav();
    renderSidebar();
    updateMainTitle();
  });

  sidebarNewProjectBtn?.addEventListener('click', () => {
    const activeSection = getActiveSection();
    if (!activeSection) {
      window.showAppToast?.({
        title: 'No folder selected',
        message: 'Create a folder before adding a project.',
        variant: 'warning'
      });
      return;
    }
    void handleCreateProject(activeSection.id);
  });

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
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    state.viewMode = button.dataset.view || 'list';
    updateView();
  });

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    if (trigger.dataset.action === 'list-pin') {
      event.preventDefault();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'Pinning will be available soon.',
        variant: 'info'
      });
      return;
    }
    if (trigger.dataset.action === 'list-more') {
      event.preventDefault();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'More options will arrive soon.',
        variant: 'info'
      });
      return;
    }
    if (trigger.dataset.action === 'open-canvas' && trigger.dataset.canvas) {
      event.preventDefault();
      navigateToCanvas(trigger.dataset.canvas);
    }
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
