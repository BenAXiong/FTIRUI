let highlighter = null;

/**
 * Registers an optional highlighter callback supplied by the canvas.
 * The callback receives the active panel id whenever selection changes.
 */
export function registerHighlighter(fn) {
  highlighter = typeof fn === 'function' ? fn : null;
}

/**
 * Bridge hook invoked when a panel is selected in the browser tree.
 * If a highlighter has been registered, we forward the panel id.
 */
export function onPanelSelected(panelId) {
  if (!highlighter) return;
  try {
    highlighter(panelId);
  } catch (err) {
    console.error('[chipPanelsBridge] highlighter error', err);
  }
}
