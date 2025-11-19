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

    const toolbar = document.createElement('div');
    toolbar.className = 'workspace-markdown-toolbar';
    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'workspace-markdown-toolbar-actions';
    toolbar.appendChild(toolbarActions);

    const editor = document.createElement('textarea');
    editor.className = 'workspace-markdown-editor form-control';
    editor.placeholder = 'Take notes using plain text or Markdown. See info in header for tips.';

    const preview = document.createElement('div');
    preview.className = 'workspace-markdown-preview';

    const body = document.createElement('div');
    body.className = 'workspace-markdown-body';
    body.appendChild(editor);
    body.appendChild(preview);

    wrapper.appendChild(toolbar);
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
    const commitEditorValue = () => {
      historyPending = true;
      updatePreview(editor.value);
      schedulePersist();
      restoreFocusOnSave = true;
      selectionSnapshot = {
        start: editor.selectionStart,
        end: editor.selectionEnd
      };
    };

    const ensureEditorFocus = () => {
      if (document.activeElement !== editor) {
        editor.focus();
      }
    };

    const wrapSelection = ({ before = '', after = '', placeholder = '' }) => {
      ensureEditorFocus();
      const start = editor.selectionStart ?? 0;
      const end = editor.selectionEnd ?? start;
      const value = editor.value;
      const selected = value.slice(start, end) || placeholder;
      const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
      const nextStart = start + before.length;
      const nextEnd = nextStart + selected.length;
      editor.value = nextValue;
      editor.setSelectionRange(nextStart, nextEnd);
      commitEditorValue();
    };

    const insertHeading = (level = 1) => {
      const headingLevel = Math.min(Math.max(Number(level) || 1, 1), 6);
      ensureEditorFocus();
      const start = editor.selectionStart ?? 0;
      const end = editor.selectionEnd ?? start;
      const prefix = `${'#'.repeat(headingLevel)} `;
      const value = editor.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndCandidate = value.indexOf('\n', start);
      const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
      const line = value.slice(lineStart, lineEnd);
      const normalizedLine = line.replace(/^#{1,6}\s+/, '');
      const nextLine = `${prefix}${normalizedLine || 'Heading'}`;
      const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`;
      const delta = nextLine.length - line.length;
      editor.value = nextValue;
      editor.setSelectionRange(start + delta, end + delta);
      commitEditorValue();
    };

    const formattingActions = [
      { id: 'h1', label: 'H1', title: 'Heading 1', handler: () => insertHeading(1) },
      { id: 'h2', label: 'H2', title: 'Heading 2', handler: () => insertHeading(2) },
      { id: 'h3', label: 'H3', title: 'Heading 3', handler: () => insertHeading(3) },
      { id: 'bold', label: 'B', title: 'Bold', handler: () => wrapSelection({ before: '**', after: '**', placeholder: 'bold text' }) },
      { id: 'italic', label: 'I', title: 'Italic', handler: () => wrapSelection({ before: '*', after: '*', placeholder: 'italic text' }) },
      { id: 'underline', label: 'U', title: 'Underline', handler: () => wrapSelection({ before: '<u>', after: '</u>', placeholder: 'underlined' }) },
      { id: 'strike', label: 'S', title: 'Strikethrough', handler: () => wrapSelection({ before: '~~', after: '~~', placeholder: 'strike' }) }
    ];

    const createFormattingButton = (action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm workspace-markdown-format-btn';
      btn.textContent = action.label;
      btn.title = action.title;
      btn.dataset.mdAction = action.id;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof action.handler === 'function') {
          action.handler();
        }
      });
      return btn;
    };
    formattingActions.forEach((action) => {
      toolbarActions.appendChild(createFormattingButton(action));
    });

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
