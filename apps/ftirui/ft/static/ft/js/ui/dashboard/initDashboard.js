import {
  fetchSections,
  createSection,
  createProject,
  createBoard
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
  const newBoardBtn = document.getElementById('dashboard_action_new_board');
  const sidebarTree = document.querySelector('[data-dashboard-sidebar]');
  const sidebarNav = document.querySelector('[data-sidebar-nav]');
  const sidebarNewProjectBtn = document.getElementById('dashboard_sidebar_new_project');
  const titleLabel = root.querySelector('[data-dashboard-title]');
  const latestContainer = root.querySelector('[data-dashboard-latest]');
  const searchInput = document.getElementById('dashboard_filter_search');
  const folderSelect = document.getElementById('dashboard_filter_folder');
  const sortSelect = document.getElementById('dashboard_filter_sort');
  const viewToggle = document.querySelector('[data-dashboard-view-toggle]');

  const state = {
    sections: [],
    loading: false,
    sidebarView: 'home',
    expandedProjects: new Set(),
    expandedFolders: new Set(),
    activeSectionId: null,
    activeProjectId: null,
    latestBoards: [],
    filters: {
      search: '',
      section: 'all',
      sort: 'recent'
    },
    viewMode: 'list'
  };

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const getActiveSection = () => {
    if (!state.activeSectionId) return null;
    return state.sections.find((section) => section.id === state.activeSectionId) || null;
  };

  const updateMainTitle = () => {
    if (!titleLabel) return;
    const activeProject = state.activeProjectId ? findProject(state.activeProjectId) : null;
    if (activeProject) {
      titleLabel.textContent = activeProject.title || 'Untitled project';
    } else {
      titleLabel.textContent = 'All Projects';
    }
  };

  const getFilteredSections = () => {
    let sections = Array.isArray(state.sections) ? state.sections : [];
    const { search, section: sectionFilter, sort } = state.filters;
    const query = search.trim().toLowerCase();
    if (sectionFilter && sectionFilter !== 'all') {
      sections = sections.filter((section) => section.id === sectionFilter);
    }
    const filtered = sections
      .map((section) => {
        const projects = (section.projects || [])
          .map((project) => {
            let boards = Array.isArray(project.boards) ? [...project.boards] : [];
            const matchesProject = query
              ? project.title?.toLowerCase().includes(query)
              : true;
            if (query && !matchesProject) {
              boards = boards.filter((board) =>
                (board.title || 'Untitled').toLowerCase().includes(query)
              );
              if (!boards.length) {
                return null;
              }
            }
            boards = sortBoards(boards, sort);
            return {
              ...project,
              boards
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
    const boards = flattenBoards(filteredSections);
    state.filteredBoards = boards;
    if (!boards.length) {
      emptyState?.classList.add('is-visible');
    } else {
      emptyState?.classList.remove('is-visible');
    }
    renderList(boards);
    renderGallery(boards);
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
    if (!state.activeSectionId) {
      state.activeSectionId = state.sections[0].id;
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
      projectRow.className = 'sidebar-project-row';
      projectRow.innerHTML = `
        <button type="button" class="sidebar-project-toggle" data-action="toggle-project" data-section="${section.id}">
          <i class="bi bi-chevron-right sidebar-project-chevron"></i>
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
          folderEntry.className = `sidebar-folder-entry${folderExpanded ? ' is-open' : ''}`;
          folderEntry.innerHTML = `
            <div class="sidebar-folder-row">
              <button type="button" class="sidebar-folder-toggle" data-action="toggle-folder" data-folder="${folder.id}">
                <i class="bi bi-chevron-right sidebar-folder-chevron"></i>
                <span>${escapeHtml(folder.title || 'Untitled folder')}</span>
              </button>
              <span class="sidebar-folder-actions">
                <button type="button" class="sidebar-folder-icon" data-action="folder-create-board" data-project="${folder.id}" title="New canvas">
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
            <div class="sidebar-board-list"${folderExpanded ? '' : ' hidden'}>
            </div>
          `;

          const boardList = folderEntry.querySelector('.sidebar-board-list');
          const boards = Array.isArray(folder.boards) ? folder.boards : [];
          if (!boards.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'text-muted small px-4';
            placeholder.textContent = 'No canvases yet';
            boardList?.appendChild(placeholder);
          } else {
            boards.forEach((board) => {
              const boardRow = document.createElement('div');
              boardRow.className = 'sidebar-folder-item';
              boardRow.innerHTML = `
                <button type="button" class="sidebar-folder-link" data-action="sidebar-open-board" data-board="${board.id}">
                  ${escapeHtml(board.title || 'Untitled board')}
                </button>
                <span class="sidebar-folder-item-actions">
                  <button type="button" class="sidebar-folder-icon" data-action="folder-pin" data-board="${board.id}" title="Pin canvas">
                    <i class="bi bi-star"></i>
                  </button>
                  <button type="button" class="sidebar-folder-icon" data-action="folder-options" data-board="${board.id}" title="Canvas options">
                    <i class="bi bi-three-dots"></i>
                  </button>
                </span>
              `;
              boardList?.appendChild(boardRow);
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
      current === 'all' || (state.sections || []).some((section) => section.id === current);
    const nextValue = valid ? current : 'all';
    folderSelect.value = nextValue;
    state.filters.section = nextValue;
  };

  const computeLatestBoards = () => {
    const boards = [];
    (state.sections || []).forEach((section) => {
      (section.projects || []).forEach((project) => {
        (project.boards || []).forEach((board) => {
          boards.push({
            id: board.id,
            title: board.title || 'Untitled board',
            updated: board.updated,
            projectTitle: project.title || 'Untitled project',
            sectionName: section.name || 'Folder'
          });
        });
      });
    });
    boards.sort((a, b) => {
      const aTime = new Date(a.updated || 0).getTime();
      const bTime = new Date(b.updated || 0).getTime();
      return bTime - aTime;
    });
    state.latestBoards = boards.slice(0, 30);
    renderLatest();
  };

  const renderLatest = () => {
    if (!latestContainer) return;
    latestContainer.innerHTML = '';
    if (!state.latestBoards.length) {
      latestContainer.innerHTML =
        '<p class="text-muted small mb-0">No recent canvases yet.</p>';
      return;
    }
    state.latestBoards.forEach((board) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'latest-card';
      card.dataset.board = board.id;
      card.innerHTML = `
        <div class="latest-card-thumb" aria-hidden="true"></div>
        <div class="latest-card-title">${escapeHtml(board.title)}</div>
        <div class="latest-card-meta">
          ${formatRelative(board.updated)} • ${escapeHtml(board.projectTitle)}
        </div>
      `;
      card.addEventListener('click', () => navigateToBoard(board.id));
      latestContainer.appendChild(card);
    });
  };

  const flattenBoards = (sections) => {
    const rows = [];
    sections.forEach((section) => {
      (section.projects || []).forEach((project) => {
        (project.boards || []).forEach((board) => {
          rows.push({
            id: board.id,
            title: board.title || 'Untitled board',
            projectTitle: project.title || 'Untitled project',
            folderName: section.name || 'Folder',
            updated: board.updated,
            owner: board.owner || 'You',
            tags: board.tags || [],
            type: board.type || ''
          });
        });
      });
    });
    return rows;
  };

  const renderList = (boards) => {
    if (!listContainer) return;
    if (!boards.length) {
      listContainer.innerHTML = '';
      return;
    }
    const rows = boards
      .map(
        (board) => `
          <tr>
            <td class="cell-name">
              <button type="button" class="btn btn-link p-0" data-action="open-board" data-board="${board.id}">
                ${escapeHtml(board.title)}
              </button>
            </td>
            <td>${escapeHtml(board.projectTitle)}</td>
            <td>${escapeHtml(board.folderName)}</td>
            <td class="cell-meta">${formatRelative(board.updated)}</td>
            <td class="cell-meta">${escapeHtml(board.owner)}</td>
            <td class="table-actions">
              <button type="button" class="table-icon-btn" data-action="list-pin" data-board="${board.id}" title="Pin">
                <i class="bi bi-star"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-more" data-board="${board.id}" title="More options">
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

  const renderGallery = (boards) => {
    if (!galleryContainer) return;
    if (!boards.length) {
      galleryContainer.innerHTML = '';
      return;
    }
    galleryContainer.innerHTML = boards
      .map(
        (board) => `
          <article class="dashboard-gallery-card">
            <div class="dashboard-gallery-thumb" aria-hidden="true"></div>
            <div class="dashboard-gallery-title">${escapeHtml(board.title)}</div>
            <div class="dashboard-gallery-meta">${formatRelative(board.updated)} • ${escapeHtml(board.projectTitle)}</div>
            <div class="table-actions">
              <button type="button" class="table-icon-btn" data-action="open-board" data-board="${board.id}" title="Open">
                <i class="bi bi-box-arrow-up-right"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-pin" data-board="${board.id}" title="Pin">
                <i class="bi bi-star"></i>
              </button>
              <button type="button" class="table-icon-btn" data-action="list-more" data-board="${board.id}" title="More options">
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
        !state.sections.some((section) => section.id === state.activeSectionId)
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
      updateFolderOptions();
      computeLatestBoards();
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
      project.boards = [];
      section.projects = section.projects || [];
      section.projects.push(project);
    }

    return { section, project };
  };

  const handleCreateBoard = async (projectId) => {
    try {
      let project = findProject(projectId);
      if (!project) {
        const ensured = await ensureProject();
        project = ensured.project;
      }
      const payload = await createBoard(project.id, {
        title: 'Untitled board',
        state: createEmptyWorkspaceSnapshot()
      });
      project.boards = [payload, ...(project.boards || [])];
      state.expandedFolders.add(project.id);
      state.activeProjectId = project.id;
      computeLatestBoards();
      render();
      navigateToBoard(payload.id);
    } catch (err) {
      console.warn('Failed to create board', err);
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
      sessionTitle: 'Untitled board'
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
      const match = projects.find((project) => project.id === projectId);
      if (match) return match;
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

  const navigateToBoard = (boardId) => {
    if (!boardId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('board', boardId);
    url.hash = '#pane-plotC';
    window.location.href = url.toString();
  };

  const handleCreateProject = async (sectionId) => {
    const section = state.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const title = window.prompt('Project title', DEFAULT_PROJECT_NAME);
    if (!title) return;
    try {
      const project = await createProject(section.id, { title, summary: '' });
      project.boards = [];
      section.projects = section.projects || [];
      section.projects.push(project);
      state.activeProjectId = project.id;
      state.activeSectionId = section.id;
      state.expandedProjects.add(section.id);
      state.expandedFolders.add(project.id);
      updateFolderOptions();
      computeLatestBoards();
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

  newBoardBtn?.addEventListener('click', () => {
    void handleCreateBoard();
  });

  const toggleProject = (sectionId) => {
    if (!sectionId) return;
    if (state.expandedProjects.has(sectionId)) {
      state.expandedProjects.delete(sectionId);
      const section = state.sections.find((sec) => sec.id === sectionId);
      if (section?.projects) {
        section.projects.forEach((project) => {
          state.expandedFolders.delete(project.id);
          if (state.activeProjectId === project.id) {
            state.activeProjectId = null;
          }
        });
      }
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
      if (state.activeProjectId === folderId) {
        state.activeProjectId = null;
      }
    } else {
      state.expandedFolders.add(folderId);
      state.activeProjectId = folderId;
    }
    renderSidebar();
    updateMainTitle();
  };

  sidebarTree?.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger) return;
    const { action } = trigger.dataset;
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
    if (action === 'folder-create-board' && trigger.dataset.project) {
      event.stopPropagation();
      void handleCreateBoard(trigger.dataset.project);
      return;
    }
    if (
      (action === 'folder-pin' || action === 'folder-options') &&
      (trigger.dataset.section || trigger.dataset.board || trigger.dataset.folder)
    ) {
      event.stopPropagation();
      window.showAppToast?.({
        title: 'Coming soon',
        message: 'This action will arrive in a future update.',
        variant: 'info'
      });
      return;
    }
    if (action === 'sidebar-open-board' && trigger.dataset.board) {
      navigateToBoard(trigger.dataset.board);
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
    state.filters.section = event.target.value || 'all';
    render();
  });

  sortSelect?.addEventListener('change', (event) => {
    state.filters.sort = event.target.value || 'recent';
    render();
    renderLatest();
  });

  root.querySelector('[data-action="view-latest"]')?.addEventListener('click', () => {
    state.filters.search = '';
    state.filters.section = 'all';
    state.filters.sort = 'recent';
    if (searchInput) searchInput.value = '';
    if (folderSelect) folderSelect.value = 'all';
    if (sortSelect) sortSelect.value = 'recent';
    render();
    const top = state.latestBoards[0];
    if (top) {
      navigateToBoard(top.id);
    } else {
      window.showAppToast?.({
        title: 'No recent canvases',
        message: 'Boards will appear here as you open them.',
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
    if (trigger.dataset.action === 'open-board' && trigger.dataset.board) {
      event.preventDefault();
      navigateToBoard(trigger.dataset.board);
    }
  });

  void loadSections();
  return {
    reload: loadSections
  };
}

function sortBoards(boards, mode) {
  const copy = [...boards];
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
      const aTime = new Date(a.created || a.boards?.[0]?.created || 0).getTime();
      const bTime = new Date(b.created || b.boards?.[0]?.created || 0).getTime();
      return bTime - aTime;
    });
  } else {
    copy.sort((a, b) => {
      const aTime = new Date(a.updated || a.boards?.[0]?.updated || 0).getTime();
      const bTime = new Date(b.updated || b.boards?.[0]?.updated || 0).getTime();
      return bTime - aTime;
    });
  }
  return copy;
}
