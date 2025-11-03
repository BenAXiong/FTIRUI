/**
 * Responsibility: Expose a lightweight bridge so chip panels can mirror canvas selection state.
 * Inputs: accepts an optional highlighter callback registered by the runtime.
 * Outputs: forwards active panel ids to the highlighter when selection changes.
 * Never: never mutate PanelsModel or DOM, never call Plotly, never assume chip panel internals.
 */
let highlighter = null;
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
