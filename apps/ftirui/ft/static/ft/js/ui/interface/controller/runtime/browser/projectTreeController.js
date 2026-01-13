import { escapeHtml } from '../../../../utils/dom.js';
import { fetchSections } from '../../../../../services/dashboard.js';

export function createProjectTreeController({
  root,
  getActiveCanvasId,
  getWorkspaceRoute,
  notify
} = {}) {
  if (!root || typeof root.querySelector !== 'function') return null;

  const treeEl = root.querySelector('[data-project-tree]');
  const placeholderEl = root.querySelector('[data-project-placeholder]');
  if (!treeEl || !placeholderEl) return null;

  let isLoading = false;
  let hasLoaded = false;

  const setPlaceholder = (message) => {
    placeholderEl.textContent = message;
    placeholderEl.hidden = false;
    treeEl.hidden = true;
  };

  const showTree = () => {
    placeholderEl.hidden = true;
    treeEl.hidden = false;
  };

  const getActiveCanvas = () => {
    if (typeof getActiveCanvasId === 'function') return getActiveCanvasId();
    return null;
  };

  const buildCanvasButton = (canvas, activeId) => {
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
    return btn;
  };

  const renderTree = (sections = []) => {
    treeEl.innerHTML = '';
    const activeId = getActiveCanvas();

    if (!sections.length) {
      setPlaceholder('No projects found.');
      return;
    }

    const matchesActive = (canvasId) => activeId != null && String(canvasId) === String(activeId);
    sections.forEach((section) => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'workspace-project-section';
      const projects = Array.isArray(section.projects) ? section.projects : [];
      const hasActiveCanvas = projects.some((project) =>
        (Array.isArray(project.canvases) ? project.canvases : [])
          .some((canvas) => matchesActive(canvas?.id))
      );
      if (hasActiveCanvas) {
        sectionEl.classList.add('is-active');
      }
      sectionEl.innerHTML = `
        <div class="workspace-project-section-title">
          <i class="bi bi-collection"></i>
          <span>${escapeHtml(section.name || 'Project')}</span>
        </div>
      `;
      if (!projects.length) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small';
        empty.textContent = 'No folders yet.';
        sectionEl.appendChild(empty);
      } else {
        projects.forEach((project) => {
          const folderEl = document.createElement('div');
          folderEl.className = 'workspace-project-folder';
          folderEl.innerHTML = `
            <div class="workspace-project-folder-title">
              <i class="bi bi-folder2-open"></i>
              <span>${escapeHtml(project.title || 'Folder')}</span>
            </div>
          `;
          const canvasList = document.createElement('div');
          canvasList.className = 'workspace-project-canvas-list';
          const canvases = Array.isArray(project.canvases) ? project.canvases : [];
          if (!canvases.length) {
            const empty = document.createElement('div');
            empty.className = 'text-muted small';
            empty.textContent = 'No canvases.';
            canvasList.appendChild(empty);
          } else {
            canvases.forEach((canvas) => {
              canvasList.appendChild(buildCanvasButton(canvas, activeId));
            });
          }
          folderEl.appendChild(canvasList);
          sectionEl.appendChild(folderEl);
        });
      }
      treeEl.appendChild(sectionEl);
    });

    showTree();
  };

  const handleTreeClick = (event) => {
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

  treeEl.addEventListener('click', handleTreeClick);

  return {
    ensureLoaded: load,
    refresh: async () => {
      if (isLoading) return;
      hasLoaded = false;
      await load();
    },
    render: renderTree,
    teardown() {
      treeEl.removeEventListener('click', handleTreeClick);
    }
  };
}
