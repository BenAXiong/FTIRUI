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

  const sectionsContainer = root.querySelector('[data-dashboard-sections]');
  const emptyState = root.querySelector('[data-dashboard-empty]');
  const newSectionBtn = document.getElementById('dashboard_action_new_section');
  const newBoardBtn = document.getElementById('dashboard_action_new_board');
  const sidebarTree = document.querySelector('[data-dashboard-sidebar]');
  const sidebarNav = document.querySelector('[data-sidebar-nav]');
  const sidebarNewProjectBtn = document.getElementById('dashboard_sidebar_new_project');

  const state = {
    sections: [],
    loading: false,
    sidebarView: 'home',
    expandedFolders: new Set(),
    activeSectionId: null,
    activeProjectId: null
  };

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const render = () => {
    if (!sectionsContainer) return;
    sectionsContainer.innerHTML = '';
    const hasSections = Array.isArray(state.sections) && state.sections.length > 0;
    if (!hasSections) {
      emptyState?.classList.add('is-visible');
      renderSidebar();
      renderSidebarNav();
      return;
    }
    emptyState?.classList.remove('is-visible');
    renderSidebar();
    renderSidebarNav();

    state.sections.forEach((section) => {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'dashboard-section';
      sectionEl.dataset.sectionId = section.id;
      sectionEl.innerHTML = `
        <div class="dashboard-section-header">
          <h6>${escapeHtml(section.name)}</h6>
          <span class="small text-muted">${section.projects?.length || 0} projects</span>
          <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-action="create-project" data-section="${section.id}">
            <i class="bi bi-plus-lg me-1"></i>
            Project
          </button>
        </div>
      `;
      const projectsWrapper = document.createElement('div');
      projectsWrapper.className = 'dashboard-projects';

      const projects = Array.isArray(section.projects) ? section.projects : [];
      if (!projects.length) {
        const placeholder = document.createElement('div');
        placeholder.className = 'text-muted small';
        placeholder.textContent = 'No projects yet. Create one to add canvases.';
        projectsWrapper.appendChild(placeholder);
      } else {
        projects.forEach((project) => {
          projectsWrapper.appendChild(renderProject(project));
        });
      }
      sectionEl.appendChild(projectsWrapper);
      sectionsContainer.appendChild(sectionEl);
    });
  };

  const renderProject = (project) => {
    const projectEl = document.createElement('div');
    projectEl.className = 'dashboard-project-card';
    projectEl.dataset.projectId = project.id;
    const boardCount = project.boards?.length || 0;
    projectEl.innerHTML = `
      <h5>
        <i class="bi bi-collection"></i>
        <span>${escapeHtml(project.title)}</span>
        <span class="badge text-bg-light ms-auto">${boardCount} board${boardCount === 1 ? '' : 's'}</span>
      </h5>
      <div class="dashboard-project-meta">${escapeHtml(project.summary || 'No description')}</div>
      <ul class="dashboard-board-list">
        ${renderBoards(project)}
      </ul>
      <div class="d-flex gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="create-board" data-project="${project.id}">
          <i class="bi bi-plus-lg me-1"></i>
          Canvas
        </button>
      </div>
    `;
    return projectEl;
  };

  const renderBoards = (project) => {
    const boards = Array.isArray(project.boards) ? project.boards : [];
    if (!boards.length) {
      return `<li class="text-muted small">No canvases yet.</li>`;
    }
    return boards
      .map(
        (board) => `
          <li>
            <button type="button" class="dashboard-board-button" data-action="open-board" data-board="${board.id}">
              <span>${escapeHtml(board.title || 'Untitled board')}</span>
              <span class="dashboard-board-meta">${formatRelative(board.updated)}</span>
            </button>
          </li>
        `
      )
      .join('');
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
    state.expandedFolders.add(state.activeSectionId);
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
    const fragment = document.createDocumentFragment();
    sections.forEach((section, index) => {
      const expanded =
        state.expandedFolders.has(section.id) || (!state.expandedFolders.size && index === 0);
      if (expanded) {
        state.expandedFolders.add(section.id);
      }
      const folder = document.createElement('div');
      folder.className = `sidebar-folder${expanded ? ' is-open' : ''}`;
      folder.innerHTML = `
        <button type="button" class="sidebar-folder-toggle" data-action="toggle-folder" data-section="${section.id}">
          <span>${escapeHtml(section.name)}</span>
          <span class="sidebar-folder-meta">${section.projects?.length || 0}</span>
        </button>
      `;
      const children = document.createElement('div');
      children.className = 'sidebar-folder-children';
      if (!expanded) {
        children.hidden = true;
      }
      const projects = Array.isArray(section.projects) ? section.projects : [];
      if (!projects.length) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small px-2';
        empty.textContent = 'No projects';
        children.appendChild(empty);
      } else {
        projects.forEach((project) => {
          const projectBtn = document.createElement('button');
          projectBtn.type = 'button';
          projectBtn.dataset.action = 'sidebar-open-project';
          projectBtn.dataset.project = project.id;
          projectBtn.className = `sidebar-project-link${
            state.activeProjectId === project.id ? ' is-active' : ''
          }`;
          projectBtn.innerHTML = `
            <span>${escapeHtml(project.title)}</span>
            <span class="sidebar-project-meta">${project.boards?.length || 0}</span>
          `;
          children.appendChild(projectBtn);
        });
      }
      folder.appendChild(children);
      fragment.appendChild(folder);
    });
    sidebarTree.replaceChildren(fragment);
  };

  const loadSections = async () => {
    try {
      state.loading = true;
      const data = await fetchSections({ include: true });
      state.sections = Array.isArray(data?.items) ? data.items : [];
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
      state.expandedFolders.add(section.id);
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

  sectionsContainer?.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-action="open-board"]');
    if (openBtn?.dataset.board) {
      navigateToBoard(openBtn.dataset.board);
      return;
    }
    const projectBtn = event.target.closest('[data-action="create-board"]');
    if (projectBtn?.dataset.project) {
      void handleCreateBoard(projectBtn.dataset.project);
      return;
    }
    const createProjectBtn = event.target.closest('[data-action="create-project"]');
    if (createProjectBtn?.dataset.section) {
      void handleCreateProject(createProjectBtn.dataset.section);
    }
  });

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
      state.expandedFolders.add(section.id);
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

  const toggleFolder = (sectionId) => {
    if (!sectionId) return;
    if (state.expandedFolders.has(sectionId)) {
      state.expandedFolders.delete(sectionId);
    } else {
      state.expandedFolders.add(sectionId);
    }
    state.activeSectionId = sectionId;
    renderSidebar();
  };

  sidebarTree?.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger) return;
    const { action } = trigger.dataset;
    if (action === 'toggle-folder' && trigger.dataset.section) {
      toggleFolder(trigger.dataset.section);
      return;
    }
    if (action === 'sidebar-open-project' && trigger.dataset.project) {
      state.activeProjectId = trigger.dataset.project;
      renderSidebar();
      const project = findProject(trigger.dataset.project);
      const board = project?.boards?.[0];
      if (board) {
        navigateToBoard(board.id);
      }
    }
  });

  sidebarNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    state.sidebarView = button.dataset.view || 'home';
    renderSidebarNav();
  });

  const getActiveSection = () => {
    if (!state.activeSectionId) return null;
    return state.sections.find((section) => section.id === state.activeSectionId) || null;
  };

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

  void loadSections();
  return {
    reload: loadSections
  };
}
