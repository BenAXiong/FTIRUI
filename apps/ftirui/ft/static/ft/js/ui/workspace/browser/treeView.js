/**
 * Responsibility: Surface minimal browser-tree metadata for legacy DOM until full renderer lands.
 * Inputs: receives root element plus section ordering, panel mapping, and active panel id.
 * Outputs: stamps data attributes for downstream modules; leaves legacy markup untouched.
 * Never: never mutate PanelsModel directly, never call Plotly, never emit storage/history events.
 */
export function render({ rootEl, sections = [], panelsBySection = new Map(), activePanelId = null } = {}) {
  if (!rootEl) return;
  rootEl.dataset.browserSections = String(sections.length);
  rootEl.dataset.browserActivePanel = activePanelId || '';
  // Leave the legacy DOM intact for now; full rendering will arrive in later phases.
}
