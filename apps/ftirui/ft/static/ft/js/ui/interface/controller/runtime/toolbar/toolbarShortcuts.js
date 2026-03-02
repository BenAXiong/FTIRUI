const isEditableTarget = (target) => {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (typeof target.closest !== 'function') return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
};

const resolveDigit = (event) => {
  const code = event?.code || '';
  if (code.startsWith('Digit')) {
    const num = Number(code.slice(5));
    return Number.isNaN(num) ? null : num;
  }
  if (code.startsWith('Numpad')) {
    const num = Number(code.slice(6));
    return Number.isNaN(num) ? null : num;
  }
  const key = event?.key;
  if (typeof key === 'string' && key.length === 1 && key >= '0' && key <= '9') {
    return Number(key);
  }
  return null;
};

const resolveHistoryButtons = ({ undoButton, redoButton, documentRoot }) => {
  let undo = undoButton || null;
  let redo = redoButton || null;
  if ((!undo || !redo) && documentRoot && typeof documentRoot.getElementById === 'function') {
    undo = undo || documentRoot.getElementById('c_history_undo');
    redo = redo || documentRoot.getElementById('c_history_redo');
  }
  return { undo, redo };
};

const isShiftedDigitKey = (event) => {
  const code = event?.code || '';
  if (!code.startsWith('Digit')) return false;
  const key = event?.key;
  if (typeof key !== 'string' || key.length !== 1) return false;
  return '!@#$%^&*()'.includes(key);
};

const collectToolbarButtons = (toolbar) => {
  const result = { numbered: [], zero: null };
  if (!toolbar || typeof toolbar.querySelectorAll !== 'function') return result;
  const buttons = Array.from(toolbar.querySelectorAll('button.workspace-toolbar-btn'));
  buttons.forEach((button) => {
    if (!button || typeof button.closest !== 'function') return;
    if (button.closest('.dropdown-menu')) return;
    if (button.classList.contains('workspace-toolbar-btn-zero')) {
      result.zero = button;
      return;
    }
    if (button.classList.contains('workspace-toolbar-btn-no-counter')) return;
    result.numbered.push(button);
  });
  return result;
};

const resolveHistoryAction = (event) => {
  const key = typeof event?.key === 'string' ? event.key.toLowerCase() : '';
  const code = typeof event?.code === 'string' ? event.code : '';
  const hasCtrlOrMeta = !!(event?.ctrlKey || event?.metaKey);
  if (!hasCtrlOrMeta || event?.altKey) return null;
  if (key === 'z' || code === 'KeyZ') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (key === 'y' || code === 'KeyY') {
    return 'redo';
  }
  return null;
};

const resolveToolbarButton = (toolbar, digit) => {
  const { numbered, zero } = collectToolbarButtons(toolbar);
  if (digit === 0) return zero;
  if (!Number.isInteger(digit) || digit < 1) return null;
  return numbered[digit - 1] || null;
};

const isShortcutBlocked = (event) => {
  if (!event) return true;
  if (event.defaultPrevented || event.isComposing) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  return isEditableTarget(event.target);
};

export function createToolbarShortcutsController({
  topToolbar,
  verticalToolbar,
  undoButton,
  redoButton,
  documentRoot = typeof document !== 'undefined' ? document : null
} = {}) {
  if (!documentRoot || typeof documentRoot.addEventListener !== 'function') return null;
  const isReadonlyCanvas = () => documentRoot?.body?.dataset?.activeCanvasLocked === 'true';
  const historyButtons = resolveHistoryButtons({ undoButton, redoButton, documentRoot });
  const handler = (event) => {
    if (isReadonlyCanvas()) return;
    const historyAction = resolveHistoryAction(event);
    if (historyAction && !isEditableTarget(event.target)) {
      const historyButton = historyAction === 'undo' ? historyButtons.undo : historyButtons.redo;
      if (historyButton && !historyButton.disabled && historyButton.getAttribute('aria-disabled') !== 'true') {
        event.preventDefault();
        historyButton.click();
      }
      return;
    }
    const digit = resolveDigit(event);
    if (digit == null) return;
    if (isShortcutBlocked(event)) return;
    const wantsVertical = event.shiftKey || isShiftedDigitKey(event);
    const toolbar = wantsVertical ? verticalToolbar : topToolbar;
    if (!toolbar) return;
    const button = resolveToolbarButton(toolbar, digit);
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    button.click();
  };
  documentRoot.addEventListener('keydown', handler, true);
  return {
    teardown() {
      documentRoot.removeEventListener('keydown', handler, true);
    }
  };
}
