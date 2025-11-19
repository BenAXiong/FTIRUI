import { renderMarkdown } from '../../../../../utils/markdown.js';
import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

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

registerContentKind('markdown', {
  normalize(value) {
    return buildContent(resolveText(value));
  },
  serialize(value) {
    return buildContent(resolveText(value));
  }
});

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
  mountContent({ panelId, panelState = {}, rootEl, hostEl, actions = {}, selectors = {} }) {
    if (rootEl) {
      rootEl.classList.add('workspace-panel--markdown');
    }
    if (!hostEl) return { plotEl: null };
    hostEl.classList.add('workspace-panel-plot--markdown');
    hostEl.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'workspace-markdown-panel';
    wrapper.dataset.mode = 'edit';

    const editor = document.createElement('textarea');
    editor.className = 'workspace-markdown-editor form-control';
    editor.placeholder = 'Take notes using plain text or Markdown. See info in header for tips.';

    const preview = document.createElement('div');
    preview.className = 'workspace-markdown-preview';

    const body = document.createElement('div');
    body.className = 'workspace-markdown-body';
    body.appendChild(editor);
    body.appendChild(preview);

    wrapper.appendChild(body);
    hostEl.appendChild(wrapper);

    const safeGetContent = typeof selectors.getPanelContent === 'function'
      ? selectors.getPanelContent
      : () => null;
    const safeSetContent = typeof actions.setPanelContent === 'function'
      ? actions.setPanelContent
      : () => {};

    let lastSavedText = resolveText(safeGetContent(panelId));
    let historyPending = false;
    let restoreFocusOnSave = false;
    let selectionSnapshot = null;

    const applyMode = (mode) => {
      const resolvedMode = mode === 'edit' ? 'edit' : 'split';
      wrapper.dataset.mode = resolvedMode;
      if (resolvedMode === 'edit' && document.activeElement !== editor) {
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
        return;
      }
      const shouldRestoreFocus = restoreFocusOnSave;
      const selection = selectionSnapshot;
      restoreFocusOnSave = false;
      selectionSnapshot = null;
      const shouldPush = historyPending;
      historyPending = false;
      safeSetContent(panelId, buildContent(nextText), {
        pushHistory: shouldPush
      });
      lastSavedText = nextText;
      if (shouldRestoreFocus && document.activeElement !== editor) {
        editor.focus();
        if (selection) {
          const len = editor.value.length;
          const start = Math.min(selection.start, len);
          const end = Math.min(selection.end, len);
          editor.setSelectionRange(start, end);
        }
      }
    };

    const schedulePersist = createDebounce(persistContent, 650);

    editor.addEventListener('input', () => {
      historyPending = true;
      const text = editor.value;
      updatePreview(text);
      schedulePersist();
      if (document.activeElement === editor) {
        restoreFocusOnSave = true;
        selectionSnapshot = {
          start: editor.selectionStart,
          end: editor.selectionEnd
        };
      }
    });

    editor.addEventListener('blur', () => {
      restoreFocusOnSave = false;
      selectionSnapshot = null;
      schedulePersist.flush();
    });

    const refreshContent = (content) => {
      const text = resolveText(content);
      lastSavedText = text;
      historyPending = false;
      if (editor.value !== text) {
        const wasFocused = document.activeElement === editor;
        const selection = wasFocused
          ? { start: editor.selectionStart, end: editor.selectionEnd }
          : null;
        editor.value = text;
        if (wasFocused && selection) {
          const len = editor.value.length;
          const start = Math.min(selection.start, len);
          const end = Math.min(selection.end, len);
          editor.setSelectionRange(start, end);
        }
      }
      updatePreview(text);
      if (wrapper.dataset.mode === 'edit' && document.activeElement !== editor) {
        editor.focus();
      }
    };

    const initialContent = safeGetContent(panelId) ?? panelState.content;
    refreshContent(initialContent);

    applyMode('split');

    return {
      plotEl: null,
      refreshContent,
      getMode: () => wrapper.dataset.mode,
      setMode: (mode) => applyMode(mode)
    };
  }
};
