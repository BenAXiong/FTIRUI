const NOTE_HTML_KEY = 'sidebarNotesHtml';

const cloneDeep = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const debounce = (fn, delay = 320) => {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  wrapped.flush = (...args) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
};

const sanitizeHtml = (documentRoot, rawHtml = '') => {
  const template = documentRoot.createElement('template');
  template.innerHTML = typeof rawHtml === 'string' ? rawHtml : '';
  const allowed = new Set(['strong', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li', 'span', 'b', 'i', 'code', 's']);

  const normalizeNode = (node) => {
    const children = Array.from(node.childNodes || []);
    children.forEach((child) => normalizeNode(child));
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      node.remove();
      return;
    }
    if (!allowed.has(tag)) {
      const fragment = documentRoot.createDocumentFragment();
      while (node.firstChild) fragment.appendChild(node.firstChild);
      node.replaceWith(fragment);
      return;
    }
    if (tag === 'b') {
      const replacement = documentRoot.createElement('strong');
      replacement.innerHTML = node.innerHTML;
      node.replaceWith(replacement);
      return;
    }
    if (tag === 'i') {
      const replacement = documentRoot.createElement('em');
      replacement.innerHTML = node.innerHTML;
      node.replaceWith(replacement);
      return;
    }
    Array.from(node.attributes || []).forEach((attr) => {
      node.removeAttribute(attr.name);
    });
  };

  normalizeNode(template.content);
  return template.innerHTML.trim();
};

const MARKDOWN_INLINE_PATTERN = /(\*\*(\S(?:[^*\n]*\S)?)\*\*|__(\S(?:[^_\n]*\S)?)__|~~(\S(?:[^~\n]*\S)?)~~|`([^`\n]+)`|\*(\S(?:[^*\n]*\S)?)\*|_(\S(?:[^_\n]*\S)?)_)/g;

const stripInlineMarkdown = (value = '') => String(value || '')
  .replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '$1')
  .replace(/__(\S(?:[^_\n]*\S)?)__/g, '$1')
  .replace(/~~(\S(?:[^~\n]*\S)?)~~/g, '$1')
  .replace(/`([^`\n]+)`/g, '$1')
  .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '$1')
  .replace(/_(\S(?:[^_\n]*\S)?)_/g, '$1');

const applyInlineMarkdown = (documentRoot, rootNode) => {
  if (!rootNode) return;
  const nodeFilter = documentRoot.defaultView?.NodeFilter || globalThis.NodeFilter;
  if (!nodeFilter) return;
  const textNodes = [];
  const walker = documentRoot.createTreeWalker(rootNode, nodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (!current?.nodeValue || !/[`_*~]/.test(current.nodeValue)) continue;
    if (current.parentElement?.closest?.('code, strong, em, s')) continue;
    textNodes.push(current);
  }
  textNodes.forEach((textNode) => {
    const source = textNode.nodeValue || '';
    const pattern = MARKDOWN_INLINE_PATTERN;
    let cursor = 0;
    let match = null;
    let touched = false;
    const fragment = documentRoot.createDocumentFragment();
    while ((match = pattern.exec(source)) !== null) {
      const [full, strongA, strongB, strikeText, codeText, italicA, italicB] = match;
      const start = match.index;
      if (start > cursor) {
        fragment.appendChild(documentRoot.createTextNode(source.slice(cursor, start)));
      }
      const token = strongA || strongB || strikeText || codeText || italicA || italicB;
      if (token) {
        let nextNode = null;
        if (strongA || strongB) {
          nextNode = documentRoot.createElement('strong');
        } else if (strikeText) {
          nextNode = documentRoot.createElement('s');
        } else if (codeText) {
          nextNode = documentRoot.createElement('code');
        } else {
          nextNode = documentRoot.createElement('em');
        }
        nextNode.textContent = token;
        fragment.appendChild(nextNode);
        touched = true;
      } else {
        fragment.appendChild(documentRoot.createTextNode(full));
      }
      cursor = start + full.length;
    }
    if (!touched) return;
    if (cursor < source.length) {
      fragment.appendChild(documentRoot.createTextNode(source.slice(cursor)));
    }
    textNode.replaceWith(fragment);
  });
};

const getCaretPlainOffset = (documentRoot, rootNode) => {
  const selection = documentRoot.getSelection?.();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!rootNode.contains(range.startContainer) || !rootNode.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(rootNode);
  before.setEnd(range.endContainer, range.endOffset);
  return stripInlineMarkdown(before.toString()).length;
};

const restoreCaretByPlainOffset = (documentRoot, rootNode, plainOffset) => {
  if (!Number.isFinite(plainOffset) || plainOffset < 0) return;
  const selection = documentRoot.getSelection?.();
  if (!selection) return;
  const nodeFilter = documentRoot.defaultView?.NodeFilter || globalThis.NodeFilter;
  if (!nodeFilter) return;
  const walker = documentRoot.createTreeWalker(rootNode, nodeFilter.SHOW_TEXT);
  let remaining = plainOffset;
  let targetNode = null;
  let targetOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const size = node?.nodeValue?.length || 0;
    if (remaining <= size) {
      targetNode = node;
      targetOffset = remaining;
      break;
    }
    remaining -= size;
    targetNode = node;
    targetOffset = size;
  }
  const range = documentRoot.createRange();
  if (targetNode) {
    range.setStart(targetNode, targetOffset);
  } else {
    range.selectNodeContents(rootNode);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const readNoteHtml = (figure) => {
  const value = figure?.layout?.meta?.workspacePanel?.[NOTE_HTML_KEY];
  return typeof value === 'string' ? value : '';
};

const writeNoteHtml = (figure, noteHtml) => {
  const next = cloneDeep(figure || { data: [], layout: {} }) || { data: [], layout: {} };
  next.layout = next.layout && typeof next.layout === 'object' ? next.layout : {};
  next.layout.meta = next.layout.meta && typeof next.layout.meta === 'object' ? next.layout.meta : {};
  const workspacePanel = next.layout.meta.workspacePanel && typeof next.layout.meta.workspacePanel === 'object'
    ? next.layout.meta.workspacePanel
    : {};
  workspacePanel[NOTE_HTML_KEY] = noteHtml || '';
  next.layout.meta.workspacePanel = workspacePanel;
  return next;
};

export function createPanelNotesTabController({
  dom = {},
  selectors = {},
  actions = {}
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  if (!documentRoot) return null;

  const getPanelRecord = typeof selectors.getPanelRecord === 'function'
    ? selectors.getPanelRecord
    : () => null;
  const getPanelFigure = typeof selectors.getPanelFigure === 'function'
    ? selectors.getPanelFigure
    : () => ({ data: [], layout: {} });
  const panelSupportsPlot = typeof selectors.panelSupportsPlot === 'function'
    ? selectors.panelSupportsPlot
    : () => true;
  const updatePanelFigure = typeof actions.updatePanelFigure === 'function'
    ? actions.updatePanelFigure
    : () => {};
  const persist = typeof actions.persist === 'function'
    ? actions.persist
    : () => {};
  const pushHistory = typeof actions.pushHistory === 'function'
    ? actions.pushHistory
    : () => {};

  const menu = documentRoot.createElement('div');
  menu.className = 'workspace-tech-panel-data-menu workspace-tech-panel-notes-menu';
  const notesHeader = documentRoot.createElement('div');
  notesHeader.className = 'workspace-tech-panel-notes-header';
  const notesTitle = documentRoot.createElement('div');
  notesTitle.className = 'workspace-tech-panel-notes-title';
  const notesMeta = documentRoot.createElement('div');
  notesMeta.className = 'workspace-tech-panel-notes-meta';
  notesHeader.appendChild(notesTitle);
  notesHeader.appendChild(notesMeta);

  const toolbar = documentRoot.createElement('div');
  toolbar.className = 'workspace-tech-panel-notes-toolbar';
  const editor = documentRoot.createElement('div');
  editor.className = 'workspace-tech-panel-notes-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.dataset.placeholder = 'Write notes for this graph. Markdown: **bold**, *italic*, `code`, ~~strike~~.';

  const empty = documentRoot.createElement('div');
  empty.className = 'workspace-tech-panel-live-empty';
  empty.hidden = true;

  menu.appendChild(notesHeader);
  menu.appendChild(toolbar);
  menu.appendChild(editor);
  menu.appendChild(empty);

  let activePanelId = null;
  let currentHtml = '';
  let dirty = false;
  let muted = false;

  const commit = (push = false) => {
    if (!activePanelId || !panelSupportsPlot(activePanelId)) return;
    const working = documentRoot.createElement('template');
    working.innerHTML = editor.innerHTML || '';
    applyInlineMarkdown(documentRoot, working.content);
    const sanitized = sanitizeHtml(documentRoot, working.innerHTML);
    if (!dirty && sanitized === currentHtml) return;
    if (documentRoot.activeElement !== editor) {
      muted = true;
      editor.innerHTML = sanitized;
      muted = false;
    }
    const figure = getPanelFigure(activePanelId) || { data: [], layout: {} };
    const previous = readNoteHtml(figure);
    if (previous === sanitized && !dirty) return;
    const nextFigure = writeNoteHtml(figure, sanitized);
    updatePanelFigure(activePanelId, nextFigure);
    currentHtml = sanitized;
    dirty = false;
    if (push) {
      pushHistory({ label: 'Edit graph notes' });
    }
    persist();
  };

  const debouncedCommit = debounce(() => commit(false), 360);

  const renderEmpty = (message) => {
    notesTitle.textContent = 'Notes';
    notesMeta.textContent = '';
    notesMeta.hidden = true;
    toolbar.hidden = true;
    editor.hidden = true;
    empty.hidden = false;
    empty.textContent = message;
  };

  const renderActive = () => {
    const panelId = activePanelId;
    if (!panelId) {
      renderEmpty('Select a graph to attach notes.');
      return;
    }
    if (!panelSupportsPlot(panelId)) {
      renderEmpty('Notes are available for graph panels only.');
      return;
    }
    const record = getPanelRecord(panelId);
    const title = typeof record?.title === 'string' && record.title.trim()
      ? record.title.trim()
      : 'Graph';
    notesTitle.textContent = title;
    notesMeta.textContent = '';
    notesMeta.hidden = true;
    toolbar.hidden = false;
    editor.hidden = false;
    empty.hidden = true;
    if (dirty && documentRoot.activeElement === editor) return;
    const html = sanitizeHtml(documentRoot, readNoteHtml(getPanelFigure(panelId)));
    muted = true;
    editor.innerHTML = html;
    muted = false;
    currentHtml = html;
    dirty = false;
  };

  const makeButton = (iconClass, title, command, commandValue = null) => {
    const button = documentRoot.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-secondary workspace-tech-panel-notes-btn';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<i class="bi ${iconClass}" aria-hidden="true"></i>`;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      editor.focus();
      documentRoot.execCommand?.(command, false, commandValue);
      dirty = true;
      debouncedCommit();
    });
    return button;
  };

  toolbar.appendChild(makeButton('bi-type-bold', 'Bold', 'bold'));
  toolbar.appendChild(makeButton('bi-type-italic', 'Italic', 'italic'));
  toolbar.appendChild(makeButton('bi-type-underline', 'Underline', 'underline'));
  toolbar.appendChild(makeButton('bi-list-ul', 'Bulleted list', 'insertUnorderedList'));

  editor.addEventListener('input', () => {
    if (muted) return;
    const caretOffset = getCaretPlainOffset(documentRoot, editor);
    const before = editor.innerHTML;
    muted = true;
    applyInlineMarkdown(documentRoot, editor);
    const changed = editor.innerHTML !== before;
    if (changed) {
      restoreCaretByPlainOffset(documentRoot, editor, caretOffset);
    }
    muted = false;
    dirty = true;
    debouncedCommit();
  });
  editor.addEventListener('blur', () => {
    if (!dirty) return;
    debouncedCommit.flush();
    commit(true);
  });

  return {
    getMenu() {
      return menu;
    },
    handleActivePanelChange(panelId) {
      if (activePanelId !== panelId && dirty) {
        debouncedCommit.flush();
        commit(false);
      }
      activePanelId = panelId || null;
      renderActive();
    },
    handlePanelUpdated(panelId) {
      if (!panelId || panelId !== activePanelId) return;
      renderActive();
    },
    teardown() {
      debouncedCommit.cancel();
      menu.remove();
      activePanelId = null;
      currentHtml = '';
      dirty = false;
    }
  };
}
