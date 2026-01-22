import { renderMarkdown } from '../../../../../utils/markdown.js';
import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const normalizePanelMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return {};
  const workspacePanel = meta.workspacePanel && typeof meta.workspacePanel === 'object'
    ? meta.workspacePanel
    : {};
  const nextPanel = {};
  if (typeof workspacePanel.editLocked === 'boolean') {
    nextPanel.editLocked = workspacePanel.editLocked;
  }
  if (typeof workspacePanel.pinned === 'boolean') {
    nextPanel.pinned = workspacePanel.pinned;
  }
  if (!Object.keys(nextPanel).length) return {};
  return { workspacePanel: nextPanel };
};

const buildContent = (text = '', renderMode = 'markdown', meta = {}) => ({
  kind: 'markdown',
  version: 1,
  data: { text, renderMode },
  meta: normalizePanelMeta(meta)
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

const MARKDOWN_GREEK = [
  '\u03b1', '\u03b2', '\u03b3', '\u03b4', '\u03b5', '\u03b6', '\u03b7', '\u03b8',
  '\u03b9', '\u03ba', '\u03bb', '\u03bc', '\u03bd', '\u03be', '\u03bf', '\u03c0',
  '\u03c1', '\u03c3', '\u03c4', '\u03c5', '\u03c6', '\u03c7', '\u03c8', '\u03c9',
  '\u0394', '\u039b', '\u03a0', '\u03a3', '\u03a6', '\u03a9'
];
const MARKDOWN_SYMBOLS = [
  '\u00b1', '\u00d7', '\u00b7', '\u2264', '\u2265', '\u221e', '\u2192', '\u2190',
  '\u2194', '\u21cc', '\u00b0', '\u00b5', '\u2126', '\u2191', '\u2193', '\u21d2'
];

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
    return buildContent(resolveText(value), resolveRenderMode(value), value?.meta);
  },
  serialize(value) {
    return buildContent(resolveText(value), resolveRenderMode(value), value?.meta);
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
    const meta = normalizePanelMeta(existing?.meta);
    return {
      content: buildContent(text, resolveRenderMode(existing), meta)
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
    let contentMeta = normalizePanelMeta(
      safeGetContent(panelId)?.meta ?? panelState.content?.meta
    );
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
      safeSetContent(panelId, buildContent(nextText, renderMode, contentMeta), {
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
      safeSetContent(panelId, buildContent(nextText, renderMode, contentMeta), {
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

    const insertAtCaret = (value) => {
      ensureEditorFocus();
      const start = Number.isFinite(editor.selectionStart) ? editor.selectionStart : editor.value.length;
      const end = Number.isFinite(editor.selectionEnd) ? editor.selectionEnd : start;
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(end);
      editor.value = `${before}${value}${after}`;
      const caret = start + value.length;
      editor.setSelectionRange(caret, caret);
      commitEditorValue();
    };

    const positionSymbolMenu = (menu, anchor) => {
      if (!menu || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vpW = window.innerWidth || document.documentElement.clientWidth;
      const vpH = window.innerHeight || document.documentElement.clientHeight;
      const previousDisplay = menu.style.display;
      menu.style.display = 'grid';
      const width = menu.offsetWidth || 180;
      const height = menu.offsetHeight || 120;
      let left = rect.left + (rect.width / 2) - (width / 2);
      let top = rect.top - height - 6;
      if (top < 8) {
        top = rect.bottom + 6;
      }
      if (left + width > vpW - 8) {
        left = Math.max(8, vpW - width - 8);
      }
      if (top + height > vpH - 8) {
        top = Math.max(8, vpH - height - 8);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.display = previousDisplay;
    };

    const attachSymbolMenu = (group, menuKey) => {
      if (!group || typeof document === 'undefined') return;
      const menu = group.querySelector(`[data-menu="${menuKey}"]`);
      if (!menu) return;
      menu.classList.add('trace-name-toolbar-menu-floating');
      menu.setAttribute('draggable', 'false');
      menu.querySelectorAll('.trace-name-toolbar-symbol').forEach((btn) => {
        btn.setAttribute('draggable', 'false');
      });
      const anchor = group.querySelector('[data-action]');
      let hideTimer = null;
      let pinnedOpen = false;
      let docListener = null;

      const clearHideTimer = () => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      };

      const setDocListener = (enabled) => {
        if (!enabled && docListener) {
          document.removeEventListener('pointerdown', docListener, true);
          docListener = null;
          return;
        }
        if (enabled && !docListener) {
          docListener = (event) => {
            if (!pinnedOpen) return;
            if (menu.contains(event.target) || anchor?.contains(event.target)) return;
            hide(true);
          };
          document.addEventListener('pointerdown', docListener, true);
        }
      };

      const show = (pinned = false) => {
        clearHideTimer();
        if (!menu.isConnected || menu.parentElement !== document.body) {
          document.body.appendChild(menu);
        }
        positionSymbolMenu(menu, anchor);
        menu.style.display = 'grid';
        if (pinned) {
          pinnedOpen = true;
          anchor?.classList.add('is-open');
          setDocListener(true);
        }
      };

      const hide = (force = false) => {
        if (!force && pinnedOpen) return;
        pinnedOpen = false;
        anchor?.classList.remove('is-open');
        menu.style.display = 'none';
        if (menu.parentElement !== group) {
          group.appendChild(menu);
        }
        setDocListener(false);
      };

      group.addEventListener('pointerenter', () => show(false));
      group.addEventListener('pointerleave', (event) => {
        if (pinnedOpen) return;
        if (!menu.contains(event.relatedTarget)) {
          clearHideTimer();
          hideTimer = setTimeout(() => hide(false), 180);
        }
      });
      group.addEventListener('focusin', () => show(false));
      group.addEventListener('focusout', (event) => {
        if (pinnedOpen) return;
        if (!menu.contains(event.relatedTarget)) {
          clearHideTimer();
          hideTimer = setTimeout(() => hide(false), 180);
        }
      });
      anchor?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pinnedOpen) {
          hide(true);
          return;
        }
        show(true);
      });
      menu.addEventListener('pointerleave', (event) => {
        if (pinnedOpen) return;
        if (!group.contains(event.relatedTarget)) {
          clearHideTimer();
          hideTimer = setTimeout(() => hide(false), 180);
        }
      });
      menu.addEventListener('pointerenter', () => clearHideTimer());
      menu.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      menu.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      menu.addEventListener('dragstart', (event) => event.preventDefault());
      menu.addEventListener('click', (event) => {
        const insertBtn = event.target.closest('[data-insert]');
        if (!insertBtn) return;
        event.preventDefault();
        event.stopPropagation();
        insertAtCaret(insertBtn.dataset.insert || '');
        if (!pinnedOpen) {
          hide(true);
        }
      });
      menu.style.display = 'none';
    };

    const formattingActions = [
      { id: 'h1', label: 'H1', title: 'Heading 1', handler: () => insertHeading(1) },
      { id: 'h2', label: 'H2', title: 'Heading 2', handler: () => insertHeading(2) },
      { id: 'h3', label: 'H3', title: 'Heading 3', handler: () => insertHeading(3) },
      { id: 'bold', label: 'B', title: 'Bold', handler: () => wrapSelection({ before: '**', after: '**', placeholder: 'bold text' }) },
        { id: 'italic', label: 'I', title: 'Italic', handler: () => wrapSelection({ before: '*', after: '*', placeholder: 'italic text' }) },
        { id: 'underline', label: 'U', title: 'Underline', handler: () => wrapSelection({ before: '<u>', after: '</u>', placeholder: 'underlined' }) },
        { id: 'strike', label: 'S', title: 'Strikethrough', handler: () => wrapSelection({ before: '~~', after: '~~', placeholder: 'strike' }) },
        { id: 'sub', label: 'x₂', title: 'Subscript', handler: () => wrapSelection({ before: '<sub>', after: '</sub>', placeholder: 'sub' }) },
        { id: 'sup', label: 'x²', title: 'Superscript', handler: () => wrapSelection({ before: '<sup>', after: '</sup>', placeholder: 'sup' }) }
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

    const buildSymbolGroup = ({ key, label, title, symbols }) => {
      const group = document.createElement('div');
      group.className = 'trace-name-toolbar-group workspace-markdown-symbol-group';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm workspace-markdown-format-btn workspace-markdown-symbol-toggle';
      btn.dataset.action = key;
      btn.title = title;
      btn.textContent = label;
      const menu = document.createElement('div');
      menu.className = 'trace-name-toolbar-menu';
      menu.dataset.menu = key;
      symbols.forEach((symbol) => {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'trace-name-toolbar-symbol';
        entry.dataset.insert = symbol;
        entry.textContent = symbol;
        menu.appendChild(entry);
      });
      group.appendChild(btn);
      group.appendChild(menu);
      toolbarActions.appendChild(group);
      attachSymbolMenu(group, key);
    };

    buildSymbolGroup({
      key: 'greek',
      label: 'α',
      title: 'Greek letters',
      symbols: MARKDOWN_GREEK
    });
    buildSymbolGroup({
      key: 'symbols',
      label: '±',
      title: 'Symbols',
      symbols: MARKDOWN_SYMBOLS
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
      contentMeta = normalizePanelMeta(content?.meta);
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
