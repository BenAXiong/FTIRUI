/**
 * Minimal tree renderer facade.
 * Future phases will replace the legacy browser markup with this output.
 * For now we only tag the root so downstream modules can detect readiness.
 */
export function render({ rootEl, sections = [], panelsBySection = new Map(), activePanelId = null } = {}) {
  if (!rootEl) return;
  rootEl.dataset.browserSections = String(sections.length);
  rootEl.dataset.browserActivePanel = activePanelId || '';
  // Leave the legacy DOM intact for now; full rendering will arrive in later phases.
}
