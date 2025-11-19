import { renderMarkdown } from '../../../../../utils/markdown.js';

const buildContent = (text = '') => ({
  kind: 'markdown',
  version: 1,
  data: { text }
});

const resolveText = (content) => {
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return content.text;
  if (content.data && typeof content.data.text === 'string') {
    return content.data.text;
  }
  return '';
};

const createDebounce = (fn, delay = 400) => {
  let handle = null;
  const wrapped = (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, delay);
  };
  wrapped.flush = (...args) => {
    if (handle) {
      clearTimeout(handle);
      handle = null;
      fn(...args);
    }
  };
  return wrapped;
};

export const markdownPanelType = {
  id: 'markdown',
  label: 'Markdown note',
  capabilities: {
    plot: false
  },
  panelClass: 'workspace-panel--markdown',
  getDefaultTitle() {
    return 'Markdown note';
  },
  prepareInitialState(incomingState = {}) {
    const existing = incomingState.content;
    const text = resolveText(existing) || '# Markdown note\n\nStart typing…';
    return {
      content: buildContent(text)
    };
  },
  mountContent({ panelId, rootEl, hostEl, actions = {}, selectors = {} }) {
    if (rootEl) {
      rootEl.classList.add('workspace-panel--markdown');
    }
    if (!hostEl) return { plotEl: null };
    hostEl.classList.add('workspace-panel-plot--markdown');
    hostEl.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'workspace-markdown-panel';
    wrapper.dataset.mode = 'preview';

    const toolbar = document.createElement('div');
    toolbar.className = 'workspace-markdown-toolbar';

    const modeGroup = document.createElement('div');
    modeGroup.className = 'btn-group btn-group-sm workspace-markdown-toolbar-modes';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-outline-secondary';
    editBtn.textContent = 'Edit';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn btn-outline-secondary is-active';
    previewBtn.textContent = 'Preview';

    modeGroup.appendChild(editBtn);
    modeGroup.appendChild(previewBtn);

    const status = document.createElement('span');
    status.className = 'workspace-markdown-status text-body-secondary';
    status.textContent = 'Saved';

    toolbar.appendChild(modeGroup);
    toolbar.appendChild(status);

    const editor = document.createElement('textarea');
    editor.className = 'workspace-markdown-editor form-control';
    editor.placeholder = 'Write Markdown…';

    const preview = document.createElement('div');
    preview.className = 'workspace-markdown-preview';

    wrapper.appendChild(toolbar);
    wrapper.appendChild(editor);
    wrapper.appendChild(preview);
    hostEl.appendChild(wrapper);

    const safeGetContent = typeof selectors.getPanelContent === 'function'
      ? selectors.getPanelContent
      : () => null;
    const safeSetContent = typeof actions.setPanelContent === 'function'
      ? actions.setPanelContent
      : () => {};

    let lastSavedText = resolveText(safeGetContent(panelId));
    let historyPending = false;

    const applyMode = (mode) => {
      wrapper.dataset.mode = mode;
      editBtn.classList.toggle('is-active', mode === 'edit');
      previewBtn.classList.toggle('is-active', mode === 'preview');
      if (mode === 'edit') {
        editor.focus();
      }
    };

    const updatePreview = (text) => {
      preview.innerHTML = renderMarkdown(text);
      preview.classList.toggle('is-empty', !text.trim());
    };

    const persistContent = () => {
      const nextText = editor.value;
      if (nextText === lastSavedText) {
        status.textContent = 'Saved';
        return;
      }
      status.textContent = 'Saving…';
      const shouldPush = historyPending;
      historyPending = false;
      safeSetContent(panelId, buildContent(nextText), {
        pushHistory: shouldPush
      });
      lastSavedText = nextText;
      status.textContent = 'Saved';
    };

    const schedulePersist = createDebounce(persistContent, 650);

    editor.addEventListener('input', () => {
      historyPending = true;
      const text = editor.value;
      updatePreview(text);
      status.textContent = 'Editing…';
      schedulePersist();
    });

    editor.addEventListener('blur', () => {
      schedulePersist.flush();
    });

    editBtn.addEventListener('click', () => applyMode('edit'));
    previewBtn.addEventListener('click', () => {
      schedulePersist.flush();
      applyMode('preview');
    });

    const refreshContent = (content) => {
      const text = resolveText(content);
      lastSavedText = text;
      historyPending = false;
      if (document.activeElement !== editor) {
        editor.value = text;
      }
      updatePreview(text);
      status.textContent = text.trim() ? 'Updated' : 'Empty note';
    };

    const initialContent = safeGetContent(panelId) ?? panelState.content;
    refreshContent(initialContent);

    return {
      plotEl: null,
      refreshContent
    };
  }
};
