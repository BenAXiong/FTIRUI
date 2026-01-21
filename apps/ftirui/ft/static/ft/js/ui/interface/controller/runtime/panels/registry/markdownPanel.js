import { renderMarkdown } from '../../../../../utils/markdown.js';
import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const buildContent = (text = '', renderMode = 'markdown') => ({
  kind: 'markdown',
  version: 1,
  data: { text, renderMode }
});

const resolveText = (content) => {
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return content.text;
  if (content.data && typeof content.data.text === 'string') {
    return content.data.text;
  }
  return '';
};

const resolveRenderMode = (content) => {
  const mode = content?.data?.renderMode || content?.renderMode;
  return mode === 'plain' ? 'plain' : 'markdown';
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
    return buildContent(resolveText(value), resolveRenderMode(value));
  },
  serialize(value) {
    return buildContent(resolveText(value), resolveRenderMode(value));
  }
});

export const markdownPanelType = {
  id: 'markdown',
  label: 'Note',
  capabilities: {
    plot: false
  },
  panelClass: 'workspace-panel--markdown',
  getDefaultTitle() {
    return 'Note';
  },
  prepareInitialState(incomingState = {}) {
    const existing = incomingState.content;
    const text = resolveText(existing) || '# Note\n\nStart typing…';
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
    let renderMode = resolveRenderMode(safeGetContent(panelId) ?? panelState.content);
    let historyPending = false;
    let restoreFocusOnSave = false;
    let selectionSnapshot = null;
    let lastMarkdownMode = 'split';

    const applyMode = (mode) => {
      const allowedModes = new Set(['edit', 'preview', 'split', 'split-h']);
      const resolvedMode = allowedModes.has(mode) ? mode : 'split';
      wrapper.dataset.mode = resolvedMode;
      if (resolvedMode === 'edit' && document.activeElement !== editor) {
        editor.focus();
      }
    };

    const stripMathDelimiters = (value = '') => value
      .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
      .replace(/\$([^\n]+?)\$/g, '$1');

    const renderPlainText = (text) => {
      if (typeof document === 'undefined') return text || '';
      const cleaned = stripMathDelimiters(text || '');
      const temp = document.createElement('div');
      temp.innerHTML = renderMarkdown(cleaned);
      return temp.innerText || temp.textContent || '';
    };

    const updateRenderMode = (nextMode, { normalizeText = false, pushHistory = true } = {}) => {
      const resolved = nextMode === 'plain' ? 'plain' : 'markdown';
      if (resolved === renderMode && !normalizeText) return;
      renderMode = resolved;
      wrapper.dataset.render = renderMode;
      let nextText = editor.value;
      if (renderMode === 'plain') {
        lastMarkdownMode = wrapper.dataset.mode || lastMarkdownMode;
        applyMode('edit');
        if (normalizeText) {
          nextText = renderPlainText(nextText);
          editor.value = nextText;
        }
      } else if (lastMarkdownMode) {
        applyMode(lastMarkdownMode);
      }
      lastSavedText = nextText;
      historyPending = false;
      updatePreview(nextText);
      safeSetContent(panelId, buildContent(nextText, renderMode), {
        pushHistory
      });
    };

    const scheduleMathTypeset = createDebounce(() => {
      if (typeof window === 'undefined') return;
      const mathjax = window.MathJax;
      if (!mathjax) return;
      if (typeof mathjax.typesetPromise === 'function') {
        mathjax.typesetPromise([preview]).catch(() => {});
        return;
      }
      if (mathjax.Hub && typeof mathjax.Hub.Queue === 'function') {
        mathjax.Hub.Queue(['Typeset', mathjax.Hub, preview]);
      }
    }, 500);
    const updatePreview = (text) => {
      const trimmed = text.trim();
      preview.classList.toggle('is-empty', !trimmed);
      if (renderMode === 'plain') {
        preview.textContent = text;
        preview.classList.add('is-plain');
        return;
      }
      preview.classList.remove('is-plain');
      preview.innerHTML = renderMarkdown(text);
      if (trimmed && (text.includes('$') || text.includes('\\(') || text.includes('\\['))) {
        scheduleMathTypeset();
      }
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
      safeSetContent(panelId, buildContent(nextText, renderMode), {
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
      const nextRenderMode = resolveRenderMode(content);
      renderMode = nextRenderMode;
      wrapper.dataset.render = renderMode;
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
      if (renderMode === 'plain') {
        applyMode('edit');
      }
      if (wrapper.dataset.mode === 'edit' && document.activeElement !== editor) {
        editor.focus();
      }
    };

    const initialContent = safeGetContent(panelId) ?? panelState.content;
    refreshContent(initialContent);

    wrapper.dataset.render = renderMode;
    if (renderMode === 'plain') {
      applyMode('edit');
    } else {
      applyMode('split');
    }

    return {
      plotEl: null,
      refreshContent,
      getMode: () => wrapper.dataset.mode,
      setMode: (mode) => {
        if (renderMode === 'plain') {
          applyMode('edit');
          return;
        }
        applyMode(mode);
      },
      getRenderMode: () => renderMode,
      setRenderMode: (mode, options) => updateRenderMode(mode, options)
    };
  }
};
