/**
 * Responsibility: Orchestrate workspace canvas behaviour by coordinating models, plotting, browser UI, storage, and history.
 * Inputs: expects DOM root handles, optional debug flags, and imported facades (models, storage, history, browser bridges).
 * Outputs: mutates DOM and models as side effects and returns a runtime API for the controller (render, focus, lifecycle handlers).
 * Never: never invoke Plotly directly (delegate to Render facade), never mutate panel data outside the PanelsModel API, never attach global listeners that are not exposed through the returned handlers.
 */
import { fetchDemoFiles } from '../../../../services/demos.js';
import { uploadTraceFile } from '../../../../services/uploads.js';
import { fetchCanvasState, saveCanvasState } from '../../../../services/dashboard.js';
import { createChipPanels } from '../../chipPanels.js';
import { createPanelsModel } from '../../../../workspace/canvas/state/panelsModel.js';
import { applyLineChip } from '../../../utils/styling_linechip.js';
import { toHexColor } from '../../../utils/styling.js';
import * as storage from '../../../../core/storage.js';
import { createHistory } from '../../../../core/history.js';
import * as chipPanelsBridge from '../../../workspace/browser/chipPanelsBridge.js';

import * as Actions from '../../../../workspace/canvas/plotting/actionsController.js';
import { createBrowserFacade } from './browser/facade.js';
import { createPersistenceFacade } from './persistence/facade.js';
import { createPanelsFacade } from './panels/facade.js';
import { createPanelDomFacade } from './panels/panelDomFacade.js';
import { createStylePainterController } from './panels/stylePainterController.js';
import { createTemplatesController } from './panels/templatesController.js';
import { createPanelLockController } from './panels/panelLockController.js';
import { createUnitsToggleController } from './panels/unitsToggleController.js';
import { createMultiTraceController } from './panels/multiTraceController.js';
import { registerPanelType, getPanelType } from './panels/registry/index.js';
import { plotPanelType } from './panels/registry/plotPanel.js';
import { markdownPanelType } from './panels/registry/markdownPanel.js';
import { spreadsheetPanelType } from './panels/registry/spreadsheetPanel.js';
import { imagePanelType } from './panels/registry/imagePanel.js';
import { createHeaderActions } from './panels/headerActions.js';
import { createPlotFacade } from './panels/plotFacade.js';
import { createPlotRelayoutHandler } from './panels/plotRelayoutPersistence.js';
import { createSnapshotManager } from './state/snapshotManager.js';
import { createHistoryHelpers } from './state/historyHelpers.js';
import { createColorCursorManager } from './state/colorCursorManager.js';
import { createPanelPreferencesManager } from './state/panelPreferencesManager.js';
import { createPanelInteractions } from './panels/panelInteractions.js';
import { createIoFacade } from './io/facade.js';
import { createRuntimeState } from './context/runtimeState.js';
import { createUiPreferencesFacade } from './preferences/facade.js';
import { initCanvasSnapshots } from '../../canvasSnapshots.js';
import { createSectionManager } from './sections/manager.js';
import { createHudButtons } from './controls/createHudButtons.js';
import { createGlobalCommandsController } from './toolbar/globalCommands.js';
import { createToolbarShortcutsController } from './toolbar/toolbarShortcuts.js';
import { createTechToolbarLabelController } from './toolbar/techToolbarLabels.js';
import { createTechToolbarHoverController } from './toolbar/techToolbarHoverController.js';
import { createTechToolbarPinController } from './toolbar/techToolbarPinController.js';
import { createTechToolbarHeaderVisibilityController } from './toolbar/techToolbarHeaderVisibilityController.js';
import { createTechToolbarModebarVisibilityController } from './toolbar/techToolbarModebarVisibilityController.js';
import { registerTechPlaceholderHandlers } from './toolbar/techToolbarHandlers.js';
import { createPeakDefaultsController } from './peaks/peakDefaultsController.js';
import { createZipBuilder } from '../../../utils/zipBuilder.js';
import { findPeaks, buildPeakOverlays, buildPeakTableRows, DEFAULT_PEAK_OPTIONS } from '../../../../workspace/canvas/analysis/peakDetection.js';

registerPanelType(plotPanelType);
registerPanelType(markdownPanelType);
registerPanelType(spreadsheetPanelType);
registerPanelType(imagePanelType);

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;
  const TRACE_PALETTE_ROWS = [
    {
      id: 'spectrum',
      label: 'Spectrum',
      icon: 'bi-palette-fill',
      colors: [
        '#fa3c3c', '#f08228', '#e6dc32', '#00dc00', '#00d28c',
        '#00c8c8', '#00a0ff', '#1e3cff', '#6e00dc', '#a000c8'
      ]
    },
  {
    id: 'earth-alloy',
    label: 'Earth & Alloy',
    icon: 'bi-gem',
    colors: [
      '#78350f', '#a16207', '#ca8a04', '#d97706', '#fbbf24',
      '#4b5563', '#64748b', '#94a3b8', '#cbd5f5', '#e2e8f0'
    ]
  },
  {
    id: 'aurora-drift',
    label: 'Aurora Drift',
    icon: 'bi-moon-stars-fill',
    colors: [
      '#10b981', '#14b8a6', '#22d3ee', '#38bdf8', '#6366f1',
      '#8b5cf6', '#c084fc', '#f472b6', '#fb7185', '#facc15'
    ]
  }
];
  const TRACE_PALETTE_DEFAULT = TRACE_PALETTE_ROWS.flatMap((row) => row.colors);
let activeTracePalette = TRACE_PALETTE_DEFAULT.slice();

const ONE_CLICK_VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workspace bundle</title>
  <link rel="stylesheet" href="viewer.css">
</head>
<body>
  <header class="bundle-header">
    <div>
      <p class="bundle-kicker">FTIR-UI workspace bundle</p>
      <h1 id="bundle-title">Workspace bundle</h1>
      <p id="bundle-project" class="bundle-project"></p>
      <p id="bundle-status" class="bundle-meta">Loading metadata…</p>
    </div>
    <a class="bundle-download" href="snapshot.json" download>Download snapshot</a>
  </header>
  <main class="bundle-main">
    <section>
      <h2>Panels</h2>
      <div id="bundle-panels" class="bundle-panels"></div>
    </section>
    <section class="bundle-note">
      <h2>Reopen in FTIR-UI</h2>
      <ol>
        <li>Launch FTIR-UI.</li>
        <li>Use Global command #9 → “Back-up project”.</li>
        <li>Select <strong>snapshot.json</strong> from this bundle.</li>
      </ol>
    </section>
  </main>
  <footer class="bundle-footer">
    <p>Generated by FTIR-UI. This viewer is read-only.</p>
  </footer>
  <script src="viewer.js"></script>
</body>
</html>`;

const ONE_CLICK_VIEWER_CSS = `:root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
  background-color: #f5f7fb;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-height: 100vh;
  background: #f5f7fb;
  color: #0f172a;
}
.bundle-header {
  background: #111827;
  color: #f8fafc;
  padding: 2.5rem clamp(1.5rem, 5vw, 4rem);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.bundle-kicker {
  text-transform: uppercase;
  font-size: .75rem;
  letter-spacing: .08em;
  margin: 0 0 .5rem;
  opacity: .75;
}
.bundle-header h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.8rem);
}
.bundle-project,
.bundle-meta {
  margin: .35rem 0 0;
  opacity: .85;
}
.bundle-download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .65rem 1.25rem;
  background: #fef3c7;
  color: #9a3412;
  font-weight: 600;
  border-radius: 999px;
  text-decoration: none;
  border: 1px solid rgba(255,255,255,.4);
}
.bundle-main {
  padding: clamp(1.5rem, 4vw, 3rem);
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.bundle-main h2 {
  margin-top: 0;
}
.bundle-panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.bundle-panel {
  background: #fff;
  border-radius: 1rem;
  padding: 1rem;
  border: 1px solid rgba(15,23,42,.08);
  box-shadow: 0 8px 18px rgba(15,23,42,.08);
  display: flex;
  flex-direction: column;
  gap: .35rem;
}
.bundle-panel h3 {
  margin: 0;
  font-size: 1rem;
}
.bundle-panel-meta {
  margin: 0;
  font-size: .85rem;
  color: rgba(15,23,42,.8);
}
.bundle-panel-preview {
  margin: .25rem 0 0;
  font-size: .85rem;
  color: rgba(15,23,42,.7);
}
.bundle-note {
  background: #111827;
  color: #f8fafc;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 24px rgba(15,23,42,.35);
}
.bundle-note h2 {
  margin-top: 0;
}
.bundle-footer {
  padding: 1.5rem;
  font-size: .85rem;
  text-align: center;
  color: rgba(15,23,42,.65);
}
.bundle-empty {
  color: rgba(15,23,42,.6);
  font-style: italic;
}
@media (prefers-color-scheme: dark) {
  body {
    background: #020617;
    color: #e2e8f0;
  }
  .bundle-main {
    background: #020617;
  }
  .bundle-panel {
    background: #0f172a;
    border-color: rgba(226,232,240,.08);
    box-shadow: 0 8px 18px rgba(2,6,23,.8);
  }
  .bundle-note {
    background: #0b1120;
  }
  .bundle-footer {
    color: rgba(226,232,240,.7);
  }
}`;

const ONE_CLICK_VIEWER_JS = `(() => {
  const statusEl = document.getElementById('bundle-status');
  const projectEl = document.getElementById('bundle-project');
  const panelsEl = document.getElementById('bundle-panels');

  const formatPanelType = (panel) => {
    if (panel.typeLabel) return panel.typeLabel;
    if (!panel.type) return 'Panel';
    return panel.type.charAt(0).toUpperCase() + panel.type.slice(1);
  };

  const createPanelCard = (panel) => {
    const card = document.createElement('article');
    card.className = 'bundle-panel';
    const title = document.createElement('h3');
    title.textContent = panel.title || formatPanelType(panel);
    card.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'bundle-panel-meta';
    const details = [];
    details.push(formatPanelType(panel));
    if (typeof panel.traces === 'number') {
      details.push(panel.traces === 1 ? '1 trace' : panel.traces + ' traces');
    }
    if (panel.sectionName) {
      details.push('Section: ' + panel.sectionName);
    }
    meta.textContent = details.join(' • ');
    card.appendChild(meta);
    if (panel.preview) {
      const preview = document.createElement('p');
      preview.className = 'bundle-panel-preview';
      preview.textContent = panel.preview;
      card.appendChild(preview);
    }
    return card;
  };

  const renderPanels = (metadata) => {
    panelsEl.innerHTML = '';
    if (!Array.isArray(metadata.panelSummaries) || !metadata.panelSummaries.length) {
      const empty = document.createElement('p');
      empty.className = 'bundle-empty';
      empty.textContent = 'This bundle does not contain any panels.';
      panelsEl.appendChild(empty);
      return;
    }
    metadata.panelSummaries.forEach((panel) => {
      panelsEl.appendChild(createPanelCard(panel));
    });
  };

  const loadMetadata = async () => {
    const response = await fetch('metadata.json');
    if (!response.ok) {
      throw new Error('Failed to load metadata.json');
    }
    return response.json();
  };

  const init = async () => {
    try {
      const metadata = await loadMetadata();
      const generated = metadata.generatedAt ? new Date(metadata.generatedAt) : null;
      statusEl.textContent = generated ? generated.toLocaleString() : 'Bundle ready';
      if (metadata.workspaceTitle) {
        projectEl.textContent = metadata.workspaceTitle;
      } else {
        projectEl.textContent = '';
      }
      renderPanels(metadata);
    } catch (error) {
      statusEl.textContent = 'Unable to load bundle metadata.';
      console.error(error);
    }
  };

  init();
})();`;
const getTraceColorByIndex = (index = 0) => {
  const palette = activeTracePalette.length ? activeTracePalette : TRACE_PALETTE_DEFAULT;
  const safeLength = Math.max(palette.length, 1);
  const normalized = ((index % safeLength) + safeLength) % safeLength;
  return palette[normalized] || '#1f77b4';
};
const getFallbackTraceColor = () => getTraceColorByIndex(0);
const HISTORY_LIMIT = 25;
const HISTORY_GEOMETRY_TOLERANCE = 2;
const PANEL_COLLAPSE_KEY = 'ftir.workspace.panelCollapsed.v1';
const PANEL_PIN_KEY = 'ftir.workspace.panelPinned.v1';

const DEFAULT_SECTION_ID = 'section_all';
const TRACE_DRAG_MIME = 'application/x-ftir-workspace-trace';
const MIN_BROWSER_HOTSPOT_WIDTH = 24;
const WORKSPACE_BROWSER_TOP_VH = 12;
const WORKSPACE_BROWSER_BOTTOM_VH = 92;
const MIN_BROWSER_VISIBLE_HEIGHT = 24;
const OPERATIONS_LOG_LIMIT = 100;
const operationsLog = [];
let operationsPanelHandles = null;
let operationsToggleButton = null;
let operationsVisible = false;
let operationsRenderQueued = false;
let devToggleButton = null;
let cdpToggleButton = null;
let ghostToggleButton = null;
let hudButtonsHandles = null;
let cdpPanelEl = null;
let cdpVisible = false;
let ghostModeEnabled = false;
let cdpModeEnabled = false;
let alignIncludeAllToggle = null;
let devModeEnabled =
  typeof document !== 'undefined' ? document.body?.dataset?.workspaceDev === 'true' : false;
let operationSequence = 0;
const colorCursorManager = createColorCursorManager();
let panelPreferences = null;

const sectionManager = createSectionManager({ defaultSectionId: DEFAULT_SECTION_ID });
const sections = sectionManager.getMap();
const normalizeSectionName = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const findSectionByName = (name, parentId = null) => {
  const normalizedName = normalizeSectionName(name);
  if (!normalizedName) return null;
  let match = null;
  sections.forEach((section) => {
    if (match) return;
    const currentParent = section.parentId || null;
    if (currentParent !== (parentId || null)) return;
    if (normalizeSectionName(section.name) === normalizedName) {
      match = section;
    }
  });
  return match;
};
let chipPanelsInstance = null;
let dragState = null;
let currentDropTarget = null;
let pendingRenameSectionId = null;
let activePanelId = null;
let peakMarkingController = null;
let browserFacade = null;
let persistence = null;
let history = null;
let persist = () => {};
let suppressRemoteSyncOnce = false;
let pushHistory = () => {};
let undo = () => {};
let redo = () => {};
let updateHistoryButtons = () => {};
let updateStorageButtons = () => {};
let saveWorkspaceSnapshot = () => {};
let loadWorkspaceSnapshot = () => {};
let clearWorkspaceSnapshot = () => {};
let preferencesFacade = null;
let remoteSyncTimer = null;
let userStatusHandler = null;
const REMOTE_SYNC_DELAY_MS = 5000;

const getActiveCanvasIdFromContext = () => {
  if (typeof document !== 'undefined') {
    const dataset = document.body?.dataset || {};
    if (dataset.activeCanvasId) {
      return dataset.activeCanvasId;
    }
    if (dataset.requestedCanvasId) {
      return dataset.requestedCanvasId;
    }
  }
  if (typeof window !== 'undefined') {
    if (window.__ACTIVE_CANVAS_ID) return window.__ACTIVE_CANVAS_ID;
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('canvas');
      if (id) return id;
    } catch {
      /* ignore */
    }
  }
  return null;
};

const readBodyDatasetValue = (key) => {
  if (typeof document === 'undefined' || !document.body || !document.body.dataset) {
    return null;
  }
  return document.body.dataset[key] ?? null;
};

const readDatasetBool = (value) => {
  if (typeof value !== 'string') return false;
  return value === 'true' || value === '1';
};

const setDropTarget = (element) => {
  if (currentDropTarget === element) return;
  if (currentDropTarget) {
    currentDropTarget.classList.remove('is-drop-target');
  }
  currentDropTarget = element || null;
  if (currentDropTarget) {
    currentDropTarget.classList.add('is-drop-target');
  }
};

const getDragState = () => dragState;
const setDragState = (next) => {
  dragState = next;
};
const getActivePanelId = () => activePanelId;

const allocateTraceColor = () => {
  const current = colorCursorManager.get();
  const color = getTraceColorByIndex(current);
  colorCursorManager.increment();
  return { color, index: current };
};

const pickColor = () => allocateTraceColor().color;

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const CANVAS_BACKGROUND_SWATCHES = [
  { id: 'canvas-midnight', label: 'Midnight', color: '#0b1120' },
  { id: 'canvas-slate', label: 'Slate', color: '#131c2b' },
  { id: 'canvas-paper', label: 'Paper', color: '#f8fafc' }
];
const PANEL_CHROME_SWATCHES = [
  { id: 'chrome-graphite', label: 'Graphite', color: '#1f2937' },
  { id: 'chrome-navy', label: 'Navy', color: '#0f172a' },
  { id: 'chrome-ash', label: 'Ash', color: '#374151' },
  { id: 'chrome-sand', label: 'Sand', color: '#f5f5f4' },
  { id: 'chrome-porcelain', label: 'Porcelain', color: '#e2e8f0' },
  { id: 'chrome-gradient-aurora', label: 'Aurora', color: '#4f46e5', preview: 'linear-gradient(135deg,#4f46e5,#06b6d4)' },
  { id: 'chrome-gradient-solar', label: 'Solar', color: '#f97316', preview: 'linear-gradient(135deg,#f97316,#fde047)' },
  { id: 'chrome-gradient-boreal', label: 'Boreal', color: '#0ea5e9', preview: 'linear-gradient(135deg,#0ea5e9,#22d3ee)' },
  { id: 'chrome-gradient-plasma', label: 'Plasma', color: '#ec4899', preview: 'linear-gradient(135deg,#ec4899,#c084fc)' }
];
const PANEL_CHROME_HISTORY_LIMIT = 8;
const PLOT_SURFACE_SWATCHES = [
  { id: 'plot-white', label: 'White', color: '#ffffff', paperColor: '#ffffff' },
  { id: 'plot-paper', label: 'Soft Grey', color: '#f1f5f9', paperColor: '#f8fafc' }
];
const TRACE_PALETTE_LENGTH = TRACE_PALETTE_DEFAULT.length;
const PLOT_DESIGN_DEFAULT = {
  showAxes: true,
  showMajorGrid: true,
  showMinorGrid: false,
  showTicks: true,
  showLegend: true,
  legendPosition: 'top-right',
  axisLineStyle: 'solid'
};
const THEME_STORAGE_KEY = 'ftir.workspace.theme.active.v1';
const THEME_CUSTOM_STORAGE_KEY = 'ftir.workspace.theme.custom.v1';
const PANEL_CHROME_HISTORY_KEY = 'ftir.workspace.theme.chromeHistory.v1';
const CUSTOM_THEME_LIMIT = 5;
const canUseStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isHexColor = (value) => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
const normalizeColor = (value, fallback = null) => (isHexColor(value) ? value.trim().toLowerCase() : fallback);
const findSwatchById = (swatches, id) => swatches.find((item) => item.id === id) || null;

const sanitizeCanvasBackground = (input = {}) => {
  const providedId = typeof input.id === 'string' ? input.id : null;
  const customColor = normalizeColor(input.customColor);
  const swatch = providedId ? findSwatchById(CANVAS_BACKGROUND_SWATCHES, providedId) : null;
  if (swatch) {
    return { id: swatch.id, color: swatch.color, label: swatch.label };
  }
  if (customColor) {
    return { id: 'custom', color: customColor, customColor };
  }
  const fallback = CANVAS_BACKGROUND_SWATCHES[0];
  return { id: fallback.id, color: fallback.color, label: fallback.label };
};

const sanitizePanelChrome = (input = {}) => {
  const providedId = typeof input.id === 'string' ? input.id : null;
  const customColor = normalizeColor(input.customColor);
  const swatch = providedId ? findSwatchById(PANEL_CHROME_SWATCHES, providedId) : null;
  if (swatch) {
    return { id: swatch.id, color: swatch.color, label: swatch.label };
  }
  const normalizedColor = normalizeColor(input.color) || customColor;
  if (normalizedColor) {
    return { id: 'custom', color: normalizedColor, customColor: normalizedColor };
  }
  const fallback = PANEL_CHROME_SWATCHES[0];
  return { id: fallback.id, color: fallback.color, label: fallback.label };
};
const sanitizePlotSurface = (input = {}) => {
  const providedId = typeof input.id === 'string' ? input.id : null;
  const customColor = normalizeColor(input.customColor);
  const swatch = providedId ? findSwatchById(PLOT_SURFACE_SWATCHES, providedId) : null;
  if (swatch) {
    return {
      id: swatch.id,
      color: swatch.color,
      paperColor: swatch.paperColor || swatch.color,
      label: swatch.label
    };
  }
  const normalizedColor = normalizeColor(input.color) || customColor;
  if (normalizedColor) {
    return { id: 'custom', color: normalizedColor, customColor: normalizedColor, paperColor: normalizedColor };
  }
  const fallback = PLOT_SURFACE_SWATCHES[0];
  return {
    id: fallback.id,
    color: fallback.color,
    paperColor: fallback.paperColor || fallback.color,
    label: fallback.label
  };
};

const sanitizeTracePalette = (value) => {
  const incoming = Array.isArray(value)
    ? value
    : Array.isArray(value?.colors)
      ? value.colors
      : [];
  const sanitized = incoming
    .map((color) => normalizeColor(color))
    .filter(Boolean);
  while (sanitized.length < TRACE_PALETTE_LENGTH) {
    sanitized.push(TRACE_PALETTE_DEFAULT[sanitized.length]);
  }
  return sanitized.slice(0, TRACE_PALETTE_LENGTH);
};
const setActiveTracePalette = (value) => {
  const sanitized = sanitizeTracePalette(value);
  activeTracePalette = sanitized.length ? sanitized : TRACE_PALETTE_DEFAULT.slice();
};

const sanitizePlotDesign = (design = {}) => ({
  showAxes: design.showAxes !== false,
  showMajorGrid: design.showMajorGrid !== false,
  showMinorGrid: !!design.showMinorGrid,
  showTicks: design.showTicks !== false,
  showLegend: design.showLegend !== false,
  legendPosition: typeof design.legendPosition === 'string' ? design.legendPosition : 'top-right',
  axisLineStyle: typeof design.axisLineStyle === 'string' ? design.axisLineStyle : 'solid'
});

const sanitizeTheme = (value = {}, { fallbackName = null } = {}) => {
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : fallbackName || null;
  return {
    canvasBackground: sanitizeCanvasBackground(value.canvasBackground),
    panelChrome: sanitizePanelChrome(value.panelChrome),
    plotSurface: sanitizePlotSurface(value.plotSurface),
    tracePalette: sanitizeTracePalette(value.tracePalette),
    plotDesign: sanitizePlotDesign(value.plotDesign),
    tracePalettePreset:
      typeof value.tracePalettePreset === 'string' && value.tracePalettePreset.trim()
        ? value.tracePalettePreset.trim()
        : null,
    name
  };
};

const DEFAULT_THEME = sanitizeTheme({ name: 'Default theme' });

const sanitizeCustomThemes = (value) => {
  const incoming = Array.isArray(value) ? value : [];
  return Array.from({ length: CUSTOM_THEME_LIMIT }, (_, index) => {
    const candidate = incoming[index];
    return candidate ? sanitizeTheme(candidate, { fallbackName: `Theme ${index + 1}` }) : null;
  });
};

const loadStoredTheme = () => {
  if (!canUseStorage) return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeTheme(JSON.parse(raw));
  } catch {
    return null;
  }
};

const saveStoredTheme = (theme) => {
  if (!canUseStorage) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
};

const loadCustomThemeSlots = () => {
  if (!canUseStorage) return sanitizeCustomThemes();
  try {
    const raw = window.localStorage.getItem(THEME_CUSTOM_STORAGE_KEY);
    if (!raw) return sanitizeCustomThemes();
    return sanitizeCustomThemes(JSON.parse(raw));
  } catch {
    return sanitizeCustomThemes();
  }
};

const saveCustomThemeSlots = (slots) => {
  if (!canUseStorage) return;
  try {
    window.localStorage.setItem(THEME_CUSTOM_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    /* ignore */
  }
};

const loadPanelChromeHistory = () => {
  if (!canUseStorage) return [];
  try {
    const raw = window.localStorage.getItem(PANEL_CHROME_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? parsed
        .map((color) => normalizeColor(color))
        .filter(Boolean)
      : [];
    return normalized.slice(0, PANEL_CHROME_HISTORY_LIMIT);
  } catch {
    return [];
  }
};

const savePanelChromeHistory = (history) => {
  if (!canUseStorage) return;
  try {
    window.localStorage.setItem(PANEL_CHROME_HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
};

const themeState = {
  active: loadStoredTheme() || sanitizeTheme(),
  customThemes: loadCustomThemeSlots(),
  chromeHistory: loadPanelChromeHistory(),
  listeners: new Set()
};
let themeMenuControls = null;
let themeRuntimeUnsubscribe = null;

const emitThemeChange = () => {
  themeState.listeners.forEach((listener) => {
    try {
      listener(themeState.active);
    } catch (err) {
      console.warn('Theme listener failed', err);
    }
  });
};

const recordPanelChromeHistory = (color) => {
  const normalized = normalizeColor(color);
  if (!normalized) return;
  const next = [normalized, ...themeState.chromeHistory.filter((entry) => entry !== normalized)];
  if (next.length > PANEL_CHROME_HISTORY_LIMIT) {
    next.length = PANEL_CHROME_HISTORY_LIMIT;
  }
  themeState.chromeHistory = next;
  savePanelChromeHistory(themeState.chromeHistory);
};

const setActiveTheme = (nextTheme, { persist = true } = {}) => {
  const sanitized = sanitizeTheme(nextTheme);
  themeState.active = sanitized;
  if (persist) {
    saveStoredTheme(themeState.active);
  }
  recordPanelChromeHistory(sanitized.panelChrome?.color);
  emitThemeChange();
  return themeState.active;
};

const updateActiveTheme = (patch = {}, options = {}) =>
  setActiveTheme({ ...themeState.active, ...patch }, options);

const subscribeToThemes = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  themeState.listeners.add(listener);
  return () => {
    themeState.listeners.delete(listener);
  };
};

const saveCustomThemeSlot = (slotIndex, payload) => {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= CUSTOM_THEME_LIMIT) {
    return false;
  }
  const sanitized = payload ? sanitizeTheme(payload, { fallbackName: `Theme ${slotIndex + 1}` }) : null;
  themeState.customThemes[slotIndex] = sanitized;
  saveCustomThemeSlots(themeState.customThemes);
  return true;
};

const getCustomThemes = () => themeState.customThemes.slice();
const getActiveTheme = () => themeState.active;
const getPanelChromeHistory = () => themeState.chromeHistory.slice();
const themeSwatches = {
  canvasBackgrounds: CANVAS_BACKGROUND_SWATCHES.slice(),
  panelChrome: PANEL_CHROME_SWATCHES.slice(),
  plotSurface: PLOT_SURFACE_SWATCHES.slice(),
  tracePalette: TRACE_PALETTE_DEFAULT.slice(),
  plotDesign: { ...PLOT_DESIGN_DEFAULT }
};
const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const hexToRgb = (hex) => {
  if (typeof hex !== 'string') return null;
  let normalized = hex.trim().replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized.split('').map((char) => char + char).join('');
  }
  if (normalized.length !== 6 || Number.isNaN(Number.parseInt(normalized, 16))) {
    return null;
  }
  const intValue = Number.parseInt(normalized, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
};
const rgbToHex = (r, g, b) => `#${clampByte(r).toString(16).padStart(2, '0')}${clampByte(g).toString(16).padStart(2, '0')}${clampByte(b).toString(16).padStart(2, '0')}`;
const mixHex = (base, target, amount = 0.5) => {
  const from = hexToRgb(base);
  const to = hexToRgb(target);
  if (!from || !to) return base || target;
  const weight = Math.min(Math.max(amount, 0), 1);
  const mixChannel = (channel) => from[channel] + (to[channel] - from[channel]) * weight;
  return rgbToHex(mixChannel('r'), mixChannel('g'), mixChannel('b'));
};
const toRgbaString = (hex, alpha = 1) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};
const getReadableTextColor = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#f8fafc';
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#0f172a' : '#f8fafc';
};
const setCssVar = (name, value) => {
  if (typeof document === 'undefined' || !name) return;
  document.documentElement?.style.setProperty(name, value);
};
const buildPlotLayoutTheme = (theme = getActiveTheme()) => {
  const panelColor = theme?.panelChrome?.color || '#111827';
  const canvasColor = theme?.canvasBackground?.color || '#0b1120';
  const plotBg = theme?.plotSurface?.color || '#ffffff';
  const paperBg = theme?.plotSurface?.paperColor || plotBg;
  const panelTextColor = getReadableTextColor(panelColor);
  const plotTextColor = getReadableTextColor(plotBg);
  const axisColor = mixHex(plotTextColor, plotBg, 0.2);
  const legendBg = toRgbaString(mixHex(paperBg, '#000000', 0.06), 0.55);
  const gridMajor = toRgbaString(mixHex(plotBg, '#000000', 0.12), 0.35);
  const gridMinor = toRgbaString(mixHex(plotBg, '#000000', 0.18), 0.22);
  return {
    panelColor,
    canvasColor,
    plotBg,
    paperBg,
    textColor: panelTextColor,
    axisColor,
    legendBg,
    gridMajor,
    gridMinor,
    plotTextColor
  };
};
const applyThemeToDocument = (theme = getActiveTheme()) => {
  if (typeof document === 'undefined') return;
  const canvasColor = theme?.canvasBackground?.color || '#0b1120';
  const panelColor = theme?.panelChrome?.color || '#111827';
  const plotBg = theme?.plotSurface?.color || '#ffffff';
  const paperBg = theme?.plotSurface?.paperColor || plotBg;
  const textColor = getReadableTextColor(panelColor);
  setCssVar('--workspace-theme-canvas-bg', canvasColor);
  setCssVar('--workspace-theme-panel-bg', panelColor);
  setCssVar('--workspace-theme-panel-text', textColor);
  setCssVar('--workspace-theme-plot-bg', plotBg);
  setCssVar('--workspace-theme-paper-bg', paperBg);
  setCssVar('--workspace-theme-panel-border', toRgbaString(mixHex(panelColor, '#ffffff', 0.25), 0.55));
  setCssVar('--workspace-theme-panel-border-active', toRgbaString(mixHex(panelColor, '#ffffff', 0.35), 0.8));
  setCssVar('--workspace-theme-panel-header-bg', toRgbaString(mixHex(panelColor, '#ffffff', 0.2), 0.25));
  setCssVar('--workspace-theme-panel-header-border', toRgbaString(mixHex(panelColor, '#ffffff', 0.3), 0.45));
  setCssVar('--workspace-theme-panel-shadow-color', toRgbaString(mixHex(panelColor, '#000000', 0.8), 0.35));
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.setProperty('background-color', canvasColor);
  }
};

const applyPlotThemeToLayout = (layout = {}, theme = getActiveTheme()) => {
  const colors = buildPlotLayoutTheme(theme);
  const design = sanitizePlotDesign(theme?.plotDesign || PLOT_DESIGN_DEFAULT);
  const axisLineColor = colors.axisColor || colors.plotTextColor;
  const transparent = 'rgba(0,0,0,0)';
  const applyAxisTheme = (axis = {}) => {
    const next = {
      ...axis,
      showline: design.showAxes,
      mirror: design.showAxes,
      linecolor: axis.linecolor || axisLineColor,
      ticks: design.showTicks ? axis.ticks || 'outside' : '',
      tickcolor: design.showTicks ? axis.tickcolor || axisLineColor : transparent,
      ticklen: design.showTicks ? axis.ticklen ?? 6 : 0,
      showgrid: design.showMajorGrid,
      gridcolor: design.showMajorGrid ? axis.gridcolor || colors.gridMajor : transparent,
      minor: {
        ...(axis.minor || {}),
        showgrid: design.showMinorGrid,
        gridcolor: design.showMinorGrid ? axis.minor?.gridcolor || colors.gridMinor : transparent,
        ticks: design.showTicks ? axis.minor?.ticks || 'outside' : ''
      },
      tickfont: {
        ...(axis.tickfont || {}),
        color: colors.plotTextColor
      },
      title: {
        ...(axis.title || {}),
        font: {
          ...(axis.title?.font || {}),
          color: colors.plotTextColor
        }
      }
    };
    return next;
  };

  return {
    ...layout,
    paper_bgcolor: colors.paperBg || colors.plotBg,
    plot_bgcolor: colors.plotBg,
    font: {
      ...(layout.font || {}),
      color: colors.plotTextColor
    },
    xaxis: applyAxisTheme(layout.xaxis || {}),
    yaxis: applyAxisTheme(layout.yaxis || {}),
    legend: {
      ...(layout.legend || {}),
      bgcolor: colors.legendBg,
      bordercolor: toRgbaString(mixHex(colors.paperBg || colors.plotBg, '#000000', 0.25), 0.35),
      font: {
        ...(layout.legend?.font || {}),
        color: colors.plotTextColor
      }
    },
    hoverlabel: {
      ...(layout.hoverlabel || {}),
      bgcolor: colors.plotBg,
      bordercolor: axisLineColor,
      font: {
        ...(layout.hoverlabel?.font || {}),
        color: colors.plotTextColor
      }
    },
    showlegend: design.showLegend
  };
};

const applyTracePaletteToFigure = (figure, { palette = null } = {}) => {
  const resolvedPalette = Array.isArray(palette) && palette.length
    ? palette
    : activeTracePalette.length
      ? activeTracePalette
      : TRACE_PALETTE_DEFAULT;
  if (!figure) {
    return { data: [], layout: {} };
  }
  let fallbackCursor = 0;
  const data = ensureArray(figure.data).map((original) => {
    if (!original) return original;
    const trace = {
      ...original,
      line: { ...(original.line || {}) }
    };
    const meta = { ...(original.meta || {}) };
    const hasManualColor = meta.manualColor === true;
    const explicitColor = trace.line?.color || trace.color;
    let paletteIndex = Number.isInteger(meta.autoColorIndex) ? meta.autoColorIndex : null;
    if (!hasManualColor && !Number.isInteger(paletteIndex) && !explicitColor) {
      paletteIndex = fallbackCursor;
      meta.autoColorIndex = paletteIndex;
    }
    if (Number.isInteger(paletteIndex) && !hasManualColor) {
      const normalizedIndex = ((paletteIndex % resolvedPalette.length) + resolvedPalette.length) % resolvedPalette.length;
      const paletteColor = toHexColor(resolvedPalette[normalizedIndex] || getFallbackTraceColor());
      const currentColor = toHexColor(trace.line?.color || trace.color || '');
      if (currentColor && paletteColor && currentColor.toLowerCase() !== paletteColor.toLowerCase()) {
        meta.manualColor = true;
        delete meta.autoColorIndex;
      } else if (paletteColor) {
        fallbackCursor = Math.max(fallbackCursor, paletteIndex) + 1;
        trace.line.color = paletteColor;
        trace.color = paletteColor;
      }
    }
    trace.meta = meta;
    return trace;
  });
  return {
    ...figure,
    data
  };
};

const initThemeMenuControls = () => {
  if (typeof document === 'undefined') return null;
  const trigger = document.getElementById('c_canvas_toggle_theme');
  const menu = document.getElementById('c_canvas_theme_menu');
  const dom = {
    canvasSwatches: document.getElementById('c_theme_canvas_swatches'),
    canvasPicker: document.getElementById('c_theme_canvas_custom'),
    chromeSwatches: document.getElementById('c_theme_chrome_swatches'),
    chromePicker: document.getElementById('c_theme_chrome_custom'),
    chromeHistory: document.getElementById('c_theme_chrome_history'),
    plotSwatches: document.getElementById('c_theme_plot_swatches'),
    plotPicker: document.getElementById('c_theme_plot_custom'),
    tracePalette: document.getElementById('c_theme_trace_palette'),
    plotDesign: document.getElementById('c_theme_plot_design'),
    customList: document.getElementById('c_theme_custom_list'),
    saveButton: document.getElementById('c_theme_save_current')
  };
  if (!trigger || !menu) return null;

  const updateTheme = (patch) => {
    const current = getActiveTheme();
    setActiveTheme({ ...current, ...patch });
  };

  const updatePlotDesign = (partial) => {
    const current = getActiveTheme();
    updateTheme({
      plotDesign: {
        ...current.plotDesign,
        ...partial
      }
    });
  };

  const handleCanvasCustomInput = (event) => {
    const color = normalizeColor(event.target.value);
    if (!color) return;
    updateTheme({
      canvasBackground: {
        id: 'custom',
        color,
        customColor: color
      }
    });
  };

  const handleChromeCustomInput = (event) => {
    const color = normalizeColor(event.target.value);
    if (!color) return;
    updateTheme({
      panelChrome: {
        id: 'custom',
        color,
        customColor: color
      }
    });
  };
  const handlePlotSurfaceCustomInput = (event) => {
    const color = normalizeColor(event.target.value);
    if (!color) return;
    updateTheme({
      plotSurface: {
        id: 'custom',
        color,
        customColor: color,
        paperColor: color
      }
    });
  };

  const renderCanvasSwatches = (theme) => {
    if (!dom.canvasSwatches) return;
    const fragment = document.createDocumentFragment();
    themeSwatches.canvasBackgrounds.forEach((swatch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-theme-swatch';
      btn.style.background = swatch.gradient || `linear-gradient(135deg, ${swatch.color}, ${swatch.color}99)`;
      btn.title = swatch.label;
      if (theme.canvasBackground?.id === swatch.id) {
        btn.classList.add('is-active');
      }
      btn.addEventListener('click', () => {
        updateTheme({
          canvasBackground: {
            id: swatch.id,
            color: swatch.color,
            label: swatch.label
          }
        });
      });
      fragment.appendChild(btn);
    });
    dom.canvasSwatches.innerHTML = '';
    dom.canvasSwatches.appendChild(fragment);
    if (dom.canvasPicker) {
      dom.canvasPicker.value = theme.canvasBackground?.color || dom.canvasPicker.value || '#0b1120';
      dom.canvasPicker
        .closest('.workspace-theme-swatch--custom')
        ?.classList.toggle('is-active', theme.canvasBackground?.id === 'custom');
    }
  };

  const renderChromeSwatches = (theme) => {
    if (!dom.chromeSwatches) return;
    const fragment = document.createDocumentFragment();
    themeSwatches.panelChrome.forEach((swatch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-theme-swatch';
      btn.style.background = swatch.preview || `linear-gradient(135deg, ${swatch.color}, ${swatch.color}99)`;
      btn.title = swatch.label;
      if (theme.panelChrome?.id === swatch.id) {
        btn.classList.add('is-active');
      }
      btn.addEventListener('click', () => {
        updateTheme({
          panelChrome: {
            id: swatch.id,
            color: swatch.color,
            label: swatch.label
          }
        });
      });
      fragment.appendChild(btn);
    });
    dom.chromeSwatches.innerHTML = '';
    dom.chromeSwatches.appendChild(fragment);
    if (dom.chromePicker) {
      dom.chromePicker.value = theme.panelChrome?.color || dom.chromePicker.value || '#1f2937';
      dom.chromePicker
        .closest('.workspace-theme-swatch--custom')
        ?.classList.toggle('is-active', theme.panelChrome?.id === 'custom');
    }

    if (dom.chromeHistory) {
      const history = getPanelChromeHistory();
      dom.chromeHistory.innerHTML = '';
      history.forEach((color) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.background = color;
        btn.title = `Apply ${color}`;
        btn.addEventListener('click', () => {
          updateTheme({
            panelChrome: {
              id: 'custom',
              color,
              customColor: color
            }
          });
        });
        dom.chromeHistory.appendChild(btn);
      });
      dom.chromeHistory.hidden = history.length === 0;
    }
  };

  const renderPlotSurfaceSwatches = (theme) => {
    if (!dom.plotSwatches) return;
    const fragment = document.createDocumentFragment();
    themeSwatches.plotSurface.forEach((swatch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-theme-swatch';
      btn.style.background = swatch.preview || swatch.color;
      btn.title = swatch.label;
      if (theme.plotSurface?.id === swatch.id) {
        btn.classList.add('is-active');
      }
      btn.addEventListener('click', () => {
        updateTheme({
          plotSurface: {
            id: swatch.id,
            color: swatch.color,
            paperColor: swatch.paperColor || swatch.color,
            label: swatch.label
          }
        });
      });
      fragment.appendChild(btn);
    });
    dom.plotSwatches.innerHTML = '';
    dom.plotSwatches.appendChild(fragment);
    if (dom.plotPicker) {
      dom.plotPicker.value = theme.plotSurface?.color || dom.plotPicker.value || '#ffffff';
      dom.plotPicker
        .closest('.workspace-theme-swatch--custom')
        ?.classList.toggle('is-active', theme.plotSurface?.id === 'custom');
    }
  };

  const applyTraceRowPreset = (rowSchema, rowIndex = 0) => {
    if (!rowSchema) return;
    const normalized = ensureArray(rowSchema.colors)
      .map((color) => normalizeColor(color))
      .filter(Boolean);
    if (!normalized.length) return;
    const basePalette = Array.isArray(getActiveTheme()?.tracePalette)
      ? getActiveTheme().tracePalette.slice()
      : TRACE_PALETTE_DEFAULT.slice();
    while (basePalette.length < TRACE_PALETTE_LENGTH) {
      basePalette.push(TRACE_PALETTE_DEFAULT[basePalette.length % TRACE_PALETTE_LENGTH]);
    }
    basePalette.length = TRACE_PALETTE_LENGTH;
    const start = rowIndex * 10;
    for (let i = 0; i < 10 && start + i < basePalette.length; i += 1) {
      basePalette[start + i] = normalized[i % normalized.length];
    }
    updateTheme({
      tracePalette: basePalette,
      tracePalettePreset: typeof rowSchema.id === 'string' ? rowSchema.id : `row-${rowIndex}`
    });
    showToast(`Applied ${rowSchema.label || 'palette'} to trace colors.`, 'success');
  };

  const paletteMatchesPresetRow = (rowSchema, palette, rowIndex = 0) => {
    if (!rowSchema) return false;
    const normalizedRow = ensureArray(rowSchema.colors)
      .map((color) => normalizeColor(color))
      .filter(Boolean);
    if (!normalizedRow.length) return false;
    if (!Array.isArray(palette) || !palette.length) return false;
    const start = rowIndex * 10;
    return palette.slice(start, start + 10).every((color, idx) => {
      const expected = normalizedRow[idx % normalizedRow.length];
      return normalizeColor(color) === expected;
    });
  };

  const renderTracePalette = (theme) => {
    if (!dom.tracePalette) return;
    const palette = Array.isArray(theme.tracePalette)
      ? theme.tracePalette
      : TRACE_PALETTE_DEFAULT;
    const fragment = document.createDocumentFragment();
    const rows = Math.ceil(palette.length / 10);
    const presetId =
      typeof theme.tracePalettePreset === 'string' && theme.tracePalettePreset.trim()
        ? theme.tracePalettePreset.trim()
        : null;
    let fallbackHighlighted = false;
    for (let row = 0; row < rows; row += 1) {
      const rowSchema = TRACE_PALETTE_ROWS[row] || {};
      const rowWrapper = document.createElement('div');
      rowWrapper.className = 'workspace-theme-trace-row';
      const rowPresetId = rowSchema.id || `row-${row}`;
      rowWrapper.dataset.presetId = rowPresetId;

      const matchesPalette = paletteMatchesPresetRow(rowSchema, palette, row);
      let isActivePreset = false;
      if (presetId && rowSchema.id) {
        isActivePreset = presetId === rowSchema.id;
      } else if (!presetId && !fallbackHighlighted && matchesPalette) {
        isActivePreset = true;
        fallbackHighlighted = true;
      }

      const header = document.createElement('div');
      header.className = 'workspace-theme-trace-row-header';

      const selectorLabel = document.createElement('div');
      selectorLabel.className = 'workspace-theme-trace-selector';
      selectorLabel.addEventListener('click', () => applyTraceRowPreset(rowSchema, row));
      const iconEl = document.createElement('i');
      iconEl.className = `workspace-theme-trace-row-icon bi ${rowSchema.icon || 'bi-palette'}`;
      selectorLabel.appendChild(iconEl);

      const label = document.createElement('div');
      label.className = 'workspace-theme-trace-row-label';
      label.textContent = rowSchema.label || `Palette ${row + 1}`;
      selectorLabel.appendChild(label);

      header.appendChild(selectorLabel);
      rowWrapper.appendChild(header);

      const swatchGrid = document.createElement('div');
      swatchGrid.className = 'workspace-theme-trace-row-swatches';

      const start = row * 10;
      const slice = palette.slice(start, start + 10);
      slice.forEach((color, index) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'workspace-theme-trace-swatch';
        swatch.style.background = color || '#000000';
        swatch.title = `Trace ${start + index + 1}`;
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color || '#000000';
        input.addEventListener('input', (event) => {
          const nextPalette = palette.slice();
          nextPalette[start + index] = event.target.value;
          updateTheme({ tracePalette: nextPalette, tracePalettePreset: null });
        });
        swatch.appendChild(input);
        swatchGrid.appendChild(swatch);
      });
      rowWrapper.appendChild(swatchGrid);
      rowWrapper.addEventListener('click', (event) => {
        if (event.target.closest('.workspace-theme-trace-swatch input')) return;
        applyTraceRowPreset(rowSchema, row);
      });
      rowWrapper.classList.toggle('is-active', isActivePreset);
      fragment.appendChild(rowWrapper);
    }
    dom.tracePalette.innerHTML = '';
    dom.tracePalette.appendChild(fragment);
  };

  const renderPlotDesign = (theme) => {
    if (!dom.plotDesign) return;
    const design = theme.plotDesign || PLOT_DESIGN_DEFAULT;
    dom.plotDesign?.replaceChildren();
  };

  const renderCustomThemes = () => {
    if (!dom.customList) return;
    const slots = getCustomThemes();
    const merged = [
      {
        slot: sanitizeTheme(DEFAULT_THEME, { fallbackName: 'Default theme' }),
        slotIndex: null,
        position: 1,
        forcedName: 'Default theme'
      },
      ...slots.map((slot, idx) => ({
        slot,
        slotIndex: idx,
        position: idx + 1,
        forcedName: slot?.name || `Theme ${idx + 1}`
      }))
    ];
    const fragment = document.createDocumentFragment();
    merged.forEach((entry, displayIndex) => {
      const { slot, slotIndex, forcedName } = entry;
      const isDefaultSlot = slotIndex === null;
      const title = forcedName || (isDefaultSlot ? 'Default theme' : `Theme ${slotIndex + 1}`);
      const card = document.createElement('div');
      card.className = 'workspace-theme-custom-card';
      const header = document.createElement('header');
      const titleGroup = document.createElement('div');
      titleGroup.className = 'workspace-theme-custom-header';
      const titleText = document.createElement('span');
      titleText.className = 'workspace-theme-custom-title';
      titleText.textContent = title;
      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'btn btn-link btn-sm workspace-theme-custom-rename';
      renameBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      renameBtn.title = 'Rename theme';
      if (!slot || isDefaultSlot) {
        renameBtn.hidden = true;
      } else {
        renameBtn.addEventListener('click', () => {
          const currentName = titleText.textContent || `Theme ${slotIndex + 1}`;
          const nextName = window.prompt('Rename custom theme', currentName);
          if (!nextName || !nextName.trim()) return;
          titleText.textContent = nextName.trim();
          slot.name = nextName.trim();
          saveCustomThemeSlot(slotIndex, slot);
        });
      }
      titleGroup.appendChild(titleText);
      if (!renameBtn.hidden) {
        titleGroup.appendChild(renameBtn);
      }
      header.appendChild(titleGroup);
      if (!slot) {
        const hint = document.createElement('span');
        hint.className = 'workspace-theme-custom-empty';
        hint.textContent = 'Empty slot';
        header.appendChild(hint);
      } else if (isDefaultSlot) {
        const hint = document.createElement('span');
        hint.className = 'workspace-theme-custom-empty';
        hint.textContent = 'Built-in';
        header.appendChild(hint);
      }
      card.appendChild(header);

      const preview = document.createElement('div');
      preview.className = 'workspace-theme-custom-preview';
      if (slot) {
        const canvasSwatch = document.createElement('span');
        canvasSwatch.style.background = slot.canvasBackground?.color || '#0b1120';
        preview.appendChild(canvasSwatch);
        const chromeSwatch = document.createElement('span');
        chromeSwatch.style.background = slot.panelChrome?.color || '#1f2937';
        preview.appendChild(chromeSwatch);
        slot.tracePalette?.slice(0, 3).forEach((color) => {
          const traceSwatch = document.createElement('span');
          traceSwatch.style.background = color || '#ffffff';
          preview.appendChild(traceSwatch);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'workspace-theme-custom-empty';
        empty.textContent = 'No preview';
        preview.appendChild(empty);
      }
      card.appendChild(preview);

      const actions = document.createElement('div');
      actions.className = 'workspace-theme-custom-actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'btn btn-outline-secondary btn-sm';
      applyBtn.textContent = 'Apply';
      applyBtn.disabled = !slot;
      applyBtn.addEventListener('click', () => {
        if (!slot) return;
        setActiveTheme(slot);
        showToast(`${title} applied.`, 'success');
      });
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-outline-primary btn-sm';
      saveBtn.textContent = isDefaultSlot ? 'Locked' : 'Save here';
      saveBtn.disabled = isDefaultSlot;
      if (!isDefaultSlot) {
        saveBtn.addEventListener('click', () => {
          saveCustomThemeSlot(slotIndex, getActiveTheme());
          showToast(`Saved current theme to slot ${slotIndex + 1}.`, 'success');
          renderCustomThemes();
        });
      }
      actions.appendChild(applyBtn);
      actions.appendChild(saveBtn);
      card.appendChild(actions);
      fragment.appendChild(card);
    });
    dom.customList.innerHTML = '';
    dom.customList.appendChild(fragment);
  };

  const render = () => {
    const theme = getActiveTheme();
    if (!theme) return;
    renderCanvasSwatches(theme);
    renderChromeSwatches(theme);
    renderPlotSurfaceSwatches(theme);
    renderTracePalette(theme);
    renderPlotDesign(theme);
    renderCustomThemes();
  };

  dom.canvasPicker?.addEventListener('input', handleCanvasCustomInput);
  dom.chromePicker?.addEventListener('input', handleChromeCustomInput);
  dom.plotPicker?.addEventListener('input', handlePlotSurfaceCustomInput);
  if (dom.saveButton) {
    dom.saveButton.addEventListener('click', () => {
      const slots = getCustomThemes();
      const emptyIndex = slots.findIndex((slot) => slot === null);
      if (emptyIndex === -1) {
        showToast('All custom slots are in use. Overwrite a slot below.', 'info');
        return;
      }
      saveCustomThemeSlot(emptyIndex, getActiveTheme());
      showToast(`Saved current theme to slot ${emptyIndex + 1}.`, 'success');
      render();
    });
  }

  const scheduleRender = () => {
    if (typeof window?.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(render);
    } else {
      setTimeout(render, 0);
    }
  };
  trigger.addEventListener('click', scheduleRender);
  trigger.addEventListener('mouseenter', scheduleRender);
  const unsubscribe = subscribeToThemes(render);
  render();

  return {
    teardown: () => {
      trigger.removeEventListener('click', scheduleRender);
      trigger.removeEventListener('mouseenter', scheduleRender);
      unsubscribe?.();
    }
  };
};

const isWorkspaceSnapshot = (value) => {
  if (!value || typeof value !== 'object') return false;
  if (value.panels) {
    if (Array.isArray(value.panels)) return true;
    if (Array.isArray(value.panels?.items)) return true;
    if (typeof value.panels === 'object') return true;
  }
  if (value.sections) {
    if (Array.isArray(value.sections)) return true;
    if (Array.isArray(value.sections?.items)) return true;
    if (typeof value.sections === 'object') return true;
  }
  if (value.figures && typeof value.figures === 'object') return true;
  if (value.uiPrefs && typeof value.uiPrefs === 'object') return true;
  return false;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const showToast = (message, variant = 'info', delay = 2400) => {
  if (typeof window?.showAppToast === 'function') {
    window.showAppToast({ message, variant, delay });
  }
};

let normalizePanelTraces = () => null;
let createTraceFromPayload = () => null;
let ingestPayloadAsPanel = () => null;
let addTracesToPanel = () => false;
let appendFilesToGraph = async () => {};
let moveTrace = () => false;
let moveGraph = () => false;
let removePanel = () => {};
let clearPanels = () => {};
let restoreSnapshot = () => {};

const randomPanelId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `canvas_${crypto.randomUUID()}`;
  }
  return `canvas_${Math.random().toString(36).slice(2, 9)}`;
};

const decodeName = (value) => {
  if (typeof value !== 'string' || !value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const ensureTraceId = (trace) => {
  if (!trace) return null;
  if (!trace._canvasId) {
    trace._canvasId = randomPanelId();
  }
  return trace._canvasId;
};

const ensureDefaultSection = () => {
  sectionManager.ensureDefaultSection();
};

const createSection = (name, options = {}) => sectionManager.createSection(name, options);

const deleteSection = (sectionId) => {
  sectionManager.deleteSection(sectionId);
};

const renameSection = (sectionId, name) => {
  sectionManager.renameSection(sectionId, name);
};

const setSectionCollapsed = (sectionId, collapsed) => {
  sectionManager.setSectionCollapsed(sectionId, collapsed);
};

const moveSection = (sectionId, options = {}) => sectionManager.moveSection(sectionId, options);

const collectSectionDescendants = (sectionId) => sectionManager.collectDescendants(sectionId);

const sectionsModel = {
  snapshot: () => sectionManager.snapshot(),
  load: (snapshot) => {
    sectionManager.load(snapshot);
  }
};

const defaultPanelTitle = (panelType, index) => {
  if (panelType?.getDefaultTitle) {
    return panelType.getDefaultTitle(index);
  }
  const numeric = Number(index);
  return Number.isFinite(numeric) && numeric > 0 ? `Panel ${numeric}` : (panelType?.label || 'Panel');
};

const resolvePanelTitle = (record) => {
  const raw = typeof record?.title === 'string' ? record.title.trim() : '';
  const index = Number(record?.index);
  const panelType = getPanelType(record?.type);
  return raw || defaultPanelTitle(panelType, index);
};


export function initWorkspaceRuntime(context = {}) {
  const autosaveIndicatorController = createAutosaveIndicatorController();
  autosaveIndicatorController?.setStatus?.('idle');
  colorCursorManager.reset();
  sectionManager.reset();
  chipPanelsInstance = null;
  dragState = null;
  currentDropTarget = null;
  pendingRenameSectionId = null;
  activePanelId = null;
  browserFacade?.teardown?.();
  browserFacade = null;
  operationsLog.length = 0;
  operationsRenderQueued = false;
  operationSequence = 0;
  if (operationsPanelHandles?.root?.parentNode) {
    operationsPanelHandles.root.parentNode.removeChild(operationsPanelHandles.root);
  }
  operationsPanelHandles = null;
  operationsVisible = false;
  if (operationsToggleButton?.parentNode) {
    operationsToggleButton.parentNode.removeChild(operationsToggleButton);
  }
  operationsToggleButton = null;
  if (devToggleButton?.parentNode) {
    devToggleButton.parentNode.removeChild(devToggleButton);
  }
  devToggleButton = null;
  devModeEnabled = document.body?.dataset?.workspaceDev === 'true';
  const { roots = {} } = context;
  const canvas = roots.canvas ?? document.getElementById('c_canvas_root');
  const addPlotBtn = roots.addPlotButton ?? document.getElementById('c_canvas_add_plot');
  const markdownBtn = roots.markdownButton ?? document.getElementById('c_canvas_add_markdown');
  const scriptBtn = roots.scriptButton ?? document.getElementById('c_canvas_add_script');
  const sheetBtn = roots.sheetButton ?? document.getElementById('c_canvas_add_sheet');
  const imageBrowseBtn = roots.imageBrowseButton ?? document.getElementById('c_canvas_add_image_browse');
  const imageDriveBtn = roots.imageDriveButton ?? document.getElementById('c_canvas_add_image_drive');
  const imageLinkBtn = roots.imageLinkButton ?? document.getElementById('c_canvas_add_image_link');
  const alignStackBtn = document.getElementById('c_canvas_align_stack');
  const alignCascadeBtn = document.getElementById('c_canvas_align_cascade');
  const alignTileBtn = document.getElementById('c_canvas_align_tile');
  alignIncludeAllToggle = document.getElementById('c_canvas_align_include_all');
  const resetBtn = roots.resetButton ?? document.getElementById('c_canvas_reset_layout');
  const browseBtn = roots.browseButton ?? document.getElementById('c_canvas_browse_btn');
  const importFolderBtn = roots.importFolderButton ?? document.getElementById('c_canvas_import_folder');
  const packageBundleBtn = document.getElementById('c_canvas_package_bundle');
  const packageBackupBtn = document.getElementById('c_canvas_package_backup');
  const packageItemsBtn = document.getElementById('c_canvas_package_items');
  const demoBtn = roots.demoButton ?? document.getElementById('c_canvas_demo_btn');
  const snapshotSaveBtn = document.getElementById('c_canvas_snapshot_save');
  const snapshotManageBtn = document.getElementById('c_canvas_snapshot_manage');
  const snapshotModalEl = document.getElementById('c_canvas_snapshot_modal');
  const fileInput = roots.fileInput ?? document.getElementById('c_canvas_file_input');
  const folderInput = roots.folderInput ?? document.getElementById('c_canvas_folder_input');
  const emptyOverlay = roots.emptyOverlay ?? document.getElementById('c_canvas_empty');
  const canvasWrapper = roots.canvasWrapper ?? canvas?.closest('.workspace-canvas-wrapper');
  const topToolbar = roots.topToolbar ?? canvasWrapper?.querySelector('.workspace-toolbar');
  const verticalToolbar = roots.verticalToolbar ?? canvasWrapper?.querySelector('.workspace-toolbar-vertical');
  const resolveAuthState = () => readDatasetBool(readBodyDatasetValue('userAuthenticated'));
  let userAuthenticated = resolveAuthState();
  const syncGuestSessionClass = () => {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('workspace-guest-session', !userAuthenticated);
  };
  syncGuestSessionClass();
  const activeCanvasId = getActiveCanvasIdFromContext();
  let cloudSyncEnabled = userAuthenticated && !!activeCanvasId;
  const updateCloudSyncState = () => {
    const next = userAuthenticated && !!activeCanvasId;
    if (next === cloudSyncEnabled) return;
    cloudSyncEnabled = next;
    if (!cloudSyncEnabled && remoteSyncTimer) {
      window.clearTimeout(remoteSyncTimer);
      remoteSyncTimer = null;
    }
  };
  if (typeof document !== 'undefined') {
    if (userStatusHandler) {
      document.removeEventListener('ftir:user-status', userStatusHandler);
    }
    userStatusHandler = (event) => {
      const next = !!event?.detail?.data?.authenticated;
      if (next === userAuthenticated) return;
      userAuthenticated = next;
      syncGuestSessionClass();
      updateCloudSyncState();
    };
    document.addEventListener('ftir:user-status', userStatusHandler);
  }
  const listAvailablePlotPanels = () => {
    const records = panelsModel.getPanelsInIndexOrder();
    return records
      .filter((record) => {
        const panelType = getPanelType(record?.type);
        return !!panelType && panelType.capabilities?.plot !== false;
      })
      .map((record) => ({
        id: record.id,
        title: resolvePanelTitle(record),
        index: record.index
      }));
  };

const gatherVisiblePanelsByType = ({ includeNonPlots = false } = {}) => {
  const records = panelsModel.getPanelsInIndexOrder();
    return records
      .filter((record) => {
        if (!record || record.hidden === true) return false;
        const panelType = getPanelType(record.type);
        if (!panelType) return false;
        if (!includeNonPlots && panelType.capabilities?.plot === false) return false;
        return true;
      })
      .map((record) => ({
        id: record.id,
        type: record.type,
        panelType: getPanelType(record.type),
        index: Number(record.index) || 0,
        geometry: {
          x: Number.isFinite(record.x) ? record.x : 60,
          y: Number.isFinite(record.y) ? record.y : 60,
          width: Number.isFinite(record.width) ? record.width : 600,
          height: Number.isFinite(record.height) ? record.height : 360
        },
        title: resolvePanelTitle(record)
      }))
      .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  };

  const downloadBlob = (blob, filename) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  const slugifyName = (value, fallback = 'panel') => {
    const slug = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || fallback;
  };

  const formatPanelTypeLabel = (type) => {
    switch (type) {
      case 'plot':
        return 'Plot';
      case 'markdown':
        return 'Markdown note';
      case 'spreadsheet':
        return 'Spreadsheet';
      case 'image':
        return 'Image';
      default:
        return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Panel';
    }
  };

  const summarizePanelRecord = (record, order) => {
    const traceCount =
      record.type === 'plot'
        ? (Array.isArray(record.figure?.data)
            ? record.figure.data.length
            : (panelsModel.getPanelTraces(record.id) || []).length)
        : null;
    const summary = {
      id: record.id,
      title: resolvePanelTitle(record),
      type: record.type || 'panel',
      typeLabel: formatPanelTypeLabel(record.type),
      order,
      sectionId: record.sectionId || DEFAULT_SECTION_ID,
      sectionName: null,
      traces: traceCount,
      preview: null
    };
    const section = sectionManager.get(record.sectionId) || null;
    summary.sectionName = section?.name || null;
    const content = getPanelContent(record.id);
    if (record.type === 'markdown' && typeof content?.text === 'string') {
      summary.preview = content.text.replace(/\s+/g, ' ').trim().slice(0, 160);
    } else if (record.type === 'spreadsheet' && content) {
      const rows = Array.isArray(content.rows) ? content.rows.length : Array.isArray(content.data?.rows) ? content.data.rows.length : 0;
      const cols = Array.isArray(content.columns) ? content.columns.length : 0;
      if (rows || cols) {
        const parts = [];
        if (rows) parts.push(`${rows} ${rows === 1 ? 'row' : 'rows'}`);
        if (cols) parts.push(`${cols} ${cols === 1 ? 'column' : 'columns'}`);
        summary.preview = parts.join(' × ');
      }
    } else if (record.type === 'image' && content) {
      summary.preview = content.name || content.filename || content.alt || null;
    }
    return summary;
  };

  const buildBundleMetadata = (panels) => {
    const panelSummaries = panels.map((record, idx) => summarizePanelRecord(record, idx + 1));
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workspaceTitle: document.body?.dataset?.activeCanvasTitle || 'Untitled canvas',
      panelCount: panelSummaries.length,
      panelSummaries
    };
  };

  const buildBundleReadme = (metadata) => {
    const lines = [
      'FTIR-UI Workspace Bundle',
      '=========================',
      '',
      `Title: ${metadata.workspaceTitle}`,
      `Generated: ${metadata.generatedAt}`,
      `Panels: ${metadata.panelCount}`,
      '',
      'Files:',
      ' - index.html : open in a browser to preview this bundle',
      ' - viewer.css / viewer.js : static viewer assets',
      ' - snapshot.json : import back into FTIR-UI (Global Command 9)',
      ' - metadata.json : summary of panels for the viewer',
      '',
      'Usage:',
      ' 1. Extract the archive.',
      ' 2. Open index.html to view a read-only summary.',
      ' 3. Import snapshot.json in FTIR-UI to continue editing.'
    ];
    return lines.join('\n');
  };

  const buildViewerAssets = () => ({
    html: ONE_CLICK_VIEWER_HTML,
    css: ONE_CLICK_VIEWER_CSS,
    js: ONE_CLICK_VIEWER_JS
  });

  const formatCsvValue = (value) => {
    if (value == null) return '';
    const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : String(value ?? '');
    if (/["\n,]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const buildTraceCsv = (trace) => {
    const x = Array.isArray(trace?.x) ? trace.x : [];
    const y = Array.isArray(trace?.y) ? trace.y : [];
    const length = Math.max(x.length, y.length);
    const lines = ['index,x,y'];
    for (let i = 0; i < length; i += 1) {
      lines.push(`${i + 1},${formatCsvValue(x[i])},${formatCsvValue(y[i])}`);
    }
    return lines.join('\n');
  };

  const buildSpreadsheetCsv = (content) => {
    if (!content) return '';
    const columns = ensureArray(content.columns);
    const rows = ensureArray(content.rows);
    if (!columns.length) return '';
    const header = columns.map((col) => formatCsvValue(col.label || col.id));
    const lines = [header.join(',')];
    rows.forEach((row) => {
      const values = columns.map((col) => formatCsvValue(row?.[col.id]));
      lines.push(values.join(','));
    });
    return lines.join('\n');
  };

  const extractMarkdownText = (content) => {
    if (!content) return '';
    if (typeof content.text === 'string') return content.text;
    if (content.data && typeof content.data.text === 'string') return content.data.text;
    return '';
  };

  const decodeDataUrl = (dataUrl) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const base64 = match[2];
    const atobFn = typeof window !== 'undefined' && typeof window.atob === 'function'
      ? window.atob
      : typeof atob === 'function'
        ? atob
        : null;
    if (!atobFn) return null;
    try {
      const binary = atobFn(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      let extension = 'bin';
      if (mime.includes('png')) extension = 'png';
      else if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
      else if (mime.includes('gif')) extension = 'gif';
      else if (mime.includes('svg')) extension = 'svg';
      return { bytes, mime, extension };
    } catch {
      return null;
    }
  };

  const createOneClickBundleBlob = () => {
    if (!snapshotManager) {
      throw new Error('Snapshot manager unavailable');
    }
    const snapshot = snapshotManager.snapshot();
    const panels = panelsModel.getPanelsInIndexOrder();
    const metadata = buildBundleMetadata(panels);
    const assets = buildViewerAssets();
    const zip = createZipBuilder();
    zip.addTextFile('index.html', assets.html);
    zip.addTextFile('viewer.css', assets.css);
    zip.addTextFile('viewer.js', assets.js);
    zip.addTextFile('snapshot.json', JSON.stringify(snapshot, null, 2));
    zip.addTextFile('metadata.json', JSON.stringify(metadata, null, 2));
    zip.addTextFile('README.txt', buildBundleReadme(metadata));
    return zip.toBlob();
  };

  const makeBundleFilename = (prefix = 'workspace-bundle') =>
    `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

  let bundleInFlight = false;

  const handleOneClickBundle = async () => {
    if (bundleInFlight) {
      showToast('Bundle already in progress…', 'info');
      return;
    }
    const panels = panelsModel.getPanelsInIndexOrder();
    if (!panels.length) {
      showToast('Add at least one panel before bundling.', 'info');
      return;
    }
    bundleInFlight = true;
    showToast('Preparing workspace bundle…', 'info', 3200);
    try {
      const blob = createOneClickBundleBlob();
      downloadBlob(blob, makeBundleFilename());
      showToast('Workspace bundle downloaded.', 'success');
    } catch (error) {
      console.error('Failed to create workspace bundle', error);
      showToast('Failed to build bundle.', 'danger');
    } finally {
      bundleInFlight = false;
    }
  };

  const buildPanelExportFiles = (record, dir) => {
    const files = [];
    const type = record.type || 'panel';
    if (type === 'plot') {
      const figure = panelsModel.getPanelFigure(record.id) || record.figure || { data: [], layout: {} };
      files.push({
        name: `${dir}/figure.json`,
        data: JSON.stringify({
          data: ensureArray(figure.data),
          layout: figure.layout || {}
        }, null, 2)
      });
      ensureArray(figure.data).forEach((trace, idx) => {
        files.push({
          name: `${dir}/trace-${String(idx + 1).padStart(2, '0')}.csv`,
          data: buildTraceCsv(trace)
        });
      });
    } else if (type === 'markdown') {
      const text = extractMarkdownText(getPanelContent(record.id) || record.content || {});
      files.push({
        name: `${dir}/note.md`,
        data: text || '# Markdown note\n'
      });
    } else if (type === 'spreadsheet') {
      const content = getPanelContent(record.id) || record.content || {};
      files.push({
        name: `${dir}/sheet.json`,
        data: JSON.stringify(content, null, 2)
      });
      files.push({
        name: `${dir}/sheet.csv`,
        data: buildSpreadsheetCsv(content)
      });
    } else if (type === 'image') {
      const content = getPanelContent(record.id) || record.content || {};
      if (content?.dataUrl) {
        const decoded = decodeDataUrl(content.dataUrl);
        if (decoded?.bytes) {
          files.push({
            name: `${dir}/image.${decoded.extension}`,
            data: decoded.bytes
          });
        }
      }
      if (content?.description) {
        files.push({
          name: `${dir}/image.txt`,
          data: content.description
        });
      }
    } else {
      const content = getPanelContent(record.id) || record.content || {};
      files.push({
        name: `${dir}/panel.json`,
        data: JSON.stringify({ record, content }, null, 2)
      });
    }
    return files;
  };

  const createWorkspaceBackupBlob = () => {
    if (!snapshotManager) {
      throw new Error('Snapshot manager unavailable');
    }
    const payload = {
      schema: 'ftir-workspace',
      version: 1,
      exported_at: new Date().toISOString(),
      title: document.body?.dataset?.activeCanvasTitle || 'Untitled canvas',
      snapshot: snapshotManager.snapshot()
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  };

  const createItemsArchiveBlob = () => {
    if (!snapshotManager) {
      throw new Error('Snapshot manager unavailable');
    }
    const panels = panelsModel.getPanelsInIndexOrder();
    const metadata = buildBundleMetadata(panels);
    const zip = createZipBuilder();
    zip.addTextFile('snapshot.json', JSON.stringify(snapshotManager.snapshot(), null, 2));
    zip.addTextFile('metadata.json', JSON.stringify(metadata, null, 2));
    const readme = [
      'FTIR-UI individual panel export',
      '--------------------------------',
      `Panels: ${metadata.panelCount}`,
      `Generated: ${metadata.generatedAt}`,
      '',
      'Each folder under /panels contains files for a single workspace panel.'
    ].join('\n');
    zip.addTextFile('README.txt', readme);
    panels.forEach((record, idx) => {
      const slug = slugifyName(resolvePanelTitle(record), `panel-${idx + 1}`);
      const dir = `panels/${String(idx + 1).padStart(2, '0')}-${slug}`;
      buildPanelExportFiles(record, dir).forEach((file) => {
        zip.addFile(file.name, file.data);
      });
    });
    return zip.toBlob();
  };

  const handleWorkspaceBackup = async () => {
    try {
      const blob = createWorkspaceBackupBlob();
      downloadBlob(blob, `${slugifyName(document.body?.dataset?.activeCanvasTitle || 'workspace', 'workspace')}-${Date.now()}.ben`);
      showToast('Workspace backup downloaded.', 'success');
    } catch (error) {
      console.error('Backup failed', error);
      showToast('Backup unavailable.', 'danger');
    }
  };

  const handleExportItemsZip = async () => {
    const panels = panelsModel.getPanelsInIndexOrder();
    if (!panels.length) {
      showToast('No panels to export.', 'info');
      return;
    }
    try {
      const blob = createItemsArchiveBlob();
      downloadBlob(blob, `workspace-items-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
      showToast('Individual panel archive downloaded.', 'success');
    } catch (error) {
      console.error('Export items failed', error);
      showToast('Failed to export panels.', 'danger');
    }
  };

  const getCanvasBounds = () => {
    if (!canvasWrapper || typeof canvasWrapper.getBoundingClientRect !== 'function') {
      return { width: 1200, height: 720 };
    }
    const rect = canvasWrapper.getBoundingClientRect();
    return {
      width: Math.max(320, Math.round(rect.width)),
      height: Math.max(320, Math.round(rect.height))
    };
  };

  const computeCommonPanelSizing = (panels = [], {
    minWidth = 320,
    maxWidth = 960,
    minHeight = 220,
    maxHeight = 720,
    targetRatio = 0.6
  } = {}) => {
    const bounds = getCanvasBounds();
    const baselineWidth = Math.max(minWidth, Math.min(bounds.width * targetRatio, maxWidth));
    const baselineHeight = Math.max(minHeight, Math.min(baselineWidth * 0.6, maxHeight));
    const scaledWidth = Math.max(1, Math.round(baselineWidth * 0.5));
    const scaledHeight = Math.max(1, Math.round(baselineHeight * 0.5));
    return {
      canvas: bounds,
      width: scaledWidth,
      height: scaledHeight,
      cascadeOffset: {
        x: Math.round(Math.min(80, scaledWidth * 0.1)),
        y: Math.round(Math.min(60, scaledHeight * 0.15))
      },
      tile: {
        gutter: 16,
        columns: Math.max(1, Math.floor(bounds.width / (scaledWidth + 16)))
      },
      count: panels.length
    };
  };

  const ARRANGE_INCLUDE_ALL_KEY = 'ftirui_arrange_include_all_panels';
  let arrangeIncludeAllPanels = false;
  const canUseStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  if (canUseStorage) {
    try {
      arrangeIncludeAllPanels = window.localStorage.getItem(ARRANGE_INCLUDE_ALL_KEY) === '1';
    } catch {
      arrangeIncludeAllPanels = false;
    }
  }
  const syncArrangeToggle = () => {
    if (!alignIncludeAllToggle) return;
    alignIncludeAllToggle.classList.toggle('is-active', arrangeIncludeAllPanels);
    const icon = alignIncludeAllToggle.querySelector('i');
    if (icon) {
      icon.className = arrangeIncludeAllPanels ? 'bi bi-check-square-fill' : 'bi bi-square';
    }
    alignIncludeAllToggle.setAttribute('aria-pressed', String(arrangeIncludeAllPanels));
  };
  const setArrangeIncludeAllPanels = (next) => {
    arrangeIncludeAllPanels = !!next;
    if (canUseStorage) {
      try {
        window.localStorage.setItem(ARRANGE_INCLUDE_ALL_KEY, arrangeIncludeAllPanels ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
    syncArrangeToggle();
  };
  syncArrangeToggle();

  let imagePickerInput = null;
  const ensureImagePickerInput = () => {
  if (imagePickerInput) return imagePickerInput;
  if (typeof document === 'undefined') return null;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', (event) => {
      const files = event.target?.files;
      handleImageFiles(files);
      input.value = '';
    });
  imagePickerInput = input;
  return input;
};

const createImagePanelFromData = (name, dataUrl, { silent = false } = {}) => {
  const panelTitle = (typeof name === 'string' && name.trim()) ? name.trim() : 'Image';
  const addPanel = (width = 520, height = 420) => createPanelOfType('image', {
    title: panelTitle,
    width,
    height,
    content: {
      kind: 'image',
      version: 1,
      name: panelTitle,
      dataUrl
    }
  });
  const tempImg = new Image();
  tempImg.crossOrigin = 'anonymous';
  tempImg.onload = () => {
    const naturalWidth = Math.max(1, tempImg.naturalWidth || 600);
    const naturalHeight = Math.max(1, tempImg.naturalHeight || 400);
    const ratio = naturalHeight / naturalWidth;
    const maxWidth = 960;
    const minWidth = 260;
    let width = naturalWidth;
    if (width > maxWidth) width = maxWidth;
    if (width < minWidth) width = minWidth;
    let height = Math.round(width * ratio);
    const minHeight = 220;
    const maxHeight = 720;
    if (height < minHeight) height = minHeight;
    if (height > maxHeight) height = maxHeight;
    addPanel(Math.round(width), Math.round(height));
    if (!silent) {
      showToast(`Image "${panelTitle}" added to workspace.`, 'success');
    }
  };
  tempImg.onerror = () => {
    addPanel();
    if (!silent) {
      showToast(`Image "${panelTitle}" added, size detection failed.`, 'warning');
    }
  };
  tempImg.src = dataUrl;
};

const fetchRemoteImageAsDataUrl = async (url) => {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Fetched image is empty.');
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read fetched image.'));
    reader.readAsDataURL(blob);
  });
};

  const handleImageFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    files.forEach((file) => {
      if (!file.type || !file.type.startsWith('image/')) {
        showToast(`${file?.name || 'File'} is not an image.`, 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) {
          showToast(`Could not load ${file?.name || 'image'}.`, 'danger');
          return;
        }
        createImagePanelFromData(file?.name || 'Image', dataUrl);
      };
      reader.onerror = () => {
        showToast(`Failed to read ${file?.name || 'image'}.`, 'danger');
      };
      reader.readAsDataURL(file);
    });
  };

  const openImagePicker = () => {
    const input = ensureImagePickerInput();
    if (input) {
      input.click();
    } else {
      showToast('Image picker unavailable.', 'danger');
    }
  };

  const updateToolbarMetrics = () => {
    if (!canvasWrapper) return;
    const toolbarHeight = topToolbar ? Math.round(topToolbar.getBoundingClientRect().height) : 0;
    const toolbarWidth = verticalToolbar
      && !verticalToolbar.hidden
      && verticalToolbar.dataset.toolbarFloating !== 'true'
      ? Math.round(verticalToolbar.getBoundingClientRect().width)
      : 0;
    canvasWrapper.style.setProperty('--workspace-toolbar-height', `${toolbarHeight}px`);
    canvasWrapper.style.setProperty('--workspace-toolbar-vertical-width', `${toolbarWidth}px`);
  };

  function updateOperationsToggleState() {
    if (!operationsToggleButton) return;
    const labelText = operationsVisible ? 'Hide operations log' : 'Show operations log';
    operationsToggleButton.textContent = operationsVisible ? '×' : 'Ops';
    operationsToggleButton.setAttribute('aria-pressed', String(operationsVisible));
    operationsToggleButton.setAttribute('aria-label', labelText);
    operationsToggleButton.setAttribute('title', labelText);
    operationsToggleButton.classList.toggle('is-active', operationsVisible);
  }

  function syncOperationsVisibility() {
    if (operationsPanelHandles?.root) {
      operationsPanelHandles.root.hidden = !operationsVisible;
      operationsPanelHandles.root.setAttribute('aria-hidden', String(!operationsVisible));
    }
    updateOperationsToggleState();
  }

  function toggleOperationsVisibility(force = null) {
    const next = typeof force === 'boolean' ? force : !operationsVisible;
    operationsVisible = next;
    ensureOperationsPanel();
    syncOperationsVisibility();
  }

  function ensureHudButtons() {
    if (!canvasWrapper) return null;
    if (hudButtonsHandles?.container?.isConnected) {
      return hudButtonsHandles;
    }
    hudButtonsHandles = createHudButtons({
      canvasWrapper,
      onToggleOperations: () => toggleOperationsVisibility(),
      onToggleDevMode: () => handleDevToggle(),
      onToggleCdp: () => toggleCdpPanel(),
      onToggleGhost: () => toggleGhostMode(),
      onToggleCollapse: (collapsed) => {
        /* no-op for now; reserved for future behavior */
      },
      devModeEnabled,
      ghostModeEnabled
    });
    operationsToggleButton = hudButtonsHandles?.operationsBtn ?? operationsToggleButton;
    devToggleButton = hudButtonsHandles?.devBtn ?? devToggleButton;
    cdpToggleButton = hudButtonsHandles?.cdpBtn ?? cdpToggleButton;
    ghostToggleButton = hudButtonsHandles?.ghostBtn ?? ghostToggleButton;
    registerGhostHoverHandlers(hudButtonsHandles?.container);
    updateOperationsToggleState();
    updateDevToggleState();
    hudButtonsHandles?.updateGhostState?.(ghostModeEnabled);
    if (cdpToggleButton) {
      cdpToggleButton.classList.toggle('is-active', cdpModeEnabled);
    }
    return hudButtonsHandles;
  }

  function ensureOperationsToggle() {
    ensureHudButtons();
    return operationsToggleButton;
  }

  function ensureDevToggle() {
    ensureHudButtons();
    return devToggleButton;
  }

  function updateDevToggleState() {
    if (!devToggleButton) return;
    const label = devModeEnabled ? 'Disable dev mode' : 'Enable dev mode';
    devToggleButton.setAttribute('aria-pressed', String(devModeEnabled));
    devToggleButton.setAttribute('aria-label', label);
    devToggleButton.setAttribute('title', label);
    devToggleButton.classList.toggle('is-active', devModeEnabled);
    hudButtonsHandles?.updateDevState?.(devModeEnabled);
  }

  function handleDevToggle() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const hasDev = url.searchParams.get('dev') === 'true';
    if (hasDev) {
      url.searchParams.delete('dev');
    } else {
      url.searchParams.set('dev', 'true');
    }
    devModeEnabled = !hasDev;
    updateDevToggleState();
    if (devToggleButton) {
      devToggleButton.disabled = true;
    }
    window.location.assign(url.toString());
  }

  function toggleCdpPanel() {
    setCdpPanelVisible(!cdpVisible);
  }

  function setCdpPanelVisible(enabled) {
    if (cdpVisible === enabled) return;
    cdpVisible = enabled;
    cdpModeEnabled = enabled;
    if (cdpToggleButton) {
      cdpToggleButton.classList.toggle('is-active', enabled);
      cdpToggleButton.setAttribute('aria-pressed', String(enabled));
    }
    const panel = enabled ? ensureCdpPanel() : cdpPanelEl;
    if (!panel) return;
    if (enabled) {
      renderCdpPanel(panel);
      panel.classList.add('is-visible');
    } else {
      panel.classList.remove('is-visible');
    }
  }

  function toggleGhostMode() {
    setGhostMode(!ghostModeEnabled);
  }

  function setGhostMode(enabled) {
    if (ghostModeEnabled === enabled) return;
    ghostModeEnabled = enabled;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('workspace-ghost-mode', enabled);
      if (!enabled) {
        document.body.classList.remove('workspace-ghost-hover');
      }
    }
    hudButtonsHandles?.updateGhostState?.(enabled);
  }

  function registerGhostHoverHandlers(container) {
    if (!container || container.dataset.ghostHover === 'true') return;
    if (typeof document === 'undefined') return;
    container.dataset.ghostHover = 'true';
    container.addEventListener('mouseenter', () => {
      if (!ghostModeEnabled) return;
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('workspace-ghost-hover');
      }
    });
    container.addEventListener('mouseleave', () => {
      if (!ghostModeEnabled) return;
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('workspace-ghost-hover');
      }
    });
  }

  function ensureCdpPanel() {
    if (cdpPanelEl?.isConnected) return cdpPanelEl;
    if (typeof document === 'undefined') return null;
    const panel = document.createElement('section');
    panel.className = 'workspace-cdp-panel';
    const header = document.createElement('div');
    header.className = 'workspace-cdp-panel__header';
    const title = document.createElement('span');
    title.textContent = 'Canvas data';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-sm btn-outline-secondary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => setCdpPanelVisible(false));
    header.append(title, closeBtn);
    const content = document.createElement('div');
    content.className = 'workspace-cdp-panel__content';
    panel.append(header, content);
    document.body.appendChild(panel);
    cdpPanelEl = panel;
    return panel;
  }

  function renderCdpPanel(panel) {
    if (!panel) return;
    const content = panel.querySelector('.workspace-cdp-panel__content');
    if (!content) return;
    content.innerHTML = '';
    const snapshot = snapshotManager?.snapshot?.();
    if (!snapshot) {
      const empty = document.createElement('div');
      empty.className = 'workspace-cdp-panel__empty';
      empty.textContent = 'No canvas snapshot available.';
      content.appendChild(empty);
      return;
    }
    const panelRows = buildCdpPanelRows(snapshot);
    const traceRows = buildCdpTraceRows(panelRows);
    const sectionRows = buildCdpSectionRows(snapshot);
    const figureRows = buildCdpFigureRows(snapshot);
    const uiPrefRows = buildCdpUiPrefRows(snapshot);
    const layoutRows = buildCdpLayoutRows(panelRows);
    const axisRows = buildCdpAxisRows(panelRows);
    const metadataRows = buildCdpMetadataRows(snapshot);

    const sections = [
      buildCdpTableSection('Panels', panelRows, ['ID', 'Title', 'Section', 'Geometry', 'Traces', 'Files'], (row) => [
        row.id,
        row.title,
        row.section,
        row.geometry,
        String(row.traceCount),
        row.files || '—'
      ], 'Add graphs to inspect their metadata.'),
      buildCdpTableSection('Traces', traceRows, ['Panel', 'Trace ID', 'Name', 'File', 'Color'], (row) => [
        row.panel,
        row.id,
        row.name,
        row.file || '—',
        row.color || '—'
      ], 'No trace data yet.'),
      buildCdpTableSection('Sections', sectionRows, ['ID', 'Name', 'Description', 'Panels'], (row) => [
        row.id,
        row.name,
        row.description || '—',
        String(row.panelCount)
      ], 'No sections available.'),
      buildCdpTableSection('Figures', figureRows, ['Key', 'Series', 'Approx. points', 'Layout keys'], (row) => [
        row.key,
        String(row.series),
        String(row.points),
        String(row.layoutKeys)
      ], 'No cached figure data.'),
      buildCdpTableSection('Layout', layoutRows, ['Panel', 'Mode', 'Legend', 'Margin'], (row) => [
        row.panel,
        row.mode,
        row.legend,
        row.margin
      ], 'No layout data recorded.'),
      buildCdpTableSection('Axes', axisRows, ['Panel', 'Axis', 'Range', 'Title', 'Options'], (row) => [
        row.panel,
        row.axis,
        row.range,
        row.title,
        row.options
      ], 'No axis data available.'),
      buildCdpTableSection('UI Preferences', uiPrefRows, ['Preference', 'Value'], (row) => [
        row.key,
        row.value
      ], 'No UI preferences recorded.'),
      buildCdpTableSection('Snapshot metadata', metadataRows, ['Key', 'Value'], (row) => [
        row.key,
        row.value
      ], 'No snapshot metadata.')
    ];
    sections.forEach((section) => content.appendChild(section));
  }

  function buildCdpPanelRows(snapshot) {
    const panels = resolveArray(snapshot?.panels?.items) || resolveArray(snapshot?.panels) || [];
    const sections = resolveArray(snapshot?.sections?.items) || resolveArray(snapshot?.sections) || [];
    const sectionMap = new Map();
    sections.forEach((section) => {
      sectionMap.set(section?.id, section?.name || 'Untitled');
    });
    return panels.map((panel, index) => {
      const traces = resolveTraces(panel);
      const layout = panel?.layout || panel?.figure?.layout || null;
      const fileNames = traces
        .map((trace) => trace?.file?.name || trace?.name || null)
        .filter(Boolean);
      const filesDisplay =
        fileNames.length > 3
          ? `${fileNames.slice(0, 3).join(', ')}…`
          : fileNames.join(', ');
      return {
        id: panel?.id || `panel_${index + 1}`,
        title: panel?.title || `Panel ${index + 1}`,
        section: sectionMap.get(panel?.sectionId) || 'Unassigned',
        geometry: formatGeometry(panel?.geometry),
        traceCount: traces.length,
        files: filesDisplay || (traces.length ? '—' : ''),
        traces,
        layout,
        axes: layout ? extractAxes(layout) : [],
        metadata: panel?.meta || panel?.metadata || null
      };
    });
  }

  function buildCdpTraceRows(panelRows) {
    const rows = [];
    panelRows.forEach((panel) => {
      panel.traces.forEach((trace, idx) => {
        rows.push({
          panel: panel.title,
          id: trace?.id || `${panel.id}_trace_${idx + 1}`,
          name: trace?.name || 'Untitled trace',
          file: trace?.file?.name || trace?.file?.path || '',
          color: trace?.style?.color || trace?.line?.color || trace?.marker?.color || ''
        });
      });
    });
    return rows;
  }

  function buildCdpSectionRows(snapshot) {
    const sections = resolveArray(snapshot?.sections?.items) || resolveArray(snapshot?.sections) || [];
    const panels = resolveArray(snapshot?.panels?.items) || resolveArray(snapshot?.panels) || [];
    const panelCounts = new Map();
    panels.forEach((panel) => {
      const sectionId = panel?.sectionId || 'unassigned';
      panelCounts.set(sectionId, (panelCounts.get(sectionId) || 0) + 1);
    });
    return sections.map((section) => ({
      id: section?.id || 'section',
      name: section?.name || 'Untitled',
      description: section?.description || '',
      panelCount: panelCounts.get(section?.id) || 0
    }));
  }

  function buildCdpFigureRows(snapshot) {
    const figures = snapshot?.figures && typeof snapshot.figures === 'object' ? snapshot.figures : {};
    return Object.keys(figures).map((key) => {
      const figure = figures[key];
      const series = Array.isArray(figure?.data) ? figure.data.length : 0;
      const points = Array.isArray(figure?.data)
        ? figure.data.reduce((sum, trace) => {
            const xLen = Array.isArray(trace?.x) ? trace.x.length : 0;
            const yLen = Array.isArray(trace?.y) ? trace.y.length : 0;
            return sum + Math.max(xLen, yLen);
          }, 0)
        : 0;
      const layoutKeys = figure?.layout && typeof figure.layout === 'object' ? Object.keys(figure.layout).length : 0;
      return {
        key,
        series,
        points,
        layoutKeys
      };
    });
  }

  function buildCdpUiPrefRows(snapshot) {
    const prefs = snapshot?.uiPrefs && typeof snapshot.uiPrefs === 'object' ? snapshot.uiPrefs : {};
    const rows = [];
    const traverse = (value, prefix) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach((innerKey) => traverse(value[innerKey], `${prefix}${innerKey}.`));
      } else {
        rows.push({
          key: prefix.replace(/\.$/, ''),
          value: formatValue(value)
        });
      }
    };
    Object.keys(prefs).forEach((key) => traverse(prefs[key], `${key}.`));
    return rows;
  }

  function buildCdpLayoutRows(panelRows) {
    return panelRows
      .filter((panel) => panel.layout)
      .map((panel) => ({
        panel: panel.title,
        mode: panel.layout?.dragmode || panel.layout?.hovermode || 'default',
        legend: formatValue(panel.layout?.legend),
        margin: formatValue(panel.layout?.margin)
      }));
  }

  function buildCdpAxisRows(panelRows) {
    const rows = [];
    panelRows.forEach((panel) => {
      panel.axes.forEach((axis) => {
        rows.push({
          panel: panel.title,
          axis: axis.id,
          range: axis.range,
          title: axis.title,
          options: axis.options
        });
      });
    });
    return rows;
  }

  function buildCdpMetadataRows(snapshot) {
    const base = { ...snapshot };
    ['panels', 'sections', 'figures', 'uiPrefs'].forEach((key) => delete base[key]);
    return Object.keys(base).map((key) => ({
      key,
      value: formatValue(base[key])
    }));
  }

  function resolveTraces(panel) {
    if (Array.isArray(panel?.traces?.items)) return panel.traces.items;
    if (Array.isArray(panel?.traces)) return panel.traces;
    if (Array.isArray(panel?.figure?.traces)) return panel.figure.traces;
    if (Array.isArray(panel?.figure?.data)) {
      return panel.figure.data.map((trace) => ({
        id: trace?.id,
        name: trace?.name,
        file: trace?.file,
        style: {
          color: trace?.line?.color || trace?.marker?.color
        }
      }));
    }
    return [];
  }

  function extractAxes(layout) {
    const axes = [];
    Object.keys(layout).forEach((key) => {
      if (!key.startsWith('xaxis') && !key.startsWith('yaxis')) return;
      const axis = layout[key];
      if (!axis) return;
      axes.push({
        id: key.toUpperCase(),
        range: formatValue(axis.range || axis.autorange),
        title: axis.title?.text || '—',
        options: formatValue({
          showgrid: axis.showgrid,
          zeroline: axis.zeroline,
          ticks: axis.ticks,
          mirror: axis.mirror
        })
      });
    });
    return axes;
  }

  function buildCdpTableSection(title, rows, headers, mapRow, emptyText) {
    const section = document.createElement('section');
    section.className = 'workspace-cdp-panel__section';
    const heading = document.createElement('div');
    heading.className = 'workspace-cdp-panel__section-title';
    heading.textContent = `${title} (${rows.length})`;
    section.appendChild(heading);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'workspace-cdp-panel__empty';
      empty.textContent = emptyText || 'No data available.';
      section.appendChild(empty);
      return section;
    }
    const table = document.createElement('table');
    table.className = 'workspace-cdp-table table table-sm mb-0';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      mapRow(row).forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    section.appendChild(table);
    return section;
  }

  function resolveArray(value) {
    if (Array.isArray(value)) return value;
    return [];
  }

  function formatGeometry(geometry) {
    if (!geometry || typeof geometry !== 'object') return '—';
    const { x = 0, y = 0, w = 0, h = 0 } = geometry;
    return `x:${x} y:${y} w:${w} h:${h}`;
  }

  function formatValue(value) {
    if (value == null) return '—';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function createAutosaveIndicatorController() {
    if (typeof document === 'undefined') return null;
    const container = document.getElementById('autosave_indicator');
    if (!container) return null;
    const icon = container.querySelector('.autosave-icon');
    const text = container.querySelector('.autosave-text');
    let hideTimer = null;

    const setStatus = (status, message) => {
      if (!container) return;
      const normalized = status || 'idle';
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      const defaultText =
        normalized === 'saving'
          ? 'Autosaving...'
          : normalized === 'saved'
            ? 'Autosaved'
            : normalized === 'error'
              ? 'Autosave failed'
              : '';
      if (text) {
        text.textContent = message || defaultText;
      }
      if (icon) {
        const base = ['autosave-icon', 'bi'];
        let iconName = '';
        let spinning = false;
        if (normalized === 'saving') {
          iconName = 'bi-cloud-arrow-up';
          spinning = true;
        } else if (normalized === 'saved') {
          iconName = 'bi-cloud-check';
        } else if (normalized === 'error') {
          iconName = 'bi-exclamation-triangle';
        }
        if (iconName) base.push(iconName);
        if (spinning) base.push('spin');
        icon.className = base.join(' ');
      }
      container.classList.remove('is-saving', 'is-error');
      if (normalized === 'saving' || normalized === 'saved' || normalized === 'error') {
        container.classList.add('is-visible');
        if (normalized === 'saving') {
          container.classList.add('is-saving');
        } else if (normalized === 'error') {
          container.classList.add('is-error');
        }
      } else {
        container.classList.remove('is-visible');
      }
      if (normalized === 'saved') {
        hideTimer = setTimeout(() => {
          container.classList.remove('is-visible');
          container.classList.remove('is-saving', 'is-error');
        }, 2400);
      }
    };

    return { setStatus };
  }

  function ensureOperationsPanel() {
    if (!canvasWrapper) return null;
    ensureHudButtons();
    if (operationsPanelHandles?.root?.isConnected) {
      ensureOperationsToggle();
      ensureDevToggle();
      if (operationsToggleButton && operationsPanelHandles.root.id) {
        operationsToggleButton.setAttribute('aria-controls', operationsPanelHandles.root.id);
      }
      syncOperationsVisibility();
      return operationsPanelHandles;
    }
    const panel = document.createElement('aside');
    panel.className = 'workspace-operations-panel';
    panel.id = 'c_workspace_operations';
    const header = document.createElement('div');
    header.className = 'workspace-operations-panel__header';
    header.textContent = 'Operations';
    const list = document.createElement('div');
    list.className = 'workspace-operations-panel__list';
    panel.append(header, list);
    canvasWrapper.appendChild(panel);
    operationsPanelHandles = { root: panel, header, list };
    ensureOperationsToggle();
    ensureDevToggle();
    if (operationsToggleButton) {
      operationsToggleButton.setAttribute('aria-controls', panel.id);
    }
    syncOperationsVisibility();
    return operationsPanelHandles;
  }

const shortenSource = (value) => {
  if (!value) return '';
  let text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  const parenIndex = text.indexOf('(');
  if (parenIndex >= 0) {
    const inner = text.slice(parenIndex + 1);
    const closing = inner.lastIndexOf(')');
    text = closing >= 0 ? inner.slice(0, closing) : inner;
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      text = text.replace(window.location.origin, '');
    }
  } catch {
    /* ignore */
  }
  text = text.replace(/\s+at\s+/gi, '').trim();
  if (text.length > 120) {
    return `${text.slice(0, 117)}…`;
  }
  return text;
};

const describeHistoryStatus = (delta) => {
  if (delta == null) return '—';
  if (delta === 0) return 'Merged';
  if (delta > 0) return 'Added';
  if (delta < 0) return 'Rewind';
  return '—';
};

const STATUS_LABELS = new Set(['added', 'merged', 'rewind', 'state change']);

const extractInlineStatus = (value) => {
  const fallback = typeof value === 'string' ? value.trim() : '';
  if (!fallback) {
    return { text: '', inlineStatus: null };
  }
  const match = fallback.match(/\(([^)]+)\)\s*$/);
  if (!match) {
    return { text: fallback, inlineStatus: null };
  }
  const candidate = match[1]?.trim() ?? '';
  if (!candidate || !STATUS_LABELS.has(candidate.toLowerCase())) {
    return { text: fallback, inlineStatus: null };
  }
  const trimmedText = fallback.slice(0, match.index).trim();
  return {
    text: trimmedText || fallback,
    inlineStatus: candidate
  };
};

const formatDelta = (value) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
};

const buildOperationDetail = (meta = {}) => {
  if (!meta) return '';
  if (typeof meta.detail === 'string' && meta.detail.trim()) {
    return meta.detail.trim();
  }
  if (meta.action === 'panel-resize' && meta.deltas) {
    return `ΔW ${formatDelta(meta.deltas.width)}px, ΔH ${formatDelta(meta.deltas.height)}px`;
  }
  if (meta.action === 'panel-drag' && meta.deltas) {
    return `ΔX ${formatDelta(meta.deltas.x)}px, ΔY ${formatDelta(meta.deltas.y)}px`;
  }
  if (meta.action && meta.value !== undefined) {
    return `${meta.action}: ${meta.value}`;
  }
  return '';
};

const annotateOperationMeta = (operationId, nextMeta = {}) => {
  if (!operationId || !operationsLog.length) return;
  const target = operationsLog.find((entry) => entry.meta?.operationId === operationId);
  if (!target) return;
  target.meta = {
    ...(target.meta || {}),
    ...(nextMeta || {})
  };
  scheduleOperationsRender();
};

const normalizeHistoryInfo = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const result = {
      label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null,
      meta: value.meta && typeof value.meta === 'object' ? { ...value.meta } : null
    };
    return result;
  }
  return {
    label: typeof value === 'string' && value.trim() ? value.trim() : null,
    meta: null
  };
};

const renderOperationsLog = () => {
  operationsRenderQueued = false;
  const handles = ensureOperationsPanel();
  if (!handles) return;
  const listEl = handles.list;
  listEl.innerHTML = '';
  if (!operationsLog.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-operations-panel__empty';
    empty.textContent = 'No operations yet.';
    listEl.appendChild(empty);
    syncOperationsVisibility();
    return;
  }
  const table = document.createElement('table');
  table.className = 'workspace-operations-panel__table';

  const headRow = document.createElement('tr');
  ['Time', 'Operation', 'Status', 'Details', 'Location'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.appendChild(th);
  });
  const thead = document.createElement('thead');
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  operationsLog.forEach((entry) => {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    const timeText = Number.isFinite(entry.timestamp)
      ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';
    timeCell.textContent = timeText || '—';
    timeCell.title = timeText || '—';

    const opCell = document.createElement('td');
    const { text: cleanLabel, inlineStatus } = extractInlineStatus(entry.label || 'Operation');
    const operationLabel = cleanLabel || 'Operation';
    opCell.textContent = operationLabel;
    const historyDelta = typeof entry?.meta?.historyDelta === 'number' ? entry.meta.historyDelta : null;
    const titleParts = [operationLabel];
    if (historyDelta != null) {
      const signedDelta = historyDelta > 0 ? `+${historyDelta}` : `${historyDelta}`;
      titleParts.push(`Δhistory ${signedDelta}`);
    }
    if (typeof entry?.meta?.historySize === 'number') {
      titleParts.push(`history size ${entry.meta.historySize}`);
    }
    if (typeof entry?.meta?.futureSize === 'number') {
      titleParts.push(`future size ${entry.meta.futureSize}`);
    }
    opCell.title = titleParts.join(' • ');

    const statusCell = document.createElement('td');
    const metaStatus = typeof entry?.meta?.status === 'string' ? entry.meta.status.trim() : null;
    const statusCandidates = [
      describeHistoryStatus(historyDelta),
      metaStatus,
      inlineStatus
    ].filter(Boolean);
    const statusText = statusCandidates.find((value) => value && value !== '—') || '—';
    if (statusText && statusText !== '—') {
      titleParts.push(`status ${statusText}`);
    }
    statusCell.textContent = statusText;
    statusCell.title = statusText;

    const detailCell = document.createElement('td');
    const detailText = buildOperationDetail(entry.meta);
    detailCell.textContent = detailText || '—';
    detailCell.title = detailText || '—';

    const locationCell = document.createElement('td');
    const locationText = entry.source ? shortenSource(entry.source) : '—';
    locationCell.textContent = locationText;
    locationCell.title = entry.source || locationText || '—';

    row.append(timeCell, opCell, statusCell, detailCell, locationCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  listEl.appendChild(table);
  syncOperationsVisibility();
};

  const scheduleOperationsRender = () => {
    if (operationsRenderQueued) return;
    operationsRenderQueued = true;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(renderOperationsLog);
    } else {
      setTimeout(renderOperationsLog, 0);
    }
  };

  const deriveLabelFromSource = (source) => {
    if (!source) return null;
    let head = source.trim();
    if (!head) return null;
    const parenIdx = head.indexOf('(');
    if (parenIdx > 0) {
      head = head.slice(0, parenIdx).trim();
    }
    if (!head) return null;
    if (head.includes('/')) {
      // stack frame without explicit function name (just path)
      const parts = head.split('/');
      head = parts[parts.length - 1];
    }
    if (head.includes('.')) {
      const segments = head.split('.');
      head = segments[segments.length - 1];
    }
    head = head.replace(/^Object\./, '').replace(/^Module\./, '');
    if (!head) return null;
    if (head === '<anonymous>' || head === 'anonymous') return null;
    return head;
  };

const recordOperation = (entry) => {
  const payload = typeof entry === 'string' ? { label: entry } : (entry || {});
  const source = typeof payload.source === 'string' ? payload.source : null;
  let label = typeof payload.label === 'string' && payload.label.trim()
    ? payload.label.trim()
    : null;
  if (!label) {
    label = deriveLabelFromSource(source);
  }
  if (!label) {
    label = 'Operation';
  }
  const timestamp = Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now();
  const meta = payload.meta && typeof payload.meta === 'object' ? { ...payload.meta } : {};
  if (!meta.operationId) {
    operationSequence += 1;
    meta.operationId = `op_${Date.now()}_${operationSequence}`;
  }
  operationsLog.unshift({ label, source, timestamp, meta });
  while (operationsLog.length > OPERATIONS_LOG_LIMIT) {
    operationsLog.pop();
  }
  ensureOperationsPanel();
  scheduleOperationsRender();
  return meta.operationId;
};

  const captureOperationSource = () => {
    try {
      const err = new Error();
      if (!err.stack) return null;
      const lines = err.stack.split('\n');
      for (let i = 2; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (!line) continue;
        if (line.includes('workspaceRuntime.js')) continue;
        if (line.includes('historyHelpers.js')) continue;
        return line.replace(/^at\s+/, '');
      }
    } catch {
      /* ignore stack parsing issues */
    }
    return null;
  };

  if (!canvas || canvas.dataset.initialized === '1') return;
  canvas.dataset.initialized = '1';
  ensureOperationsPanel();

  const panelsModel = createPanelsModel();
  const panelDomRegistry = new Map();

  const registerPanelDom = (panelId, handles = {}) => {
    if (!panelId) return null;
    const existing = panelDomRegistry.get(panelId) || {};
    const runtime = handles.runtime ?? existing.runtime ?? { dragSnapshot: null, visual: null };
    const next = {
      ...existing,
      rootEl: handles.rootEl ?? existing.rootEl ?? null,
      headerEl: handles.headerEl ?? existing.headerEl ?? null,
      titleEl: handles.titleEl ?? existing.titleEl ?? null,
      plotEl: handles.plotEl ?? existing.plotEl ?? null,
      stylePainterButton: handles.stylePainterButton ?? existing.stylePainterButton ?? null,
      stylePainterPopover: handles.stylePainterPopover ?? existing.stylePainterPopover ?? null,
      contentHandles: handles.contentHandles ?? existing.contentHandles ?? null,
      runtime
    };
    panelDomRegistry.set(panelId, next);
    return next;
  };

  const getPanelDom = (panelId) => {
    if (!panelId) return null;
    return panelDomRegistry.get(panelId) || null;
  };

  const detachPanelDom = (panelId) => {
    if (!panelId) return;
    panelDomRegistry.delete(panelId);
  };

  const getPanelSnapshot = (panelId) => (panelId ? panelsModel.getPanel(panelId) : null);
  const getPanelRecord = getPanelSnapshot;
  const getTopPanelZIndex = () => {
    const snapshot = panelsModel.snapshot();
    const value = Number(snapshot?.zIndexCursor);
    return Number.isFinite(value) && value > 0 ? value : 1;
  };
  const panelSupportsPlot = (panelId) => {
    const record = getPanelRecord(panelId);
    const type = getPanelType(record?.type);
    return type?.capabilities?.plot !== false;
  };

  const getPanelFigure = (panelId) => {
    const record = getPanelRecord(panelId);
    if (!record || record.type !== 'plot') {
      return { data: [], layout: {} };
    }
    return panelsModel.getPanelFigure(panelId) || { data: [], layout: {} };
  };

    const updatePanelFigure = (panelId, figure, options = {}) => {
      const record = getPanelRecord(panelId);
      if (!record || record.type !== 'plot') return null;
      const result = panelsModel.updatePanelFigure(panelId, figure);
      templatesController?.handlePanelFigureUpdate?.(panelId, options);
      panelLockController?.handlePanelFigureUpdate?.(panelId);
      unitsToggleController?.handlePanelFigureUpdate?.(panelId, options);
      multiTraceController?.handlePanelFigureUpdate?.(panelId, options);
      return result;
    };

  const getPanelContent = (panelId) => panelsModel.getPanelContent(panelId) || null;

  const Plot = createPlotFacade({
    getPanelDom,
    getPanelFigure,
    setPanelFigure: (panelId, figure) =>
      updatePanelFigure(panelId, figure, { source: 'plot-facade' }),
    actionsController: Actions
  });

  const getPanelsOrdered = () => panelsModel.getPanelsInIndexOrder();

  const applyThemeToPlotFigure = (panelId, {
    applyPalette = false,
    reason = 'theme-refresh'
  } = {}) => {
    if (!panelId || !panelSupportsPlot(panelId)) return;
    const figure = panelsModel.getPanelFigure(panelId);
    if (!figure) return;
    const theme = getActiveTheme();
    const themedLayout = applyPlotThemeToLayout(figure.layout || {}, theme);
    let nextFigure = {
      ...figure,
      layout: themedLayout
    };
    if (applyPalette) {
      nextFigure = applyTracePaletteToFigure(nextFigure, { palette: theme?.tracePalette });
    }
    updatePanelFigure(panelId, nextFigure, { source: 'theme' });
    Plot.renderNow(panelId, { reason });
    peakMarkingController?.handleTraceStyleChange?.(panelId);
  };

  const applyThemeToAllPlotPanels = ({
    applyPalette = false,
    reason = 'theme-refresh'
  } = {}) => {
    const records = getPanelsOrdered();
    records.forEach((record) => {
      const panelId = record?.id;
      if (!panelId) return;
      if (!panelSupportsPlot(panelId)) return;
      applyThemeToPlotFigure(panelId, { applyPalette, reason });
    });
  };

  const handleThemeRuntimeUpdate = (theme, {
    reason = 'theme-change',
    reapplyPalette = true
  } = {}) => {
    setActiveTracePalette(theme?.tracePalette);
    applyThemeToDocument(theme);
    applyThemeToAllPlotPanels({ applyPalette: reapplyPalette, reason });
  };

  const initThemeRuntimeSync = () => {
    themeRuntimeUnsubscribe?.();
    themeRuntimeUnsubscribe = subscribeToThemes((theme) => {
      handleThemeRuntimeUpdate(theme || getActiveTheme(), {
        reason: 'theme-change',
        reapplyPalette: true
      });
    });
    handleThemeRuntimeUpdate(getActiveTheme(), {
      reason: 'theme-bootstrap',
      reapplyPalette: true
    });
  };
  initThemeRuntimeSync();

  const allocatePanelIndex = (preferredIndex) => {
    if (Number.isInteger(preferredIndex) && preferredIndex > 0) {
      return preferredIndex;
    }
    const used = new Set();
    getPanelsOrdered().forEach((record) => {
      const idx = Number(record?.index);
      if (Number.isInteger(idx) && idx > 0) {
        used.add(idx);
      }
    });
    let cursor = 1;
    while (used.has(cursor)) {
      cursor += 1;
    }
    return cursor;
  };

  const getPanelTraces = (panelId) => panelsModel.getPanelTraces(panelId) || [];
  // Hide overlay/peak traces from the browser tree; S3 menu controls them.
  const getBrowserPanelTraces = (panelId) => getPanelTraces(panelId).filter((trace) => trace?.meta?.peakOverlay !== true);

  const ensurePanelRuntime = (panelId) => {
    if (!panelId) return null;
    const dom = getPanelDom(panelId);
    if (!dom) return null;
    if (!dom.runtime) {
      dom.runtime = { dragSnapshot: null, visual: null };
    }
    return dom.runtime;
  };

  const getNextPanelSequence = () => allocatePanelIndex();

  const updatePanelRuntime = (panelId, patch = {}) => {
    const runtime = ensurePanelRuntime(panelId);
    if (!runtime) return null;
    Object.assign(runtime, patch);
    return runtime;
  };

let searchTerm = '';
const getSearchTerm = () => searchTerm;

const PANEL_TYPE_FILTER_KEYS = ['plot', 'markdown', 'spreadsheet', 'script', 'image'];
const PANEL_TYPE_FILTER_DEFAULTS = PANEL_TYPE_FILTER_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {});
let panelTypeFilters = { ...PANEL_TYPE_FILTER_DEFAULTS };

const getPanelTypeFiltersSnapshot = () => ({ ...panelTypeFilters });
const hasActivePanelTypeFilters = () => Object.values(panelTypeFilters).some((value) => value === false);
const areAllPanelTypesEnabled = () => PANEL_TYPE_FILTER_KEYS.every((key) => panelTypeFilters[key] !== false);
const resolvePanelTypeFilterKey = (typeId) => {
  if (typeId && Object.prototype.hasOwnProperty.call(panelTypeFilters, typeId)) {
    return typeId;
  }
  return null;
};
const isPanelTypeEnabledSelector = (typeId) => {
  const key = resolvePanelTypeFilterKey(typeId) ?? null;
  if (!key) return true;
  return panelTypeFilters[key] !== false;
};
const setPanelTypeFilter = (typeId, enabled) => {
  const key = resolvePanelTypeFilterKey(typeId) ?? null;
  if (!key) return;
  panelTypeFilters[key] = enabled !== false;
};
const setAllPanelTypeFilters = (enabled) => {
  PANEL_TYPE_FILTER_KEYS.forEach((key) => {
    panelTypeFilters[key] = enabled !== false;
  });
};

let registerPanel = () => null;
const createPanelOfType = (typeId, state = {}) => {
  const nextState = {
    ...state,
    type: typeId
  };
  return registerPanel(nextState);
};
let panelDomFacade = null;
let stylePainterController = null;
let templatesController = null;
let panelLockController = null;
let unitsToggleController = null;
let multiTraceController = null;
let techToolbarHoverController = null;
let techToolbarPinController = null;
let techToolbarHeaderVisibilityController = null;
let techToolbarModebarVisibilityController = null;
let renderBrowser = () => {};
let setActivePanel = () => {};
let updateCanvasState = () => {};
const isPanelEditLocked = (panelId) =>
  panelLockController?.isPanelEditLocked?.(panelId) ?? false;
const isPanelPinned = (panelId) =>
  panelLockController?.isPanelPinned?.(panelId) ?? false;

  const historyHelpers = createHistoryHelpers({
    pushHistory: (...args) => pushHistory(...args),
    updateHistoryButtons: (...args) => updateHistoryButtons(...args),
    persist: (...args) => persist(...args)
  });
  const registerPanelProxy = (...args) => registerPanel(...args);

  const snapshotManager = createSnapshotManager({
    panelsModel,
    sectionManager,
    historyHelpers,
    persistence: { persist },
    dom: {
      panelDomRegistry,
      detachPanelDom
    },
    registerPanel: registerPanelProxy,
    updateCanvasState,
    renderBrowser,
    setActivePanel,
    colorCursor: colorCursorManager
  });

  const flushRemoteSync = async () => {
    if (!cloudSyncEnabled || !activeCanvasId || !snapshotManager) return;
    try {
      const snapshot = snapshotManager.snapshot();
      if (!snapshot || typeof snapshot !== 'object') return;
      const title =
        (typeof document !== 'undefined' && document.body?.dataset?.activeCanvasTitle) || '';
      await saveCanvasState(activeCanvasId, {
        state: snapshot,
        version_label: title
      });
    } catch (err) {
      console.warn('Dashboard canvas sync failed', err);
    }
  };

  const scheduleCanvasSync = ({ immediate = false, reset = false } = {}) => {
    if (reset && remoteSyncTimer) {
      window.clearTimeout(remoteSyncTimer);
      remoteSyncTimer = null;
    }
    if (!cloudSyncEnabled || !activeCanvasId || !snapshotManager) return;
    if (reset) return;
    if (immediate) {
      if (remoteSyncTimer) {
        window.clearTimeout(remoteSyncTimer);
        remoteSyncTimer = null;
      }
      void flushRemoteSync();
      return;
    }
    if (remoteSyncTimer) return;
    remoteSyncTimer = window.setTimeout(() => {
      remoteSyncTimer = null;
      void flushRemoteSync();
    }, REMOTE_SYNC_DELAY_MS);
  };
  const interact = typeof window !== 'undefined' ? window.interact : null;
  ensureDefaultSection();
  if (!chipPanelsInstance && typeof document !== 'undefined') {
    chipPanelsInstance = createChipPanels(document.body);
  }

  const collectHistoryButtons = (action) => {
    if (typeof document === 'undefined') return [];
    const selectors = [`[data-history-action="${action}"]`];
    if (action === 'undo') {
      selectors.push('#c_history_undo');
    } else if (action === 'redo') {
      selectors.push('#c_history_redo');
    }
    const unique = new Set();
    selectors.forEach((selector) => {
      if (!selector) return;
      document.querySelectorAll(selector).forEach((node) => {
        if (node) {
          unique.add(node);
        }
      });
    });
    return Array.from(unique);
  };

  const historyUndoButtons = collectHistoryButtons('undo');
  const historyRedoButtons = collectHistoryButtons('redo');

  const panelDom = {
    root: document.getElementById('c_panel'),
    pin: document.getElementById('c_panel_pin'),
    toggle: document.getElementById('c_panel_toggle'),
    dropzone: document.getElementById('c_panel_dropzone'),
    empty: document.querySelector('#c_panel_dropzone .panel-empty'),
    newSection: document.getElementById('c_new_section'),
    searchInput: document.getElementById('c_panel_search_input'),
    tree: document.getElementById('c_folder_tree'),
    filterButton: document.getElementById('c_browser_filter_btn'),
    filterMenu: document.getElementById('c_browser_filter_menu'),
    filterToggles: Array.from(document.querySelectorAll('.browser-filter-toggle')),
    undo: historyUndoButtons,
    redo: historyRedoButtons
  };

  ensureOperationsPanel();
  renderOperationsLog();

  preferencesFacade = createUiPreferencesFacade({
    collapseKey: PANEL_COLLAPSE_KEY,
    pinKey: PANEL_PIN_KEY
  });

  const workspaceMenu = (() => {
    const toggle = document.getElementById('c_canvas_more_btn');
    const menu = toggle?.parentElement?.querySelector('.dropdown-menu') || null;
    if (!menu) {
      return { root: null, toggle: null, save: null, load: null, clear: null };
    }

    if (!menu.dataset.workspaceActions) {
      const preserved = Array.from(menu.children);
      menu.innerHTML = `
        <li><button id="c_workspace_save" class="dropdown-item" type="button"><i class="bi bi-download me-2"></i>Save workspace snapshot</button></li>
        <li><button id="c_workspace_load" class="dropdown-item" type="button"><i class="bi bi-upload me-2"></i>Load saved workspace</button></li>
        <li><button id="c_workspace_clear" class="dropdown-item text-danger" type="button"><i class="bi bi-trash3 me-2"></i>Clear saved snapshot</button></li>
        <li><hr class="dropdown-divider"></li>
      `;
      const hasActionButton = (node) => {
        if (!node) return false;
        if (node.tagName?.toLowerCase() === 'button') {
          return true;
        }
        return typeof node.querySelector === 'function' && !!node.querySelector('button');
      };
      preserved
        .filter((node) => hasActionButton(node))
        .forEach((node) => menu.appendChild(node));
      const manageSnapshotsBtn = menu.querySelector('#c_canvas_snapshot_manage');
      const clearSnapshotItem = menu.querySelector('#c_workspace_clear')?.closest('li') ?? menu.querySelector('#c_workspace_clear');
      if (manageSnapshotsBtn && clearSnapshotItem && manageSnapshotsBtn !== clearSnapshotItem) {
        menu.insertBefore(manageSnapshotsBtn, clearSnapshotItem);
      }
      menu.dataset.workspaceActions = '1';
    }

    const save = menu.querySelector('#c_workspace_save');
    const load = menu.querySelector('#c_workspace_load');
    const clear = menu.querySelector('#c_workspace_clear');

    return {
      root: menu,
      toggle,
      save,
      load,
      clear
    };
  })();

  const closeWorkspaceMenu = () => {
    if (typeof window === 'undefined' || !workspaceMenu.toggle) return;
    const dropdownApi = window.bootstrap?.Dropdown;
    try {
      if (dropdownApi?.getOrCreateInstance) {
        dropdownApi.getOrCreateInstance(workspaceMenu.toggle).hide();
      } else if (dropdownApi?.getInstance) {
        const instance = dropdownApi.getInstance(workspaceMenu.toggle);
        instance?.hide();
      } else if (typeof workspaceMenu.toggle.dispatchEvent === 'function') {
        workspaceMenu.toggle.setAttribute('aria-expanded', 'false');
        workspaceMenu.root?.classList.remove('show');
      }
    } catch {
      workspaceMenu.toggle.setAttribute('aria-expanded', 'false');
      workspaceMenu.root?.classList.remove('show');
    }
  };

  const techSelectorController = (() => {
    const toggle = document.getElementById('tb2_tech_selector');
    const menu = document.querySelector('[data-tech-selector-menu]');
    if (!toggle || !menu) {
      return null;
    }
    const iconTarget = toggle.querySelector('[data-tech-icon-target]');
    const labelTarget = toggle.querySelector('[data-tech-label-target]');
    const options = Array.from(menu.querySelectorAll('[data-tech-option]'));
    if (!iconTarget || !labelTarget || !options.length) {
      return null;
    }

    const getDropdownInstance = () => {
      const bootstrapApi = window.bootstrap?.Dropdown;
      if (!bootstrapApi?.getOrCreateInstance) {
        return null;
      }
      return bootstrapApi.getOrCreateInstance(toggle);
    };

    const setActiveOption = (option) => {
      if (!option) return;
      const label = option.getAttribute('data-tech-label') || 'Technology';
      const symbol = option.getAttribute('data-tech-symbol') || '';
      const key = option.getAttribute('data-tech-option') || '';
      iconTarget.textContent = symbol;
      labelTarget.textContent = `${label} controls`;
      toggle.setAttribute('title', `${label} controls`);
      toggle.setAttribute('aria-label', `${label} controls`);
      if (key) {
        toggle.dataset.techKey = key;
      } else {
        delete toggle.dataset.techKey;
      }
      options.forEach((opt) => opt.classList.toggle('is-active', opt === option));
      toggle.dispatchEvent(new CustomEvent('workspace:tech-change', {
        bubbles: true,
        detail: { key, label }
      }));
    };

    const handleOptionClick = (event) => {
      event.preventDefault();
      const option = event.currentTarget;
      if (!option) {
        return;
      }
      setActiveOption(option);
      try {
        getDropdownInstance()?.hide();
      } catch {
        /* ignore bootstrap hide errors */
      }
    };

    options.forEach((option) => option.addEventListener('click', handleOptionClick));

    const initialActive = options.find((opt) => opt.classList.contains('is-active')) || options[0];
    if (initialActive) {
      setActiveOption(initialActive);
    }

    return {
      toggle,
      options,
      setActiveOption
    };
  })();

  const graphTypeController = (() => {
    const toggle = document.getElementById('tb2_graph_type');
    const menu = document.querySelector('[data-graph-selector-menu]');
    if (!toggle || !menu) {
      return null;
    }
    const iconTarget = toggle.querySelector('[data-graph-icon-target]');
    const labelTarget = toggle.querySelector('[data-graph-label-target]');
    const options = Array.from(menu.querySelectorAll('[data-graph-option]'));
    if (!iconTarget || !labelTarget || !options.length) {
      return null;
    }

    const getDropdownInstance = () => {
      const bootstrapApi = window.bootstrap?.Dropdown;
      if (!bootstrapApi?.getOrCreateInstance) {
        return null;
      }
      return bootstrapApi.getOrCreateInstance(toggle);
    };

    const setActiveOption = (option) => {
      if (!option) return;
      const label = option.getAttribute('data-graph-label') || 'Graph type';
      const icon = option.getAttribute('data-graph-icon') || 'bi-graph-up';
      const key = option.getAttribute('data-graph-option') || '';
      iconTarget.className = `workspace-toolbar-icon bi ${icon}`;
      iconTarget.setAttribute('aria-hidden', 'true');
      labelTarget.textContent = `Primary graph: ${label}`;
      toggle.setAttribute('title', `Primary graph: ${label}`);
      toggle.setAttribute('aria-label', `Primary graph: ${label}`);
      if (key) {
        toggle.dataset.graphKey = key;
      } else {
        delete toggle.dataset.graphKey;
      }
      options.forEach((opt) => opt.classList.toggle('is-active', opt === option));
      toggle.dispatchEvent(new CustomEvent('workspace:graph-type-change', {
        bubbles: true,
        detail: { key, label }
      }));
    };

    const handleOptionClick = (event) => {
      event.preventDefault();
      const option = event.currentTarget;
      if (!option) return;
      setActiveOption(option);
      try {
        getDropdownInstance()?.hide();
      } catch {
        /* ignore bootstrap hide errors */
      }
    };

    options.forEach((option) => option.addEventListener('click', handleOptionClick));

    const initialOption = options.find((opt) => opt.classList.contains('is-active')) || options[0];
    if (initialOption) {
      setActiveOption(initialOption);
    }

    return {
      toggle,
      options,
      setActiveOption
    };
  })();

    const techToolbarLabelController = createTechToolbarLabelController({
      techToggle: techSelectorController?.toggle || null,
      techOptions: techSelectorController?.options || [],
      buttons: [
        { node: document.getElementById('tb2_peak_marking'), slot: 3 },
        { node: document.getElementById('tb2_peak_integration'), slot: 4 },
        { node: document.getElementById('tb2_multi_trace'), slot: 5 },
        { node: document.getElementById('tb2_atr_correction'), slot: 6 },
        { node: document.getElementById('tb2_derivatization'), slot: 7 },
        { node: document.getElementById('tb2_spectral_library'), slot: 8 },
        { node: document.getElementById('tb2_placeholder_help'), slot: 9 }
      ]
    });
  const techToolbarHandlers = registerTechPlaceholderHandlers({
    controller: techToolbarLabelController,
    techOptions: techSelectorController?.options || [],
    notify: showToast
  });

  const getBrowserRootEl = () => panelDom.tree || null;

  const browserHotspot = (() => {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('c_browser_hotspot');
    if (!el) {
      el = document.createElement('div');
      el.id = 'c_browser_hotspot';
      el.className = 'workspace-browser-hotspot';
      document.body.appendChild(el);
    }
    el.style.width = el.style.width || '0px';
    el.style.height = el.style.height || '0px';
    return el;
  })();

  const workspacePane = roots.workspacePane ?? document.getElementById('pane-plotC');
  const appFrame = roots.appFrame ?? document.querySelector('.app-frame-main');
  const appFooter = roots.appFooter ?? document.querySelector('.app-footer');
  let layoutFrame = null;

  const syncWorkspaceViewport = () => {
    if (!workspacePane || !workspacePane.classList.contains('show')) return;

    const paneRect = workspacePane.getBoundingClientRect();
    const frameStyles = appFrame ? window.getComputedStyle(appFrame) : null;
    const rawPaddingBottom = frameStyles ? parseFloat(frameStyles.paddingBottom || '0') : 0;
    const paddingBottom = Number.isFinite(rawPaddingBottom) ? Math.max(rawPaddingBottom, 0) : 0;
    const footerRect = appFooter?.getBoundingClientRect();
    const rawFooterHeight = footerRect?.height ?? 0;
    const footerHeight = Number.isFinite(rawFooterHeight) ? Math.max(rawFooterHeight, 0) : 0;
    const isFullBleedWorkspace =
      typeof document !== 'undefined'
        ? document.body?.dataset?.workspacePage === 'true'
        : false;
    const safetyGap = isFullBleedWorkspace ? 0 : 16;

    let availableHeight = window.innerHeight - paneRect.top - footerHeight - paddingBottom - safetyGap;
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      availableHeight = window.innerHeight - Math.max(paneRect.top, safetyGap) - safetyGap;
    }

    const paneHeight = Math.max(availableHeight, 520);
    workspacePane.style.setProperty('--workspace-pane-height', `${Math.floor(paneHeight)}px`);

    const wrapperRect = canvasWrapper?.getBoundingClientRect();
    const frameRect = appFrame?.getBoundingClientRect();
    const viewportLeft = wrapperRect?.left ?? frameRect?.left ?? paneRect.left ?? 0;
    const viewportTop = wrapperRect?.top ?? paneRect.top ?? 0;
    const left = Math.max(0, Math.round(viewportLeft));
    const baseBrowserTop = Math.max(16, Math.round(viewportTop));
    const viewportHeight = Math.max(window.innerHeight || 0, 0);
    const minBrowserTop = Math.round((WORKSPACE_BROWSER_TOP_VH / 100) * viewportHeight);
    const maxBrowserBottom = Math.round((WORKSPACE_BROWSER_BOTTOM_VH / 100) * viewportHeight);
    const maxBrowserSpan = Math.max(0, maxBrowserBottom - minBrowserTop);
    const minVisibleHeight = Math.min(
      Math.max(MIN_BROWSER_VISIBLE_HEIGHT, 0),
      maxBrowserSpan
    );
    const maxBrowserTop = Math.max(minBrowserTop, maxBrowserBottom - minVisibleHeight);
    let browserTop = Math.max(minBrowserTop, baseBrowserTop);
    browserTop = Math.min(browserTop, maxBrowserTop);
    const browserMaxHeight = Math.max(0, maxBrowserBottom - browserTop);

    if (panelDom.root) {
      panelDom.root.style.setProperty('--workspace-browser-left', `${left}px`);
      panelDom.root.style.setProperty('--workspace-browser-top', `${browserTop}px`);
      if (browserMaxHeight > 0) {
        panelDom.root.style.setProperty('--workspace-browser-max-height', `${browserMaxHeight}px`);
      } else {
        panelDom.root.style.removeProperty('--workspace-browser-max-height');
      }
    }

    if (browserHotspot) {
      const pinned = panelPreferences?.isPanelPinned?.() ?? false;
      const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root?.classList.contains('collapsed');
      const showHotspot = (!pinned || collapsed) && !panelDom.root?.classList.contains('peeking');
      if (showHotspot) {
        const hotspotWidth = left > 0 ? left : MIN_BROWSER_HOTSPOT_WIDTH;
        browserHotspot.style.width = `${hotspotWidth}px`;
        browserHotspot.style.removeProperty('height');
        browserHotspot.style.removeProperty('top');
      } else {
        browserHotspot.style.width = '0px';
        browserHotspot.style.height = '0px';
      }
      browserHotspot.classList.toggle('is-active', showHotspot);
    }
  };

  const requestLayoutSync = () => {
    if (layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = null;
      syncWorkspaceViewport();
    });
  };

  const chipContext = { lastRowId: null };
  
  const isPanelCollapsed = () => panelPreferences?.isPanelCollapsed?.() ?? !!panelDom.root?.classList.contains('collapsed');

  const handlePanelHoverEnter = () => {
    if (!panelDom.root) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root.classList.contains('collapsed');
    if (!pinned) {
      panelDom.root.classList.add('peeking');
      panelDom.root.classList.add('is-active');
      panelPreferences?.setCollapsed?.(true, { persist: false, silent: true });
    } else if (collapsed) {
      panelPreferences?.setCollapsed?.(false, { persist: false });
    }
  };

  const handlePanelHoverLeave = () => {
    if (!panelDom.root) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root.classList.contains('collapsed');
    if (!pinned) {
      panelPreferences?.setCollapsed?.(true, { persist: false });
      panelDom.root.classList.remove('is-active');
      panelDom.root.classList.remove('peeking');
    } else if (collapsed) {
      panelDom.root.classList.remove('peeking');
    }
  };

  const handlePanelMouseLeave = () => {
    if (browserHotspot?.matches(':hover')) return;
    handlePanelHoverLeave();
  };

  const handleHotspotLeave = () => {
    window.requestAnimationFrame(() => {
      if (panelDom.root?.matches(':hover')) return;
      handlePanelHoverLeave();
    });
  };

  const updateCanvasOffset = () => {
    if (!canvasWrapper) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root?.classList.contains('collapsed');
    canvasWrapper.classList.toggle('browser-pinned', pinned);
    canvasWrapper.classList.toggle('browser-floating', !pinned);
    canvasWrapper.classList.toggle('browser-collapsed', !!collapsed);
    requestLayoutSync();
  };

  panelPreferences = createPanelPreferencesManager({
    panelDom,
    preferences: preferencesFacade,
    updateCanvasOffset,
    requestLayoutSync
  });
  panelPreferences.restorePinned();
  panelPreferences.restoreCollapsed();

  const collectSectionAncestors = (sectionId) => {
    const result = [];
    let current = sectionId;
    const guard = new Set();
    while (current && sections.has(current) && !guard.has(current)) {
      result.push(current);
      guard.add(current);
      const next = sections.get(current)?.parentId || null;
      current = next;
    }
    return result;
  };

  const markActiveSections = (sectionId) => {
    if (!panelDom.tree) return;
    const activeIds = new Set(sectionId ? collectSectionAncestors(sectionId) : []);
    panelDom.tree.querySelectorAll('.section-node').forEach((node) => {
      const id = node.dataset.sectionId;
      node.classList.toggle('has-active-graph', activeIds.has(id));
    });
  };

  const applyActivePanelState = ({ scrollBrowser = false } = {}) => {
    if (!panelDom.tree) return;
    panelDom.tree.querySelectorAll('.graph-node.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
    panelDom.tree.querySelectorAll('.section-node.has-active-graph').forEach((node) => {
      node.classList.remove('has-active-graph');
    });
    if (!activePanelId) {
      markActiveSections(null);
      return;
    }
    const node = panelDom.tree.querySelector(`.graph-node[data-panel-id="${activePanelId}"]`);
    if (!node) {
      markActiveSections(null);
      return;
    }
    node.classList.add('is-active');
    if (scrollBrowser) {
      try {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch {
        /* ignore scroll errors */
      }
    }
    const sectionId = node.dataset.sectionId;
    if (sectionId) {
      markActiveSections(sectionId);
    }
  };

  const updatePanelDomFocus = (panelId, focused) => {
    const dom = getPanelDom(panelId);
    if (!dom?.rootEl) return;
    dom.rootEl.classList.toggle('is-active', focused);
  };
  const refreshAllPanelFocus = () => {
    panelDomRegistry.forEach((handles, panelId) => {
      handles?.rootEl?.classList.toggle('is-active', panelId === activePanelId);
    });
  };

    setActivePanel = (panelId, options = {}) => {
      if (activePanelId && activePanelId !== panelId) {
        updatePanelDomFocus(activePanelId, false);
      }
      activePanelId = panelId || null;
      if (activePanelId) {
        updatePanelDomFocus(activePanelId, true);
      }
    chipPanelsBridge.onPanelSelected(activePanelId);
    applyActivePanelState(options);
    peakMarkingController?.handleActivePanelChange?.(activePanelId);
    unitsToggleController?.handleActivePanelChange?.(activePanelId);
    multiTraceController?.handleActivePanelChange?.(activePanelId);
    techToolbarPinController?.handleActivePanelChange?.(activePanelId);
    updateCanvasState();
  };


  const findTraceByRowId = (rowId) => {
    if (!rowId || typeof rowId !== 'string') return null;
    const [panelId, traceKey] = rowId.split(':');
    if (!panelId || !traceKey) return null;
    let traces = getPanelTraces(panelId);
    let traceIndex = traces.findIndex((trace) => trace?._canvasId === traceKey);
    if (traceIndex === -1) {
      normalizePanelTraces(panelId);
      traces = getPanelTraces(panelId);
      traceIndex = traces.findIndex((trace) => trace?._canvasId === traceKey);
    }
    if (traceIndex === -1) return null;
    return { panelId, trace: traces[traceIndex], traceIndex };
  };

  const rerenderTracePanel = (rowId) => {
    const handle = findTraceByRowId(rowId);
    if (!handle) return;
    normalizePanelTraces(handle.panelId);
    const traces = getPanelTraces(handle.panelId);
    const nextTrace = traces[handle.traceIndex] || traces.find((trace) => trace?._canvasId === handle.trace?._canvasId) || handle.trace;
    renderPlot(handle.panelId);
    updateTraceChip(
      panelDom.tree?.querySelector(`.folder-trace[data-id="${rowId}"]`),
      nextTrace
    );
    persist();
  };

  const ensureChipPanelsMount = () => {
    if (!chipPanelsInstance || !panelDom.tree || panelDom.tree.dataset.chipPanelsMounted === '1') return;
    chipPanelsInstance.mount({
      tree: panelDom.tree,
      getTraceById: (rowId) => {
        chipContext.lastRowId = rowId;
        const handle = findTraceByRowId(rowId);
        if (!handle?.trace) return null;
        syncTraceAppearance(handle.trace);
        return new Proxy(handle.trace, {
          get(target, prop) {
            return target[prop];
          },
          set(target, prop, value) {
            if (prop === 'width') {
              const widthPx = Number(value);
              if (!Number.isFinite(widthPx)) {
                return true;
              }
              const currentTraces = getPanelTraces(handle.panelId);
              const current = currentTraces[handle.traceIndex];
              const prevWidth = Number(
                (current?.line && current.line.width) ?? current?.width ?? NaN
              );
              if (!Number.isFinite(prevWidth) || Math.abs(prevWidth - widthPx) > 1e-6) {
                pushHistory();
                Actions.setTraceLineWidth(handle.panelId, handle.traceIndex, widthPx);
                persist();
              }
              target.width = widthPx;
              target.line = target.line || {};
              target.line.width = widthPx;
              return true;
            }
            if (prop === 'color') {
              const colorValue = typeof value === 'string' && value ? toHexColor(value) : getFallbackTraceColor();
              const currentTraces = getPanelTraces(handle.panelId);
              const current = currentTraces[handle.traceIndex];
              const prevColor = toHexColor(
                (current?.line && current.line.color)
                || current?.color
                || getFallbackTraceColor()
              );
              if (colorValue && prevColor && colorValue.toLowerCase() !== prevColor.toLowerCase()) {
                pushHistory();
                Actions.setTraceColor(handle.panelId, handle.traceIndex, colorValue);
                persist();
                peakMarkingController?.handleTraceStyleChange?.(handle.panelId);
              }
              target.color = colorValue;
              target.line = target.line || {};
              target.line.color = colorValue;
              if (target.marker) {
                target.marker.color = colorValue;
              }
              return true;
            }
            if (prop === 'opacity') {
              const numeric = Number(value);
              if (!Number.isFinite(numeric)) {
                return true;
              }
              const clamped = Math.min(1, Math.max(0.05, numeric));
              const currentTraces = getPanelTraces(handle.panelId);
              const current = currentTraces[handle.traceIndex];
              const prevOpacity = Number(current?.opacity);
              if (!Number.isFinite(prevOpacity) || Math.abs(prevOpacity - clamped) > 1e-3) {
                pushHistory();
                Actions.setTraceOpacity(handle.panelId, handle.traceIndex, clamped);
                persist();
              }
              target.opacity = clamped;
              return true;
            }
            if (prop === 'dash') {
              const resolved = typeof value === 'string' && value ? value : 'solid';
              const currentTraces = getPanelTraces(handle.panelId);
              const current = currentTraces[handle.traceIndex];
              const prevDash = typeof current?.line?.dash === 'string'
                ? current.line.dash
                : (typeof current?.dash === 'string' ? current.dash : 'solid');
              if (resolved !== prevDash) {
                pushHistory();
                Actions.setTraceLineDash(handle.panelId, handle.traceIndex, resolved);
                persist();
              }
              target.dash = resolved;
              target.line = target.line || {};
              target.line.dash = resolved;
              return true;
            }
            target[prop] = value;
            return true;
          }
        });
      },
      repaintChip: (rowEl) => {
        const rowId = rowEl?.dataset.id;
        const handle = findTraceByRowId(rowId);
        if (!handle || !rowEl) return;
        updateTraceChip(rowEl, handle.trace);
      },
      renderPlot: () => {
        rerenderTracePanel(chipContext.lastRowId);
      },
      openRawData: (rowId) => {
        const handle = findTraceByRowId(rowId);
        if (!handle) return;
        console.info('Trace info', {
          id: rowId,
          name: handle.trace.name,
          meta: handle.trace.meta
        });
      }
    });
    panelDom.tree.dataset.chipPanelsMounted = '1';
  };


  const updatePanelEmpty = () => {
    if (!panelDom.empty) return;
    if (panelDom.empty.dataset.mode === 'search-empty') {
      panelDom.empty.style.display = '';
      return;
    }
    panelDom.empty.style.display = panelDomRegistry.size ? 'none' : '';
  };

    updateCanvasState = () => {
      canvas.classList.toggle('has-panels', panelDomRegistry.size > 0);
      updatePanelEmpty();
      if (emptyOverlay) {
        emptyOverlay.style.display = panelDomRegistry.size ? 'none' : '';
      }
      if (verticalToolbar) {
        const showToolbar = !!(activePanelId && panelSupportsPlot(activePanelId));
        if (techToolbarPinController?.setBaseVisibility) {
          techToolbarPinController.setBaseVisibility(showToolbar);
        } else {
          if (!showToolbar && typeof document !== 'undefined') {
            const active = document.activeElement;
            if (active && verticalToolbar.contains(active) && typeof active.blur === 'function') {
              active.blur();
            }
          }
          verticalToolbar.hidden = !showToolbar;
          verticalToolbar.setAttribute('aria-hidden', String(!showToolbar));
          if (!showToolbar) {
            verticalToolbar.setAttribute('inert', '');
          } else {
            verticalToolbar.removeAttribute('inert');
          }
        }
      }
      updateToolbarMetrics();
    };

  const coerceNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const getPanelGeometry = (panelId) => {
    if (!panelId) return null;
    const record = getPanelSnapshot(panelId);
    if (!record) return null;
    return {
      x: coerceNumber(record.x, 0),
      y: coerceNumber(record.y, 0),
      width: Math.max(MIN_WIDTH, coerceNumber(record.width, MIN_WIDTH)),
      height: Math.max(MIN_HEIGHT, coerceNumber(record.height, MIN_HEIGHT))
    };
  };

  const clampGeometryToCanvas = (geometry = {}) => {
    const requestedWidth = Math.max(MIN_WIDTH, coerceNumber(geometry.width, MIN_WIDTH));
    const requestedHeight = Math.max(MIN_HEIGHT, coerceNumber(geometry.height, MIN_HEIGHT));
    const measuredWidth = canvas?.clientWidth;
    const measuredHeight = canvas?.clientHeight;
    const canvasWidth = (Number.isFinite(measuredWidth) && measuredWidth > 0)
      ? measuredWidth
      : requestedWidth;
    const canvasHeight = (Number.isFinite(measuredHeight) && measuredHeight > 0)
      ? measuredHeight
      : requestedHeight;

    const width = Math.max(
      MIN_WIDTH,
      Math.min(requestedWidth, canvasWidth)
    );
    const height = Math.max(
      MIN_HEIGHT,
      Math.min(requestedHeight, canvasHeight)
    );
    const maxX = Math.max(0, canvasWidth - width);
    const maxY = Math.max(0, canvasHeight - height);

    const x = Math.max(0, Math.min(coerceNumber(geometry.x, 0), maxX));
    const y = Math.max(0, Math.min(coerceNumber(geometry.y, 0), maxY));

    return { x, y, width, height };
  };

  const applyPanelGeometry = (panelId, geometryOverride = null, { persistNormalized = false } = {}) => {
    if (!panelId) return null;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    if (!rootEl) return null;

    const baseGeometry = geometryOverride
      ? { ...geometryOverride }
      : getPanelGeometry(panelId);
    if (!baseGeometry) return null;

    const normalized = clampGeometryToCanvas(baseGeometry);

    if (rootEl.classList.contains('is-fullscreen')) {
      updatePanelRuntime(panelId, { visual: normalized });
      return normalized;
    }

    rootEl.style.width = `${normalized.width}px`;
    rootEl.style.height = `${normalized.height}px`;
    rootEl.style.transform = `translate(${normalized.x}px, ${normalized.y}px)`;

    updatePanelRuntime(panelId, { visual: normalized });

    if (persistNormalized && geometryOverride) {
      const changed = ['x', 'y', 'width', 'height'].some(
        (key) => normalized[key] !== geometryOverride[key]
      );
      if (changed) {
        panelsModel.setPanelGeometry(panelId, normalized);
      }
    }

    return normalized;
  };

  const applyPanelZIndex = (panelId) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    if (!rootEl) return;
    const panelRecord = getPanelSnapshot(panelId);
    const value = Number(panelRecord?.zIndex);
    const resolved = Number.isFinite(value) && value > 0 ? value : 1;
    rootEl.style.zIndex = String(resolved);
  };

  const refreshPanelContentDom = (panelId) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.contentHandles?.refreshContent) return;
    const latestContent = panelsModel.getPanelContent(panelId);
    dom.contentHandles.refreshContent(latestContent);
  };

  const formatAxisLabel = (label) => {
    if (!label) return label;
    const text = String(label);
    if (text.includes('cm^{-1}')) return text;
    return text
      .replace(/cm\s*\^\s*-?\s*1/gi, 'cm^{-1}')
      .replace(/cm\s*-\s*1/gi, 'cm^{-1}');
  };

  const defaultLayout = (payload = {}) => {
    const yLabel = payload.meta?.DISPLAY_UNITS
      || payload.meta?.Y_UNITS
      || 'Intensity';
    const xLabel = formatAxisLabel(payload.meta?.X_UNITS || 'Wavenumber');
    const xValues = ensureArray(payload?.x || payload?.wavenumber);
    const resolveAutorange = () => {
      if (payload?.meta?.X_INVERTED === true) return 'reversed';
      if (payload?.meta?.X_INVERTED === false) return true;
      const numericX = xValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      if (numericX.length >= 2) {
        const first = numericX[0];
        const last = numericX[numericX.length - 1];
        if (first > last) return 'reversed';
      }
      // FTIR convention: default to decreasing wavenumber (high -> low)
      return 'reversed';
    };
    const autorange = resolveAutorange();
    const axisDefaults = {
      showgrid: false,
      showline: true,
      mirror: true,
      ticks: 'outside',
      linewidth: 1,
      zeroline: false
    };

    const baseLayout = {
      hovermode: 'x',
      margin: { l: 50, r: 15, t: 30, b: 40 },
      xaxis: {
        ...axisDefaults,
        minor: {
          ticks: 'outside',
          showgrid: false
        },
        autorange,
        title: { text: xLabel }
      },
      yaxis: {
        ...axisDefaults,
        minor: {
          ticks: 'outside',
          showgrid: false
        },
        title: { text: yLabel }
      },
      legend: {
        orientation: 'h',
        x: 0,
        y: 0,
        xanchor: 'left',
        yanchor: 'bottom',
        xref: 'paper',
        yref: 'paper'
      },
      showlegend: true
    };
    return applyPlotThemeToLayout(baseLayout, getActiveTheme());
  };

  const bringPanelToFront = (panelId, { persistChange = true, scrollBrowser = false } = {}) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.rootEl) return;
    const updated = panelsModel.bringPanelToFront(panelId);
    if (updated) {
      applyPanelZIndex(panelId);
      if (persistChange) {
        historyHelpers.persist();
      }
    }
    setActivePanel(panelId, { scrollBrowser });
  };

  const panelInteractions = createPanelInteractions({
    interact,
    canvas,
    registry: {
      getPanelDom,
      ensurePanelRuntime,
      updatePanelRuntime
    },
    geometry: {
      getPanelGeometry,
      clampGeometryToCanvas,
      applyPanelGeometry,
      coerceNumber
    },
    models: { panelsModel },
    history: historyHelpers,
    persistence: { persist },
    plot: { resize: (panelId) => resizePlotForPanel(panelId) },
    utils: {
      bringPanelToFront,
      isPanelActive: (panelId) => panelId === activePanelId,
      isPanelPinned
    },
    dimensions: {
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT
    },
    operations: {
      annotateOperation: annotateOperationMeta
    }
  });

  const focusPanelById = (panelId, { scrollBrowser = true } = {}) => {
    if (!panelId) return;
    bringPanelToFront(panelId, { scrollBrowser });
  };

  persistence = createPersistenceFacade({
    dom: {
      undo: panelDom.undo,
      redo: panelDom.redo
    },
    menu: workspaceMenu,
    historyFactory: createHistory,
    historyConfig: {
      limit: HISTORY_LIMIT,
      tolerance: HISTORY_GEOMETRY_TOLERANCE
    },
    models: {
      panelsModel
    },
    storage,
    hooks: {
      closeMenu: closeWorkspaceMenu
    },
    snapshot: snapshotManager,
    helpers: {
      deepClone
    },
    notifications: {
      showToast,
      autosaveStatus: autosaveIndicatorController?.setStatus
    }
  }) || null;

  if (persistence) {
    ({
      history,
      persist,
      pushHistory,
      undo,
      redo,
      updateHistoryButtons,
      updateStorageButtons,
      saveSnapshot: saveWorkspaceSnapshot,
      loadSnapshot: loadWorkspaceSnapshot,
      clearSnapshot: clearWorkspaceSnapshot,
      restoreSnapshot
    } = persistence);
    const baseRestoreSnapshot = restoreSnapshot;
    restoreSnapshot = (...args) => {
      const result = typeof baseRestoreSnapshot === 'function' ? baseRestoreSnapshot(...args) : null;
      const finalize = () => {
        applyThemeToAllPlotPanels({ applyPalette: true, reason: 'snapshot-restore' });
      };
      if (result && typeof result.then === 'function') {
        return result.then((value) => {
          finalize();
          return value;
        });
      }
      finalize();
      return result;
    };
    const basePersist = persist;
    persist = (options = {}) => {
      const nextOptions = options && typeof options === 'object' ? options : {};
      const result = basePersist?.(nextOptions);
      if (!activeCanvasId) {
        suppressRemoteSyncOnce = false;
        return result;
      }
      if (nextOptions.skipRemoteSync || suppressRemoteSyncOnce) {
        suppressRemoteSyncOnce = false;
        return result;
      }
      scheduleCanvasSync();
      return result;
    };
    persistence.attachEvents();
    const rawPushHistory = pushHistory || (() => false);
    pushHistory = (info = null) => {
      const normalized = normalizeHistoryInfo(info);
      const beforeInspect = history?.inspect?.();
      const beforePast = beforeInspect?.past?.length ?? null;
      const result = rawPushHistory(normalized.label);
      if (result === false) {
        return null;
      }
      const afterInspect = history?.inspect?.();
      const afterPast = afterInspect?.past?.length ?? beforePast;
      const delta = beforePast != null && afterPast != null ? afterPast - beforePast : null;
      return recordOperation({
        label: normalized.label,
        source: captureOperationSource(),
        timestamp: Date.now(),
        meta: {
          ...(normalized.meta || {}),
          historyDelta: delta,
          historySize: afterPast,
          futureSize: afterInspect?.future?.length ?? null
        }
      });
    };
    const rawUndo = undo || (() => false);
    undo = (...args) => {
      const result = rawUndo(...args);
      if (result) {
        const snapshot = history?.inspect?.();
        recordOperation({
          label: 'Undo',
          source: captureOperationSource(),
          timestamp: Date.now(),
          meta: {
            historyDelta: -1,
            historySize: snapshot?.past?.length ?? null,
            futureSize: snapshot?.future?.length ?? null
          }
        });
      }
      return result;
    };
    const rawRedo = redo || (() => false);
    redo = (...args) => {
      const result = rawRedo(...args);
      if (result) {
        const snapshot = history?.inspect?.();
        recordOperation({
          label: 'Redo',
          source: captureOperationSource(),
          timestamp: Date.now(),
          meta: {
            historyDelta: 1,
            historySize: snapshot?.past?.length ?? null,
            futureSize: snapshot?.future?.length ?? null
          }
        });
      }
      return result;
    };
  }
  const renderPlot = (panelId) => {
    if (!panelId || !panelSupportsPlot(panelId)) return;
    Plot.renderNow(panelId);
  };

  const resizePlotForPanel = (panelId) => {
    if (!panelId || !panelSupportsPlot(panelId)) return;
    Plot.resize(panelId);
  };

  const exportPlotFigure = (panelId, opts) => {
    if (!panelId || !panelSupportsPlot(panelId)) return null;
    return Plot.exportFigure(panelId, opts);
  };

  const updateTraceChip = (rowEl, trace) => {
    const chip = rowEl.querySelector('.line-chip');
    if (!chip) return;
  applyLineChip(chip, {
    color: toHexColor(trace.line?.color || '#1f77b4'),
    width: trace.line?.width || 2,
    opacity: trace.opacity ?? 1,
    dash: trace.line?.dash || 'solid'
  });
};

  const syncTraceAppearance = (trace) => {
    if (!trace) return trace;
    trace.line = trace.line || {};
    const resolvedColor = toHexColor(
      trace.color
      || trace.line.color
      || getFallbackTraceColor()
    );
    trace.color = resolvedColor;
    trace.line.color = resolvedColor;

    const resolvedWidth = Number.isFinite(trace.width)
      ? trace.width
      : Number.isFinite(trace.line.width) ? trace.line.width : 2;
    trace.width = resolvedWidth;
    trace.line.width = resolvedWidth;

    const resolvedDash = typeof trace.dash === 'string'
      ? trace.dash
      : (typeof trace.line.dash === 'string' ? trace.line.dash : 'solid');
    trace.dash = resolvedDash;
    trace.line.dash = resolvedDash;

    const resolvedOpacity = Number.isFinite(trace.opacity) ? trace.opacity : 1;
    trace.opacity = resolvedOpacity;
    return trace;
  };

  const isSectionVisible = (sectionId) => sectionManager.isSectionVisible(sectionId);

  const refreshPanelVisibility = () => {
    panelDomRegistry.forEach((dom, panelId) => {
      const record = getPanelRecord(panelId) || {};
      const sectionId = sections.has(record.sectionId) ? record.sectionId : DEFAULT_SECTION_ID;
      const sectionVisible = isSectionVisible(sectionId);
      const graphVisible = record.hidden !== true;
      const shouldShow = sectionVisible && graphVisible;
      const rootEl = dom?.rootEl;
      if (rootEl) {
        rootEl.style.display = shouldShow ? '' : 'none';
        rootEl.classList.toggle('is-hidden-by-group', !sectionVisible);
        rootEl.classList.toggle('is-hidden-by-graph', !graphVisible);
        rootEl.classList.toggle('is-collapsed', record.collapsed === true);
      }
      if (shouldShow) {
        resizePlotForPanel(panelId);
      }
    });
  };

  const applyAllPanelZIndices = () => {
    if (!panelsModel?.getPanels) return;
    const panels = panelsModel.getPanels();
    if (!Array.isArray(panels)) return;
    panels.forEach((panel) => {
      if (!panel || !panel.id) return;
      applyPanelZIndex(panel.id);
    });
  };

  const reorderPanelsByZIndex = () => {
    if (!panelsModel?.getPanels || !canvas) return;
    const panels = panelsModel.getPanels();
    if (!Array.isArray(panels) || !panels.length) return;
    const sorted = panels
      .map((panel) => ({
        id: panel?.id,
        z: Number(panel?.zIndex) || 0,
        dom: getPanelDom(panel?.id)
      }))
      .filter((entry) => entry.id && entry.dom?.rootEl)
      .sort((a, b) => (a.z - b.z));
    sorted.forEach(({ dom }) => {
      canvas.appendChild(dom.rootEl);
    });
  };

  const updatePanelTitleDom = (panelId, title) => {
    const dom = getPanelDom(panelId);
    if (!dom) return;
    if (dom.titleEl) {
      dom.titleEl.textContent = title;
    }
    if (dom.rootEl) {
      dom.rootEl.dataset.graphTitle = title;
    }
  };

  const queueSectionRename = (sectionId) => {
    pendingRenameSectionId = sectionId;
  };

  const startSectionRename = (sectionId, nameEl, { selectAll = false } = {}) => {
    const section = sections.get(sectionId);
    const isDefaultSection = sectionId === DEFAULT_SECTION_ID;
    if (!section || (section.locked && !isDefaultSection) || !nameEl) return;
    if (nameEl.dataset.editing === '1') return;
    nameEl.dataset.editing = '1';
    const original = section.name || '';
    const finish = (commit, value) => {
      nameEl.dataset.editing = '0';
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('is-editing');
      nameEl.removeEventListener('blur', onBlur);
      nameEl.removeEventListener('keydown', onKey);
      if (!commit) {
        nameEl.textContent = original;
        return;
      }
      const nextValueRaw = value ?? nameEl.textContent;
      const nextValue = ((nextValueRaw ?? '')).trim();
      if (!nextValue || nextValue === original) {
        nameEl.textContent = original;
        return;
      }
      pushHistory();
      renameSection(sectionId, nextValue);
      persist();
      renderBrowser();
      updateHistoryButtons();
    };
    const onBlur = () => finish(true);
    const onKey = (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        finish(false, original);
      }
    };
    nameEl.contentEditable = 'true';
    nameEl.spellcheck = false;
    nameEl.classList.add('is-editing');
    nameEl.addEventListener('blur', onBlur);
    nameEl.addEventListener('keydown', onKey);
    nameEl.focus();
    if (selectAll && typeof window !== 'undefined') {
      try {
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
  } catch {}
  }
  };

  const startPanelRename = (panelId, nameEl, { selectAll = false } = {}) => {
    const record = getPanelRecord(panelId);
    if (!record || !nameEl) return;
    if (nameEl.dataset.editing === '1') return;
    const original = resolvePanelTitle(record);
    nameEl.dataset.editing = '1';
    const finish = (commit, value) => {
      nameEl.dataset.editing = '0';
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('is-editing');
      nameEl.removeEventListener('blur', onBlur);
      nameEl.removeEventListener('keydown', onKey);
      if (!commit) {
        nameEl.textContent = original;
        return;
      }
      const nextRaw = value ?? nameEl.textContent;
      const nextCandidate = (nextRaw ?? '').trim();
      const panelType = getPanelType(record?.type);
      const nextTitle = nextCandidate || defaultPanelTitle(panelType, record.index);
      if (nextTitle === original) {
        nameEl.textContent = original;
        return;
      }
      const appliedTitle = nextTitle;
      nameEl.textContent = appliedTitle;
      pushHistory();
      panelsModel.setPanelTitle(panelId, appliedTitle);
      updatePanelTitleDom(panelId, appliedTitle);
      persist();
      renderBrowser();
      updateHistoryButtons();
    };
    const onBlur = () => finish(true);
    const onKey = (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        finish(false, original);
      }
    };
    nameEl.contentEditable = 'true';
    nameEl.spellcheck = false;
    nameEl.classList.add('is-editing');
    nameEl.textContent = original;
    nameEl.addEventListener('blur', onBlur);
    nameEl.addEventListener('keydown', onKey);
    nameEl.focus();
    if (selectAll && typeof window !== 'undefined') {
      try {
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {}
    }
  };

  const toggleSectionVisibility = (sectionId) => {
    if (!sectionManager.has(sectionId)) return;
    pushHistory();
    sectionManager.toggleSectionVisibility(sectionId);
    persist();
    refreshPanelVisibility();
    renderBrowser();
    updateHistoryButtons();
  };

  const setGraphVisibility = (panelId, hidden = null) => {
    if (!panelId) return;
    const record = getPanelRecord(panelId);
    if (!record) return;
    const nextHidden = hidden === null ? record.hidden !== true : hidden === true;
    if (record.hidden === nextHidden) return false;
    pushHistory();
    panelsModel.setPanelHidden(panelId, nextHidden);
    persist();
    refreshPanelVisibility();
    renderBrowser();
    updateHistoryButtons();
    return true;
  };

  const toggleGraphVisibility = (panelId) => {
    setGraphVisibility(panelId, null);
  };

  const toggleSectionCollapsedState = (sectionId) => {
    const section = sections.get(sectionId);
    if (!section) return false;
    const next = !section.collapsed;
    setSectionCollapsed(sectionId, next);
    renderBrowser();
    persist();
    return true;
  };

  const togglePanelCollapsedState = (panelId) => {
    if (!panelId) return false;
    const record = getPanelRecord(panelId);
    if (!record) return false;
    const current = record.collapsed === true;
    panelsModel.setCollapsed(panelId, !current);
    renderBrowser();
    persist();
    return true;
  };

  const addGraphToSection = (sectionId) => {
    if (!sectionManager.has(sectionId)) return;
    const sampleIndex = getNextPanelSequence();
    const baseWavenumbers = [4000, 3600, 3200, 2800, 2400, 2000, 1800, 1600, 1400, 1200, 1000, 800, 600, 400];
    const sampleTrace = {
      name: `Sample ${sampleIndex}`,
      x: baseWavenumbers, // descending to match FTIR convention
      y: baseWavenumbers.map((wn, idx) => Math.sin(idx / 1.8) * 0.2 + 1 - idx * 0.02),
      meta: {
        X_INVERTED: true,
        X_UNITS: 'Wavenumber (cm^-1)',
        Y_UNITS: 'Absorbance'
      }
    };
    const panelId = ingestPayloadAsPanel(sampleTrace, { sectionId });
    if (panelId) {
      const record = getPanelRecord(panelId);
      const label = resolvePanelTitle(record);
      showToast(`${label} added to group.`, 'success');
    }
  };

  renderBrowser = () => {
    if (!browserFacade) return;
    browserFacade.render();
    panelDomRegistry.forEach((_, panelId) => {
      const record = getPanelRecord(panelId);
      if (record) {
        updatePanelTitleDom(panelId, resolvePanelTitle(record));
      }
    });
    applyAllPanelZIndices();
    reorderPanelsByZIndex();
  };

  const focusSectionById = (sectionId, { scrollBrowser = true } = {}) => {
    if (!sectionId) return;
    const descendantIds = new Set(collectSectionDescendants(sectionId));
    let targetPanelId = null;
    if (activePanelId) {
      const activeRecord = getPanelRecord(activePanelId);
      if (activeRecord && descendantIds.has(activeRecord.sectionId || DEFAULT_SECTION_ID)) {
        targetPanelId = activePanelId;
      }
    }
    if (!targetPanelId) {
      getPanelsOrdered().forEach((record) => {
        const panelId = record?.id;
        if (!panelId) return;
        if (record.hidden === true) return;
        const recordSectionId = record.sectionId || DEFAULT_SECTION_ID;
        if (!descendantIds.has(recordSectionId)) return;
        const currentTargetRecord = targetPanelId ? getPanelRecord(targetPanelId) : null;
        const activeZIndex = currentTargetRecord ? coerceNumber(currentTargetRecord.zIndex, 0) : 0;
        const candidateZ = coerceNumber(record.zIndex, 0);
        if (!targetPanelId || candidateZ > activeZIndex) {
          targetPanelId = panelId;
        }
      });
    }
    if (targetPanelId) {
      bringPanelToFront(targetPanelId, { scrollBrowser });
    }
  };

  const deleteSectionInteractive = (sectionId) => {
    const section = sections.get(sectionId);
    if (!section || section.locked) return;
    pushHistory();
    const descendants = collectSectionDescendants(sectionId);
    getPanelsOrdered().forEach((record) => {
      const panelId = record?.id;
      if (!panelId) return;
      if (descendants.includes(record.sectionId)) {
        removePanel(panelId, { pushToHistory: false });
      }
    });
    deleteSection(sectionId);
    ensureDefaultSection();
    renderBrowser();
    persist();
    updateHistoryButtons();
  };

  const deleteGraphInteractive = (panelId) => {
    const record = getPanelRecord(panelId);
    if (!record) return;
    removePanel(panelId);
  };

  const setPanelContent = (panelId, content, {
    pushHistory: pushToHistory = true,
    persistChange = true
  } = {}) => {
    if (!panelId) return null;
    const record = getPanelRecord(panelId);
    if (!record) return null;
    if (pushToHistory) {
      pushHistory();
    }
    const updated = panelsModel.updatePanelContent(panelId, content);
    refreshPanelContentDom(panelId);
    updateCanvasState();
    renderBrowser();
    if (persistChange) {
      persist();
    }
    updateHistoryButtons();
    return updated;
  };


  registerPanel = (incomingState, {
    skipHistory = false,
    skipPersist = false,
    preserveIndex = false,
    useModelState = false
  } = {}) => {
    if (!skipHistory) {
      pushHistory();
    }

    const candidateId = incomingState.id || randomPanelId();
    const incomingIndex = Number.isFinite(incomingState.index) ? incomingState.index : undefined;
    const resolvedIndex = (useModelState && Number.isInteger(incomingIndex) && incomingIndex > 0)
      ? incomingIndex
      : allocatePanelIndex(incomingIndex);
    const panelType = getPanelType(incomingState.type);
    const defaultTitle = defaultPanelTitle(panelType, resolvedIndex);
    const incomingTitleCandidate = typeof incomingState.title === 'string'
      ? incomingState.title
      : '';
    const normalizedTitleBase = incomingTitleCandidate.trim();
    const normalizedTitle = normalizedTitleBase || defaultTitle;
    const sequenceOffset = panelDomRegistry.size * 24;
    const gutter = 36;
    const defaultWidth = Number.isFinite(incomingState.width) ? incomingState.width : 1000;
    const defaultHeight = Number.isFinite(incomingState.height) ? incomingState.height : 300;
    const resolveAutoX = () => {
      if (useModelState && Number.isFinite(incomingState.x)) {
        return incomingState.x;
      }
      const rect = typeof canvas?.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : null;
      const canvasWidth = Math.round(rect?.width || canvas?.clientWidth || 0);
      if (canvasWidth > 0) {
        const rightAligned = canvasWidth - defaultWidth - gutter;
        if (rightAligned >= 0) {
          return rightAligned;
        }
        return Math.max(0, canvasWidth - defaultWidth);
      }
      return gutter + sequenceOffset;
    };
    const resolveAutoY = () => {
      if (useModelState && Number.isFinite(incomingState.y)) {
        return incomingState.y;
      }
      return gutter + sequenceOffset;
    };
    const candidateState = {
      id: candidateId,
      type: panelType?.id || 'plot',
      index: resolvedIndex,
      title: normalizedTitle,
      x: resolveAutoX(),
      y: resolveAutoY(),
      width: defaultWidth,
      height: defaultHeight,
      collapsed: !!incomingState.collapsed,
      hidden: incomingState.hidden === true,
      sectionId: sections.has(incomingState.sectionId) ? incomingState.sectionId : DEFAULT_SECTION_ID,
      zIndex: incomingState.zIndex
    };
    const preparedState = panelType?.prepareInitialState
      ? panelType.prepareInitialState(incomingState, {
        defaultLayout,
        deepClone
      })
      : {};
    Object.assign(candidateState, preparedState);
    if (!candidateState.figure) {
      candidateState.figure = {
        data: [],
        layout: defaultLayout()
      };
    }

    let baseState = null;
    if (useModelState) {
      baseState = panelsModel.getPanel(candidateId)
        || panelsModel.registerPanel(candidateState, { preserveIndex: true });
    } else {
      baseState = panelsModel.registerPanel(candidateState, { preserveIndex: true });
    }

    if (!baseState) return null;

    const {
      x: baseX,
      y: baseY,
      width: baseWidth,
      height: baseHeight,
      figure: _initialFigure,
      collapsed: _initialCollapsed,
      hidden: _initialHidden,
      sectionId: _initialSectionId,
      ...stateWithoutGeometry
    } = baseState;

    const panelId = baseState.id;
    const initialVisual = clampGeometryToCanvas({
      x: baseX,
      y: baseY,
      width: baseWidth,
      height: baseHeight
    });
    const runtime = {
      dragSnapshot: null,
      visual: initialVisual,
      refreshActionOverflow: null
    };

    panelDomFacade?.mountPanel({
      panelId,
      panelState: baseState,
      runtime
    });

    updatePanelTitleDom(panelId, resolvePanelTitle(baseState));

    applyPanelGeometry(panelId, initialVisual, { persistNormalized: true });
    applyPanelZIndex(panelId);
    const targetType = getPanelType(baseState.type);
    if (targetType?.capabilities?.plot !== false) {
      normalizePanelTraces(panelId);
      renderPlot(panelId);
    } else {
      refreshPanelContentDom(panelId);
    }
    panelInteractions.attach(panelId);
    updateCanvasState();
    updateToolbarMetrics();
    renderBrowser();
    setActivePanel(panelId);
    refreshPanelVisibility();

    if (!skipPersist) {
      persist();
    }

    updateHistoryButtons();
    return panelId;
  };

  const runtimeState = createRuntimeState({
    panelsModel,
    sections,
    sectionManager,
    defaultSectionId: DEFAULT_SECTION_ID,
    panelDomRegistry,
    getPanelDom,
    getActivePanelId,
    setActivePanel,
    getNextPanelSequence,
    managers: {
      panelPreferences,
      colorCursor: colorCursorManager,
      snapshot: snapshotManager
    },
    services: {
      history: historyHelpers
    },
    helpers: {
      colorCursor: colorCursorManager
    }
  });

  runtimeState.services = runtimeState.services || {};
  runtimeState.services.history = historyHelpers;
  runtimeState.services.persistence = persistence;
  runtimeState.services.snapshot = snapshotManager;
  runtimeState.managers = runtimeState.managers || {};
  runtimeState.managers.snapshot = snapshotManager;

  const panelsFacade = createPanelsFacade({
    models: { panelsModel },
    plot: { renderNow: renderPlot },
    history: historyHelpers,
    persistence: { persist },
    browser: { renderBrowser, refreshPanelVisibility, updateCanvasState },
    dom: {
      detachPanelDom
    },
    state: runtimeState,
    utils: {
      ensureArray,
      deepClone,
      decodeName,
      ensureTraceId,
      toHexColor,
      defaultLayout,
      pickColor,
      allocateTraceColor,
      showToast,
      clampGeometryToCanvas,
      fallbackColor: () => getFallbackTraceColor()
    },
    services: { uploadTraceFile },
    registry: { registerPanel }
  });

({
  normalizePanelTraces,
  createTraceFromPayload,
  ingestPayloadAsPanel,
  addTracesToPanel,
  appendFilesToGraph,
  moveTrace,
  moveGraph,
  removePanel
} = panelsFacade);

  clearPanels = ({ skipHistory = false } = {}) => {
    const hasAnyPanels = panelDomRegistry.size > 0 || panelsModel.getPanelsInIndexOrder().length > 0;
    if (!hasAnyPanels) {
      if (!skipHistory) {
        updateHistoryButtons();
      }
      return;
    }

    if (!skipHistory) {
      pushHistory();
    }

    panelDomRegistry.forEach((handles) => {
      handles?.rootEl?.remove();
    });
    panelDomRegistry.clear();
    panelsModel.load({ counter: 0, items: [] });
    sectionManager.reset();
    ensureDefaultSection();
    pendingRenameSectionId = null;

    setActivePanel(null);
    colorCursorManager.reset();
    refreshPanelVisibility();
    updateToolbarMetrics();
    updateCanvasState();
    renderBrowser();
    persist();
    updateHistoryButtons();
  };

  const { handleHeaderAction } = createHeaderActions({
    actionsController: Actions,
    history: historyHelpers,
    historyApi: {
      undo: (...args) => undo(...args),
      redo: (...args) => redo(...args)
    },
    permissions: {
      isPanelEditLocked
    },
    selectors: {
      getPanelDom,
      getPanelFigure,
      getPanelContent,
      getTopPanelZIndex
    },
    traces: {
      normalizePanelTraces,
      renderPlot
    },
    plot: {
      exportFigure: exportPlotFigure,
      resize: (panelId) => resizePlotForPanel(panelId)
    },
    panels: {
      ingestPayloadAsPanel,
      addTracesToPanel
    }
  });

  panelLockController = createPanelLockController({
    getPanelDom,
    getPanelFigure,
    updatePanelFigure,
    renderPlot,
    pushHistory,
    updateHistoryButtons,
    persist,
    panelSupportsPlot,
    showToast
  });

    unitsToggleController = createUnitsToggleController({
      dom: {
        toggleButton: document.getElementById('tb2_peak_integration'),
        menu: document.querySelector('[data-units-menu]')
      },
      getActivePanelId,
      getPanelDom,
      getPanelFigure,
      updatePanelFigure,
      renderPlot,
      pushHistory,
      updateHistoryButtons,
      persist,
      panelSupportsPlot,
      isPanelEditLocked,
      showToast
    });
    multiTraceController = createMultiTraceController({
      dom: {
        toggleButton: document.getElementById('tb2_multi_trace'),
        menu: document.querySelector('[data-multitrace-menu]')
      },
      getActivePanelId,
      getPanelFigure,
      updatePanelFigure,
      renderPlot,
      pushHistory,
      updateHistoryButtons,
      persist,
      panelSupportsPlot,
      isPanelEditLocked,
      showToast
    });
    techToolbarLabelController?.registerHandler?.('units-toggle', ({ event } = {}) => {
      event?.preventDefault?.();
      unitsToggleController?.handleToggle?.();
    });
    techToolbarLabelController?.registerHandler?.('multi-trace', ({ event } = {}) => {
      event?.preventDefault?.();
      multiTraceController?.handleToggle?.();
    });
    techToolbarHoverController = createTechToolbarHoverController({
      items: [
        {
          toggle: document.getElementById('tb2_peak_marking'),
          menu: document.querySelector('[data-peak-menu]')
        },
        {
          toggle: document.getElementById('tb2_peak_integration'),
          menu: document.querySelector('[data-units-menu]'),
          suppressClickToggle: true
        },
        {
          toggle: document.getElementById('tb2_multi_trace'),
          menu: document.querySelector('[data-multitrace-menu]'),
          suppressClickToggle: true
        },
        {
          toggle: document.getElementById('tb2_atr_correction'),
          menu: document.querySelector('[data-atr-menu]')
        },
        {
          toggle: document.getElementById('tb2_derivatization'),
          menu: document.querySelector('[data-derivatization-menu]')
        },
        {
          toggle: document.getElementById('tb2_spectral_library'),
          menu: document.querySelector('[data-library-menu]')
        },
        {
          toggle: document.getElementById('tb2_placeholder_help'),
          menu: document.querySelector('[data-integration-menu]')
        }
      ]
    });
    techToolbarPinController = createTechToolbarPinController({
      dom: {
        toolbar: verticalToolbar,
        toggle: document.querySelector('[data-tech-pin-toggle]')
      },
      getActivePanelId,
      getPanelDom,
      panelSupportsPlot,
      updateToolbarMetrics,
      preferences: preferencesFacade
    });
    techToolbarHeaderVisibilityController = createTechToolbarHeaderVisibilityController({
      dom: {
        toggle: document.querySelector('[data-hide-inactive-headers-toggle]')
      },
      preferences: preferencesFacade
    });
    techToolbarModebarVisibilityController = createTechToolbarModebarVisibilityController({
      dom: {
        toggle: document.querySelector('[data-hide-modebar-toggle]')
      },
      preferences: preferencesFacade
    });

  templatesController = createTemplatesController({
    getPanelDom,
    getPanelFigure,
    updatePanelFigure,
    renderPlot,
    pushHistory,
    updateHistoryButtons,
    persist,
    panelSupportsPlot,
    isPanelEditLocked,
    showToast
  });

  stylePainterController = createStylePainterController({
    canvas,
    getPanelDom,
    getPanelFigure,
    updatePanelFigure,
    renderPlot,
    pushHistory,
    updateHistoryButtons,
    persist,
    panelSupportsPlot,
    isPanelEditLocked,
    showToast,
    onTraceStyleChange: (panelId) => peakMarkingController?.handleTraceStyleChange?.(panelId)
  });

  panelDomFacade = createPanelDomFacade({
    canvas,
    registerPanelDom,
    updatePanelRuntime,
    actions: {
      handleHeaderAction,
      removePanel: (panelId) => removePanel(panelId),
      bringPanelToFront,
      updateToolbarMetrics,
      startPanelRename,
      setPanelContent,
      onStylePainterSelectionChange: stylePainterController?.handleSelectionChange,
      onStylePainterPopoverOpen: stylePainterController?.handlePopoverOpen,
      onStylePainterButtonClick: stylePainterController?.handleButtonClick,
      onTemplatesPopoverOpen: templatesController?.handlePopoverOpen,
      onTemplatesSave: templatesController?.handleSaveTemplate,
      onTemplatesApply: templatesController?.handleApplyTemplate,
      onTemplatesRename: templatesController?.handleRenameTemplate,
      onTemplatesDelete: templatesController?.handleDeleteTemplate,
      onTemplatesDuplicate: templatesController?.handleDuplicateTemplate,
      onPanelLockToggle: panelLockController?.handleLockToggle,
      onPanelPinToggle: panelLockController?.handlePinToggle,
      onPanelVisibilityToggle: (panelId, opts) => setGraphVisibility(panelId, opts?.hidden ?? null)
    },
    selectors: {
      getPanelFigure,
      getPanelContent,
      listPlotPanels: listAvailablePlotPanels
    }
  });

  const globalCommandsController = createGlobalCommandsController({
    buttons: {
      markdownButton: markdownBtn,
      sheetButton: sheetBtn,
      imageBrowseButton: imageBrowseBtn,
      imageDriveButton: imageDriveBtn,
      imageLinkButton: imageLinkBtn
    },
    actions: {
      createPanel: createPanelOfType,
      openImagePicker,
      importImageFromDrive: () => showToast('Google Drive import is not implemented yet.', 'warning'),
      promptImageUrl: async () => {
        const url = window.prompt('Paste image URL');
        if (!url || !url.trim()) return;
        const trimmed = url.trim();
        try {
          showToast('Fetching image…', 'info', 1600);
          const dataUrl = await fetchRemoteImageAsDataUrl(trimmed);
          createImagePanelFromData(trimmed, dataUrl, { silent: true });
          showToast('Image loaded from URL.', 'success');
        } catch (err) {
          console.warn('Failed to fetch remote image, falling back to direct link.', err);
          createImagePanelFromData(trimmed, trimmed, { silent: true });
          showToast('Linked image added (remote fetch failed).', 'warning');
        }
      }
    }
  });
  const toolbarShortcutsController = createToolbarShortcutsController({
    topToolbar,
    verticalToolbar
  });

  peakMarkingController = createPeakMarkingController({
    toggle: document.getElementById('tb2_peak_marking'),
    menu: document.querySelector('[data-peak-menu]'),
    getActivePanelId,
    getPanelRecord,
    getPanelFigure,
    updatePanelFigure,
    getPanelDom,
    panelSupportsPlot,
    renderPlot,
    handleHeaderAction,
    pushHistory,
    showToast,
    updateCanvasState,
    persist,
    scheduleCanvasSync,
    updateHistoryButtons
  });
  if (peakMarkingController?.handleActivePanelChange) {
    peakMarkingController.handleActivePanelChange(getActivePanelId?.() || null);
  }

  const handleArrangeRequest = (mode, { includeNonPlots = arrangeIncludeAllPanels } = {}) => {
    const panels = gatherVisiblePanelsByType({ includeNonPlots });
    if (!panels.length) {
      showToast(includeNonPlots ? 'No panels available to arrange.' : 'No graphs available to arrange.', 'info');
      return;
    }
    const metrics = computeCommonPanelSizing(panels);
    const label = mode === 'stack'
      ? 'stack'
      : mode === 'cascade'
        ? 'cascade'
        : 'tile';
    const padding = 24;
    const viewportOffsetX = Math.round(metrics.canvas.width * 0.20);
    const viewportOffsetY = Math.round(metrics.canvas.height * 0.06);
    const originX = padding + viewportOffsetX;
    const originY = padding + viewportOffsetY;
    const clampAxis = (value, size, axis) =>
      Math.max(padding, Math.min(value, axis - size - padding));
    const clampX = (value, width = metrics.width) => clampAxis(value, width, metrics.canvas.width);
    const clampY = (value, height = metrics.height) => clampAxis(value, height, metrics.canvas.height);
    let geometries = [];
    if (mode === 'stack') {
      const x = clampX(originX);
      const y = clampY(originY);
      geometries = panels.map((panel) => ({
        panelId: panel.id,
        x,
        y,
        width: metrics.width,
        height: metrics.height
      }));
    } else if (mode === 'cascade') {
      geometries = panels.map((panel, idx) => {
        const offsetX = metrics.cascadeOffset.x * idx;
        const offsetY = metrics.cascadeOffset.y * idx;
        const x = clampX(originX + offsetX);
        const y = clampY(originY + offsetY);
        return {
          panelId: panel.id,
          x,
          y,
          width: metrics.width,
          height: metrics.height
        };
      });
    } else {
      const gutter = metrics.tile.gutter;
      const columns = Math.max(1, metrics.tile.columns);
      let col = 0;
      let row = 0;
      geometries = panels.map((panel) => {
        const availableWidth = Math.max(metrics.width, Math.floor((metrics.canvas.width - gutter * (columns + 1)) / columns));
        const adjustedWidth = Math.max(200, Math.min(metrics.width, availableWidth));
        const adjustedHeight = metrics.height;
        const x = clampX(originX + col * (adjustedWidth + gutter), adjustedWidth);
        const y = clampY(originY + row * (adjustedHeight + gutter), adjustedHeight);
        col += 1;
        if (col >= columns) {
          col = 0;
          row += 1;
        }
        return {
          panelId: panel.id,
          x: clampX(x),
          y: clampY(y),
          width: adjustedWidth,
          height: adjustedHeight
        };
      });
    }
    pushHistory({ label: `Arrange panels (${label})` });
    geometries.forEach((geometry, idx) => {
      const normalized = applyPanelGeometry(geometry.panelId, geometry, { persistNormalized: true });
      panelsModel.setPanelGeometry(geometry.panelId, normalized || geometry);
      panelsModel.setPanelZIndex(geometry.panelId, idx + 1);
      applyPanelZIndex(geometry.panelId);
    });
    persist();
    updateHistoryButtons();
    updateCanvasState();
    renderBrowser();
    showToast(`Arranged ${panels.length} panel${panels.length === 1 ? '' : 's'} in ${label} layout.`, 'success');
  };

  alignStackBtn?.addEventListener('click', () => handleArrangeRequest('stack'));
  alignCascadeBtn?.addEventListener('click', () => handleArrangeRequest('cascade'));
  alignTileBtn?.addEventListener('click', () => handleArrangeRequest('tile'));
  alignIncludeAllToggle?.addEventListener('click', () => {
    setArrangeIncludeAllPanels(!arrangeIncludeAllPanels);
    const stateLabel = arrangeIncludeAllPanels ? 'including' : 'excluding';
    showToast(`Arrange tools now ${stateLabel} non-plot panels.`, 'info');
  });
  scriptBtn?.addEventListener('click', () => {
    showToast('Custom scripts with Python and JS will be available in future versions.', 'info');
  });

  const ioFacade = createIoFacade({
    dom: {
      canvas,
      emptyOverlay,
      browseBtn,
      importFolderBtn,
      fileInput,
      folderInput,
      demoBtn,
      addPlotBtn,
      resetBtn
    },
    services: {
      uploadTraceFile,
      fetchDemoFiles
    },
    actions: {
      ingestPanel: ingestPayloadAsPanel,
      appendFilesToGraph,
      clearPanels,
      renderBrowser,
      updateCanvasState,
      focusPanel: focusPanelById,
      createSection,
      findSectionByName
    },
    history: {
      history,
      pushHistory,
      updateHistoryButtons
    },
    persistence: { persist },
    notifications: { showToast },
    state: runtimeState,
    helpers: {
      resetColorCursor: () => {
        colorCursorManager.reset();
      }
    },
    utils: { decodeName }
  });
  ioFacade.attach();
  runtimeState.services.io = ioFacade;
  runtimeState.helpers = runtimeState.helpers || {};
  runtimeState.helpers.resetColorCursor = () => colorCursorManager.reset();
  runtimeState.theme = {
    getActiveTheme,
    updateTheme: updateActiveTheme,
    subscribe: subscribeToThemes,
    getSwatches: () => ({
      canvasBackgrounds: themeSwatches.canvasBackgrounds.slice(),
      panelChrome: themeSwatches.panelChrome.slice(),
      plotSurface: themeSwatches.plotSurface.slice(),
      tracePalette: themeSwatches.tracePalette.slice(),
      plotDesign: { ...themeSwatches.plotDesign }
    }),
    getCustomThemes,
    saveCustomThemeSlot,
    getPanelChromeHistory,
    recordPanelChromeHistory
  };
  themeMenuControls = initThemeMenuControls();

  const preferencesToggleBtn = document.getElementById('c_canvas_preferences_toggle');
  const multiImportToggleEl = document.getElementById('pref_multi_import_toggle');
  const getIoPreferenceService = () => runtimeState?.services?.io || ioFacade;
  const syncMultiImportToggle = () => {
    if (!multiImportToggleEl) return;
    const pref = getIoPreferenceService()?.getMultiImportPreference?.();
    multiImportToggleEl.checked = pref === 'combined';
  };
  multiImportToggleEl?.addEventListener('change', () => {
    const service = getIoPreferenceService();
    if (multiImportToggleEl.checked) {
      service?.setMultiImportPreference?.('combined');
    } else {
      service?.setMultiImportPreference?.(null);
    }
  });
  preferencesToggleBtn?.addEventListener('click', () => syncMultiImportToggle());
  preferencesToggleBtn?.addEventListener('mouseenter', () => syncMultiImportToggle());
  if (typeof window !== 'undefined' && window.bootstrap?.Dropdown && preferencesToggleBtn) {
    preferencesToggleBtn.addEventListener('shown.bs.dropdown', () => syncMultiImportToggle());
  }
  syncMultiImportToggle();

  packageBundleBtn?.addEventListener('click', () => {
    void handleOneClickBundle();
  });
  packageBackupBtn?.addEventListener('click', () => {
    void handleWorkspaceBackup();
  });
  packageItemsBtn?.addEventListener('click', () => {
    void handleExportItemsZip();
  });

  const disableSnapshotButton = (btn) => {
    if (!btn) return;
    btn.disabled = true;
    if (activeCanvasId && !userAuthenticated) {
      btn.title = 'Sign in to access project snapshots.';
    } else {
      btn.title = 'Snapshots available when editing a project canvas.';
    }
  };

  if (cloudSyncEnabled && activeCanvasId && (snapshotSaveBtn || snapshotManageBtn) && snapshotModalEl) {
    initCanvasSnapshots({
      bridge: {
        id: activeCanvasId,
        defaultTitle: document.body?.dataset?.activeCanvasTitle || 'Workspace',
        async save(state, label) {
          if (!state) return;
          await saveCanvasState(activeCanvasId, {
            state,
            version_label: label || document.body?.dataset?.activeCanvasTitle || ''
          });
        },
        applyLocal: (state) => {
          if (!state) return;
          restoreSnapshot(state, { skipHistory: true });
        }
      },
      saveButton: snapshotSaveBtn,
      manageButton: snapshotManageBtn,
      modal: snapshotModalEl
    });
  } else {
    disableSnapshotButton(snapshotSaveBtn);
    disableSnapshotButton(snapshotManageBtn);
  }

  // --- UI event bindings ---

  panelDom.pin?.addEventListener('click', () => {
    const nextPinned = !(panelPreferences?.isPanelPinned?.() ?? false);
    panelPreferences?.setPinned?.(nextPinned);
  });

  panelDom.toggle?.addEventListener('click', () => {
    const nextPinned = !(panelPreferences?.isPanelPinned?.() ?? false);
    panelPreferences?.setPinned?.(nextPinned);
  });

  panelDom.root?.addEventListener('mouseenter', handlePanelHoverEnter);
  panelDom.root?.addEventListener('mouseleave', handlePanelMouseLeave);
  browserHotspot?.addEventListener('pointerenter', handlePanelHoverEnter);
  browserHotspot?.addEventListener('pointerleave', handleHotspotLeave);
  browserHotspot?.addEventListener('click', () => {
    if (!panelDom.root) return;
    if (panelPreferences?.isPanelPinned?.() && isPanelCollapsed()) {
      panelPreferences?.setCollapsed?.(false);
    }
  });

  panelDom.searchInput?.addEventListener('input', (evt) => {
    searchTerm = evt.target.value || '';
    renderBrowser();
  });

  panelDom.searchInput?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      panelDom.searchInput.value = '';
      searchTerm = '';
      panelDom.searchInput.blur();
      renderBrowser();
    }
  });

  const syncBrowserFilterControls = () => {
    panelDom.filterToggles?.forEach((toggle) => {
      const typeId = toggle?.dataset?.panelType || null;
      if (typeId === 'all') {
        toggle.checked = areAllPanelTypesEnabled();
      } else {
        toggle.checked = isPanelTypeEnabledSelector(typeId);
      }
    });
    if (panelDom.filterButton) {
      const active = hasActivePanelTypeFilters();
      panelDom.filterButton.classList.toggle('is-active', active);
      panelDom.filterButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  panelDom.filterToggles?.forEach((toggle) => {
    toggle.addEventListener('change', (event) => {
      const target = event.target;
      if (!target) return;
      const typeId = target.dataset?.panelType || null;
      if (typeId === 'all') {
        setAllPanelTypeFilters(target.checked);
        syncBrowserFilterControls();
        renderBrowser();
        return;
      }
      setPanelTypeFilter(typeId, target.checked);
      syncBrowserFilterControls();
      renderBrowser();
    });
  });
  syncBrowserFilterControls();

  browserFacade = createBrowserFacade({
    dom: { panelDom },
    state: {
      sections,
      getSectionOrder: () => sectionManager.getOrder(),
      defaultSectionId: DEFAULT_SECTION_ID,
      getSearchTerm,
      getPanelsOrdered,
      coerceNumber,
      getActivePanelId
    },
    selectors: {
      ensureArray,
      getPanelTraces: getBrowserPanelTraces,
      normalizePanelTraces,
      getPanelFigure,
      isSectionVisible,
      getPanelRecord,
      isPlotPanel: (typeId) => {
        const config = getPanelType(typeId);
        return config?.capabilities?.plot !== false;
      },
      isPanelTypeEnabled: (typeId) => isPanelTypeEnabledSelector(typeId),
      getPanelTypeFilters: () => getPanelTypeFiltersSnapshot()
    },
    actions: {
      renderPlot,
      updateTraceChip,
      pushHistory,
      history,
      persist,
      updateHistoryButtons,
      addGraphToSection,
      toggleGraphVisibility,
      togglePanelCollapsedState,
      toggleSectionCollapsedState,
      toggleSectionVisibility,
      moveTrace,
      moveGraph,
      moveSection,
      removePanel,
      deleteSectionInteractive,
      deleteGraphInteractive,
      requestGraphFileBrowse: ioFacade.requestGraphFileBrowse,
      showToast,
      queueSectionRename,
      startSectionRename,
      startPanelRename,
      getPendingRenameSectionId: () => pendingRenameSectionId,
      clearPendingRenameSectionId: () => {
        pendingRenameSectionId = null;
      },
      createSection,
      renameSection,
      setSectionCollapsed,
      setActivePanel,
      focusSectionById,
      focusPanelById,
      bringPanelToFront,
      ensureChipPanelsMount,
      refreshPanelVisibility,
      applyActivePanelState
    },
    drag: {
      setDropTarget,
      getDragState,
      setDragState,
      traceDragMime: TRACE_DRAG_MIME
    },
    services: {
      panelsModel,
      chipPanelsBridge
    },
    flags: {
      isPanelPinned: () => panelPreferences?.isPanelPinned?.() ?? false
    }
  });

  if (panelDom.tree) {
    browserFacade.attachEvents();
    browserFacade.attachDragDrop();
    refreshAllPanelFocus();
  }

  renderBrowser();

  if (panelDom.newSection) {
    panelDom.newSection.disabled = false;
    panelDom.newSection.addEventListener('click', () => {
      pushHistory();
      const section = createSection();
      queueSectionRename(section.id);
      renderBrowser();
      persist();
      updateHistoryButtons();
    });
  }

  const hadSnapshotOnBoot = storage.hasSnapshot?.() ?? false;
  const saved = storage.load?.();
  const shouldHydrateDashboardCanvas = cloudSyncEnabled && !!activeCanvasId;
  const notifyGuestCloudUnavailable = () => {
    if (activeCanvasId && !userAuthenticated) {
      showToast('Sign in to load and sync this canvas. Working offline for now.', 'info');
    }
  };

  if (shouldHydrateDashboardCanvas) {
    history?.clear?.();
    updateCanvasState();
    renderBrowser();
    void hydrateDashboardCanvasState(activeCanvasId, {
      fallbackSnapshot: saved,
      hadSnapshotOnBoot
    });
  } else if (saved) {
    restoreSnapshot(saved, { skipHistory: true });
    history?.clear?.();
    notifyGuestCloudUnavailable();
  } else {
    updateCanvasState();
    renderBrowser();
    history?.clear?.();
    if (hadSnapshotOnBoot) {
      showToast('Saved workspace snapshot could not be restored. Starting with defaults.', 'warning');
    } else {
      notifyGuestCloudUnavailable();
    }
  }

  function createPeakMarkingController({
    toggle,
    menu,
    getActivePanelId,
    getPanelRecord,
    getPanelFigure,
    updatePanelFigure,
    getPanelDom,
    panelSupportsPlot,
    renderPlot,
    handleHeaderAction,
    pushHistory: pushHistoryEntry,
    showToast: notify,
    updateCanvasState,
    persist,
    scheduleCanvasSync,
    updateHistoryButtons
  } = {}) {
    if (!toggle || !menu || typeof getActivePanelId !== 'function') {
      return null;
    }

    const dropdownApi = window.bootstrap?.Dropdown;
    const canvasRoot = document.getElementById('c_canvas_root');
    const manualClickHandlers = new Map();
    const relayoutHandlers = new Map();
    const tooltipHandlers = new Map();
    let peakDefaultsController = null;

    const dom = {
      sensitivity: menu.querySelector('[data-peak-control="sensitivity"]'),
      distance: menu.querySelector('[data-peak-control="distance"]'),
      baseline: menu.querySelector('[data-peak-control="baseline"]'),
      smoothing: menu.querySelector('[data-peak-control="smoothing"]'),
      manualModeAuto: menu.querySelector('[data-peak-control="manual-mode-auto"]'),
      manualPlacement: menu.querySelector('[data-peak-control="manual-mode"]'),
      autoVisibilityButton: menu.querySelector('[data-peak-auto-visibility]'),
      offsetAmount: menu.querySelector('[data-peak-control="marker-offset-amount"]'),
      offsetAmountLabel: menu.querySelector('[data-peak-offset-label]'),
      markerSize: menu.querySelector('[data-peak-control="marker-size"]'),
      markerSizeLabel: menu.querySelector('[data-peak-size-label]'),
      labelSize: menu.querySelector('[data-peak-control="label-size"]'),
      lineStyle: menu.querySelector('[data-peak-control="line-style"]'),
      labelPalette: menu.querySelector('[data-peak-label-palette]'),
      labelBox: menu.querySelector('[data-peak-control="label-box"]'),
      labelBoxThickness: menu.querySelector('[data-peak-control="label-box-thickness"]'),
      labelAlignButtons: Array.from(menu.querySelectorAll('[data-peak-label-align]')) || [],
      labelFormatButtons: Array.from(menu.querySelectorAll('[data-peak-label-format]')) || [],
      labelStyleButtons: Array.from(menu.querySelectorAll('[data-peak-label-style]')) || [],
      guideStyleButtons: Array.from(document.querySelectorAll('[data-peak-line-style]')) || [],
      labelReset: menu.querySelector('[data-peak-label-reset]'),
      sensitivityLabel: menu.querySelector('[data-peak-sensitivity-label]'),
      distanceLabel: menu.querySelector('[data-peak-distance-label]'),
      targetPrefix: menu.querySelector('[data-peak-target-prefix]'),
      targetLabel: menu.querySelector('[data-peak-target-label]'),
      menuToggle: menu.querySelector('[data-peak-menu-toggle]'),
      visibilityButtons: Array.from(menu.querySelectorAll('[data-peak-visibility]')),
      markerButtons: Array.from(menu.querySelectorAll('[data-peak-marker-style]')),
      chevronPreview: menu.querySelector('[data-peak-marker-style="chevron"] .workspace-peak-style-preview.chevron'),
      copyButton: menu.querySelector('[data-peak-copy]'),
      spreadsheetButton: menu.querySelector('[data-peak-export]'),
      clearManualButton: menu.querySelector('[data-peak-clear-manual]'),
      defaultActionButtons: Array.from(menu.querySelectorAll('[data-peak-default-action]'))
    };
    const labelOptions = {
      menu: menu.querySelector('.workspace-peak-label-options'),
      palette: menu.querySelector('[data-peak-label-palette]')
    };

    const listeners = [];
    const addListener = (node, event, handler) => {
      if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
      node.addEventListener(event, handler);
      listeners.push({ node, event, handler });
    };

    const hydrateLabelSwatches = () => {
      if (!labelOptions.palette) return;
      labelOptions.palette.innerHTML = '';
      const basePalette = TRACE_PALETTE_ROWS?.[0]?.colors || [];
      const defaultPalette = ['#000000', '#ffffff', ...basePalette];
      defaultPalette.forEach((color, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-swatch chip-swatch-lg';
        btn.style.setProperty('--c', color);
        btn.dataset.peakLabelColor = color;
        btn.setAttribute('aria-label', `Label color ${idx + 1}`);
        btn.addEventListener('click', () => {
          state.labelColor = color;
          labelOptions.palette.querySelectorAll('.chip-swatch').forEach((sw) => {
            sw.classList.toggle('is-active', sw === btn);
          });
          requestRerun();
        });
        labelOptions.palette.appendChild(btn);
        if (idx === 0) {
          btn.classList.add('is-active');
          state.labelColor = color;
        }
      });
    };

    const hidePeakMenu = () => {
      if (!dropdownApi || !toggle) return;
      const instance = dropdownApi.getOrCreateInstance
        ? dropdownApi.getOrCreateInstance(toggle)
        : dropdownApi.getInstance?.(toggle);
      instance?.hide?.();
    };

    const toNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const ensureArray = (value) => (Array.isArray(value) ? value : []);
    const expandRange = (range) => {
      if (!Array.isArray(range) || range.length !== 2) return null;
      const [min, max] = range;
      const pad = (max - min) * 0.05 || 0.5;
      return [min - pad, max + pad];
    };
    const setCursorButtonState = (panelId, isOn) => {
      if (!panelId || typeof getPanelDom !== 'function') return;
      const dom = getPanelDom(panelId);
      const btn = dom?.cursorButton;
      if (!btn) return;
      const next = !!isOn;
      btn.setAttribute('aria-pressed', String(next));
      btn.classList.toggle('is-active', next);
    };

    const readAxisRanges = (panelId) => {
      if (!panelId || typeof getPanelDom !== 'function') return null;
      const panelDom = getPanelDom(panelId);
      const plotEl = panelDom?.plotEl;
      const fullLayout = plotEl?._fullLayout;
      if (!fullLayout) return null;
      const ranges = {};
      if (Array.isArray(fullLayout.xaxis?.range)) {
        ranges.x = fullLayout.xaxis.range.slice();
      }
      if (Array.isArray(fullLayout.yaxis?.range)) {
        ranges.y = fullLayout.yaxis.range.slice();
      }
      return ranges;
    };

    const computeTraceRange = (traces, axisKey = 'y') => {
      const values = [];
      ensureArray(traces).forEach((trace) => {
        ensureArray(trace?.[axisKey]).forEach((value) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            values.push(numeric);
          }
        });
      });
      if (!values.length) return null;
      let min = values[0];
      let max = values[0];
      values.forEach((value) => {
        if (value < min) min = value;
        if (value > max) max = value;
      });
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      if (min === max) {
        const delta = Math.abs(min) || 1;
        return [min - delta * 0.05, max + delta * 0.05];
      }
      return [min, max];
    };

    const getActivePanel = () => getActivePanelId?.() || null;

    const state = {
      enabled: false,
      sensitivity: toNumber(dom.sensitivity?.value ?? 65, 65),
      distance: toNumber(dom.distance?.value ?? 35, 35),
      applyBaseline: dom.baseline?.checked ?? false,
      applySmoothing: dom.smoothing ? dom.smoothing.checked !== false : true,
      labelFormat: dom.labelFormatButtons?.find((btn) => btn.classList.contains('is-active'))?.dataset?.peakLabelFormat || 'wavenumber',
      lineStyle: dom.guideStyleButtons?.find((btn) => btn.classList.contains('is-active'))?.dataset?.peakLineStyle
        || dom.lineStyle?.value
        || 'solid',
      markerStyle: dom.markerButtons?.find((btn) => btn.classList.contains('is-active'))?.dataset?.peakMarkerStyle
        || dom.markerButtons?.[0]?.dataset?.peakMarkerStyle
        || 'dot',
      showMarkers: dom.visibilityButtons?.find((btn) => btn.dataset.peakVisibility === 'markers')?.classList.contains('is-active') ?? true,
      showLines: dom.visibilityButtons?.find((btn) => btn.dataset.peakVisibility === 'lines')?.classList.contains('is-active') ?? true,
      showLabels: dom.visibilityButtons?.find((btn) => btn.dataset.peakVisibility === 'labels')?.classList.contains('is-active') ?? false,
      showAutoMarkers: dom.autoVisibilityButton?.classList.contains('is-active') ?? true,
      manualPlacement: dom.manualPlacement?.checked ?? false,
      manualModeAuto: dom.manualModeAuto?.checked ?? true,
      offsetAmount: toNumber(dom.offsetAmount?.value ?? 0, 0),
      markerSize: toNumber(dom.markerSize?.value ?? 12, 12),
      labelSize: toNumber(dom.labelSize?.value ?? 11, 11),
      labelColor: null,
      labelBox: false,
      labelBoxThickness: 0,
      labelAlign: 'center',
      labelStyle: { bold: true, italic: false, underline: false, strike: false },
      detectionTarget: DEFAULT_PEAK_OPTIONS.target,
      activePanelAvailable: false
    };

    if (dom.labelStyleButtons?.length) {
      dom.labelStyleButtons.forEach((btn) => {
        const key = btn.dataset.peakLabelStyle;
        const active = key === 'bold';
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    let lastResult = { panelId: null, peaks: [] };
    let rerunHandle = null;
    let detectPeaksForPanel = null;
    const markerGlyph = {
      dot: '●',
      triangle: { symbol: '▲', altSymbol: '▼' },
      'triangle-down': { symbol: '▼', altSymbol: '▲' },
      square: '■',
      cross: '✚',
      slit: '|',
      chevron: { symbol: '⌃', altSymbol: '⌄' }
    };

    const setToggleState = (enabled) => {
      state.enabled = enabled;
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.classList.toggle('is-active', enabled);
        // Highlight the peak button when active on the focused graph.
        toggle.classList.toggle('btn-primary', enabled);
        toggle.classList.toggle('btn-outline-secondary', !enabled);
      }
      if (dom.menuToggle) {
        dom.menuToggle.checked = enabled;
        dom.menuToggle.disabled = !state.activePanelAvailable;
      }
    };

    const setAutoVisibility = (visible) => {
      state.showAutoMarkers = !!visible;
      if (!dom.autoVisibilityButton) return;
      const label = state.showAutoMarkers ? 'Hide auto markers' : 'Show auto markers';
      dom.autoVisibilityButton.classList.toggle('is-active', state.showAutoMarkers);
      dom.autoVisibilityButton.setAttribute('aria-pressed', String(state.showAutoMarkers));
      dom.autoVisibilityButton.setAttribute('aria-label', label);
      dom.autoVisibilityButton.setAttribute('title', label);
      const icon = dom.autoVisibilityButton.querySelector('i');
      if (icon) {
        icon.classList.toggle('bi-eye', state.showAutoMarkers);
        icon.classList.toggle('bi-eye-slash', !state.showAutoMarkers);
      }
    };

    setAutoVisibility(state.showAutoMarkers);

    const describeSensitivity = (value) => {
      const labelValue = Math.round(value);
      if (value >= 70) return `high (${labelValue})`;
      if (value <= 30) return `low (${labelValue})`;
      return `mid (${labelValue})`;
    };

    const updateSensitivityLabel = () => {
      if (!dom.sensitivityLabel) return;
      dom.sensitivityLabel.textContent = describeSensitivity(state.sensitivity);
    };

    const updateDistanceLabel = () => {
      if (!dom.distanceLabel) return;
      const value = Math.max(0, state.distance);
      dom.distanceLabel.textContent = value <= 0 ? '0 cm⁻¹' : `${value} cm⁻¹`;
    };

    const updateOffsetLabel = () => {
      if (!dom.offsetAmountLabel) return;
      dom.offsetAmountLabel.textContent = `${Math.round(Math.max(0, state.offsetAmount))}%`;
    };

    const updateMarkerSizeLabel = () => {
      if (!dom.markerSizeLabel) return;
      dom.markerSizeLabel.textContent = `${Math.round(Math.max(1, state.markerSize))} px`;
    };

      const setManualPlacement = (enabled) => {
      state.manualPlacement = !!enabled;
      state.manualModeAuto = !enabled;
      if (dom.manualModeAuto) {
        dom.manualModeAuto.checked = state.manualModeAuto;
      }
      if (dom.manualPlacement) {
        dom.manualPlacement.checked = state.manualPlacement;
      }
      const panelId = getActivePanel();
      if (!panelId || typeof getPanelFigure !== 'function') return;
      const figure = getPanelFigure(panelId);
      if (!figure) return;
      const nextFigure = {
        ...figure,
        layout: {
          ...(figure.layout || {}),
          meta: {
            ...(figure.layout?.meta || {}),
            peakMarking: {
              ...(figure.layout?.meta?.peakMarking || {}),
              manualPlacement: state.manualPlacement
            }
          }
        }
      };
      updatePanelFigure(panelId, nextFigure);
      renderPlot(panelId);
      if (typeof handleHeaderAction === 'function') {
        handleHeaderAction(panelId, 'cursor', { on: state.manualPlacement });
      }
      setCursorButtonState(panelId, state.manualPlacement);
      updateCanvasState();
      persist();
      scheduleCanvasSync();
    };

    const figureHasPeakOverlays = (figure) => {
      if (!figure) return false;
      const shapes = ensureArray(figure.layout?.shapes);
      const annotations = ensureArray(figure.layout?.annotations);
      return shapes.some((shape) => shape?.meta?.peakOverlay === true)
        || annotations.some((ann) => ann?.meta?.peakOverlay === true);
    };

    const updateTargetLabel = (panelId) => {
      const hasTargetLabel = !!dom.targetLabel;
      if (!panelId) {
        if (hasTargetLabel) {
          if (dom.targetPrefix) dom.targetPrefix.textContent = '';
          dom.targetLabel.textContent = 'Select a plot to mark peaks';
        }
        state.activePanelAvailable = false;
        setToggleState(false);
        setMenuEnabled(false);
        return;
      }
      const isPlot = typeof panelSupportsPlot === 'function' ? panelSupportsPlot(panelId) : true;
      if (!isPlot) {
        if (hasTargetLabel) {
          if (dom.targetPrefix) dom.targetPrefix.textContent = '';
          dom.targetLabel.textContent = 'Select a plot to mark peaks';
        }
        state.activePanelAvailable = false;
        setToggleState(false);
        setMenuEnabled(false);
        return;
      }
      const record = typeof getPanelRecord === 'function' ? getPanelRecord(panelId) : null;
      const title = record ? resolvePanelTitle(record) : 'Graph';
      if (hasTargetLabel) {
        if (dom.targetPrefix) dom.targetPrefix.textContent = 'Mark peaks for ';
        dom.targetLabel.textContent = title;
      }
      state.activePanelAvailable = true;
      setMenuEnabled(true);
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
      const meta = figure?.layout?.meta?.peakMarking;
      const overlaysActive = figureHasPeakOverlays(figure);
      setToggleState(meta?.enabled === true || overlaysActive);
    };

    const syncMenuFromFigure = (panelId) => {
      if (!panelId || typeof getPanelFigure !== 'function') return;
      const figure = getPanelFigure(panelId);
      const meta = figure?.layout?.meta?.peakMarking;
      const detection = meta?.detection || {};
      const display = meta?.display || {};

      // Detection controls
      if (dom.manualPlacement) {
        state.manualPlacement = !!meta?.manualPlacement;
        dom.manualPlacement.checked = state.manualPlacement;
      }
      if (dom.manualModeAuto) {
        state.manualModeAuto = !state.manualPlacement;
        dom.manualModeAuto.checked = state.manualModeAuto;
      }
      if (state.manualPlacement && typeof handleHeaderAction === 'function' && panelId) {
        handleHeaderAction(panelId, 'cursor', { on: true });
      }
      setCursorButtonState(panelId, state.manualPlacement);
      if (dom.sensitivity && Number.isFinite(detection.sensitivity)) {
        state.sensitivity = Math.round(detection.sensitivity * 100);
        dom.sensitivity.value = state.sensitivity;
        updateSensitivityLabel();
      }
      if (dom.distance && Number.isFinite(detection.minDistance)) {
        state.distance = detection.minDistance;
        dom.distance.value = state.distance;
        updateDistanceLabel();
      }
      if (dom.baseline) {
        state.applyBaseline = !!detection.applyBaseline;
        dom.baseline.checked = state.applyBaseline;
      }
      if (dom.smoothing) {
        state.applySmoothing = detection.applySmoothing !== false;
        dom.smoothing.checked = state.applySmoothing;
      }
      state.detectionTarget = typeof detection.target === 'string' ? detection.target : DEFAULT_PEAK_OPTIONS.target;
      updateChevronPreview(state.detectionTarget);
      const resolvedOffset = typeof display.offsetAmount === 'number'
        ? display.offsetAmount
        : (display.offsetMarkers === false ? 0 : state.offsetAmount);
      state.offsetAmount = resolvedOffset;
      if (dom.offsetAmount) {
        dom.offsetAmount.value = resolvedOffset;
        updateOffsetLabel();
      }
      const resolvedSize = typeof display.markerSize === 'number' ? display.markerSize : state.markerSize;
      state.markerSize = resolvedSize;
      if (dom.markerSize) {
        dom.markerSize.value = resolvedSize;
        updateMarkerSizeLabel();
      }

      // Display controls
      const setToggle = (buttons, key, value) => {
        buttons.forEach((btn) => {
          const isActive = btn.dataset.peakVisibility === key ? value : btn.classList.contains('is-active');
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-pressed', String(isActive));
        });
      };
      if (display.showMarkers !== undefined) {
        setToggle(dom.visibilityButtons, 'markers', display.showMarkers);
        state.showMarkers = !!display.showMarkers;
      }
      if (display.showLines !== undefined) {
        setToggle(dom.visibilityButtons, 'lines', display.showLines);
        state.showLines = !!display.showLines;
      }
      if (display.showLabels !== undefined) {
        setToggle(dom.visibilityButtons, 'labels', display.showLabels);
        state.showLabels = !!display.showLabels;
      }
      if (display.showAutoMarkers !== undefined) {
        setAutoVisibility(display.showAutoMarkers);
      }

      if (display.markerStyle && dom.markerButtons.length) {
        dom.markerButtons.forEach((btn) => {
          const active = btn.dataset.peakMarkerStyle === display.markerStyle;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
        state.markerStyle = display.markerStyle;
      }
      if (dom.labelSize && Number.isFinite(display.labelSize)) {
        state.labelSize = display.labelSize;
        dom.labelSize.value = display.labelSize;
      }
      if (dom.labelFormatButtons?.length && typeof display.labelFormat === 'string') {
        state.labelFormat = display.labelFormat;
        dom.labelFormatButtons.forEach((btn) => {
          const active = btn.dataset.peakLabelFormat === display.labelFormat;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      if (labelOptions.palette && display.labelColor) {
        state.labelColor = display.labelColor;
        labelOptions.palette.querySelectorAll('.chip-swatch').forEach((sw) => {
          const active = sw.dataset.peakLabelColor === display.labelColor;
          sw.classList.toggle('is-active', active);
        });
      }
      const boxThickness = Number.isFinite(display.labelBoxThickness) ? display.labelBoxThickness : (display.labelBox ? 1 : 0);
      state.labelBoxThickness = boxThickness;
      state.labelBox = boxThickness > 0;
      if (dom.labelBoxThickness) {
        dom.labelBoxThickness.value = boxThickness;
      }
      if (dom.labelAlignButtons?.length && typeof display.labelAlign === 'string') {
        const align = ['left', 'center', 'right'].includes(display.labelAlign) ? display.labelAlign : 'center';
        state.labelAlign = align;
        dom.labelAlignButtons.forEach((btn) => {
          const active = btn.dataset.peakLabelAlign === align;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      if (dom.labelStyleButtons?.length && display.labelStyle && typeof display.labelStyle === 'object') {
        state.labelStyle = {
          bold: display.labelStyle.bold === true,
          italic: display.labelStyle.italic === true,
          underline: display.labelStyle.underline === true,
          strike: display.labelStyle.strike === true
        };
        dom.labelStyleButtons.forEach((btn) => {
          const key = btn.dataset.peakLabelStyle;
          const active = state.labelStyle[key] === true;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      } else if (dom.labelStyleButtons?.length) {
        state.labelStyle = { bold: true, italic: false, underline: false, strike: false };
        dom.labelStyleButtons.forEach((btn) => {
          const key = btn.dataset.peakLabelStyle;
          const active = key === 'bold';
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      if (dom.guideStyleButtons?.length && typeof display.lineStyle === 'string') {
        state.lineStyle = display.lineStyle;
        dom.guideStyleButtons.forEach((btn) => {
          const active = btn.dataset.peakLineStyle === display.lineStyle;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      } else if (dom.lineStyle && typeof display.lineStyle === 'string') {
        dom.lineStyle.value = display.lineStyle;
        state.lineStyle = display.lineStyle;
      }
    };

    const writeToClipboard = async (text) => {
      if (!text) return false;
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand?.('copy');
      textarea.remove();
      return !!success;
    };

    const cancelScheduledRerun = () => {
      if (!rerunHandle) return;
      if (typeof window !== 'undefined') {
        window.cancelAnimationFrame?.(rerunHandle);
        window.clearTimeout?.(rerunHandle);
      }
      rerunHandle = null;
    };

    const requestRerun = () => {
      if (!state.enabled) return;
      if (typeof detectPeaksForPanel !== 'function') return;
      const panelId = getActivePanel();
      if (!panelId) return;
      cancelScheduledRerun();
      const run = () => {
        rerunHandle = null;
        detectPeaksForPanel(panelId, { silentEmpty: true });
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rerunHandle = window.requestAnimationFrame(run);
      } else {
        rerunHandle = window.setTimeout(run, 80);
      }
    };

    const getActiveTechKey = () => techSelectorController?.toggle?.dataset?.techKey || 'default';

    const updateChevronPreview = (orientation) => {
      if (!dom.chevronPreview) return;
      const down = orientation === 'peak';
      dom.chevronPreview.classList.toggle('chevron-down', down);
      dom.chevronPreview.classList.toggle('chevron-up', !down);
    };

    const resolveMarkerGlyph = (peak, detectionTarget = null) => {
      const glyph = markerGlyph[state.markerStyle] || markerGlyph.dot;
      const useDetectionTarget = state.markerStyle === 'chevron';
      const orientation = useDetectionTarget && (detectionTarget === 'peak' || detectionTarget === 'dip')
        ? (detectionTarget === 'dip' ? 'peak' : 'dip') // invert to match visual cue
        : (peak?.direction === 'dip' ? 'peak' : 'dip');
      if (typeof glyph === 'string') return glyph;
      if (orientation === 'dip' && glyph.altSymbol) return glyph.altSymbol;
      if (orientation === 'peak' && glyph.symbol) return glyph.symbol;
      if (peak?.direction === 'dip' && glyph.altSymbol) return glyph.altSymbol;
      return glyph.symbol || glyph.altSymbol || markerGlyph.dot;
    };

    const buildMarkerAnnotations = (peaks, overrideColor = null, detectionTarget = null) => peaks.map((peak) => ({
      x: peak.x,
      y: peak.y,
      text: resolveMarkerGlyph(peak, detectionTarget),
      showarrow: false,
      font: {
        size: 18,
        color: overrideColor || peak.color || getFallbackTraceColor()
      },
      align: 'center',
      xanchor: 'center',
      yanchor: 'middle',
      bgcolor: 'transparent',
      borderpad: 0,
      meta: { peakOverlay: true, peakOverlayType: 'marker' }
    }));

    const commitFigure = (panelId, nextFigure) => {
      updatePanelFigure(panelId, nextFigure);
      renderPlot(panelId);
      updateCanvasState();
      persist();
      scheduleCanvasSync();
      updateHistoryButtons();
    };

    const baseFigureWithoutOverlays = (figure) => {
      const data = ensureArray(figure?.data).filter((trace) => trace?.meta?.peakOverlay !== true);
      const shapes = ensureArray(figure?.layout?.shapes).filter((shape) => shape?.meta?.peakOverlay !== true);
      const annotations = ensureArray(figure?.layout?.annotations).filter((ann) => ann?.meta?.peakOverlay !== true);
      const layout = {
        ...(figure?.layout || {}),
        shapes,
        annotations
      };
      return { data, layout };
    };

    const getDetectionOptions = () => ({
      ...DEFAULT_PEAK_OPTIONS,
      sensitivity: Math.min(1, Math.max(0.05, state.sensitivity / 100)),
      minDistance: Math.max(0, state.distance),
      applyBaseline: state.applyBaseline,
      applySmoothing: state.applySmoothing,
      target: state.detectionTarget || DEFAULT_PEAK_OPTIONS.target
    });

    const resolveDisplayOptions = (override = null) => {
      const base = {
        showMarkers: state.showMarkers,
        showLines: state.showLines,
        showLabels: state.showLabels,
        showAutoMarkers: state.showAutoMarkers,
        markerStyle: state.markerStyle,
        lineStyle: state.lineStyle,
        labelFormat: state.labelFormat,
        offsetAmount: state.offsetAmount,
        markerSize: state.markerSize,
        labelColor: state.labelColor,
        labelSize: state.labelSize,
        labelBox: state.labelBox,
        labelBoxThickness: state.labelBoxThickness,
        labelAlign: state.labelAlign,
        labelStyle: { ...(state.labelStyle || {}) }
      };
      if (!override || typeof override !== 'object') return base;
      const next = { ...base, ...override };
      if (override.labelStyle && typeof override.labelStyle === 'object') {
        next.labelStyle = {
          bold: override.labelStyle.bold === true,
          italic: override.labelStyle.italic === true,
          underline: override.labelStyle.underline === true,
          strike: override.labelStyle.strike === true
        };
      }
      return next;
    };

    const writeManualMarkers = (panelId, markers = []) => {
      if (!panelId || typeof getPanelFigure !== 'function') return;
      const figure = getPanelFigure(panelId);
      if (!figure) return;
      const nextFigure = {
        ...figure,
        layout: {
          ...(figure.layout || {}),
          meta: {
            ...(figure.layout?.meta || {}),
            manualMarkers: markers
          }
        }
      };
      updatePanelFigure(panelId, nextFigure);
      renderPlot(panelId);
      updateCanvasState();
      persist();
      scheduleCanvasSync();
    };

    const addManualMarker = (panelId, marker) => {
      if (!panelId || !marker) return false;
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
      if (!figure) return false;
      const existing = Array.isArray(figure?.layout?.meta?.manualMarkers)
        ? figure.layout.meta.manualMarkers.slice()
        : [];
      existing.push(marker);
      writeManualMarkers(panelId, existing);
      // Rebuild overlays with manual markers included.
      detectPeaksForPanel(panelId, { silentEmpty: true });
      return true;
    };

    const detachManualHandler = (panelId) => {
      const entry = manualClickHandlers.get(panelId);
      if (!entry) return;
      if (entry.plotEl) {
        if (typeof entry.plotEl.removeListener === 'function') {
          entry.plotEl.removeListener('plotly_click', entry.handler);
        } else if (typeof entry.plotEl.off === 'function') {
          entry.plotEl.off('plotly_click', entry.handler);
        }
      }
      manualClickHandlers.delete(panelId);
    };

    const attachManualHandler = (panelId) => {
      detachManualHandler(panelId);
      if (!state.manualPlacement) return;
      if (!panelId || typeof getPanelDom !== 'function') return;
      const panelDom = getPanelDom(panelId);
      const plotEl = panelDom?.plotEl;
      if (!plotEl || typeof plotEl.on !== 'function') return;
      const handler = (event) => {
        if (!state.manualPlacement) return;
        const pt = Array.isArray(event?.points) ? event.points.find((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : null;
        if (!pt) return;
        const isShift = !!event?.event?.shiftKey;
        const isMarker = pt?.data?.meta?.peakOverlay === true || pt?.customdata?.peakOverlay === true;
        if (isShift && isMarker) {
          event?.event?.preventDefault?.();
          event?.event?.stopPropagation?.();
          event?.event?.stopImmediatePropagation?.();
          const markerId = pt?.customdata?.id || pt?.data?.customdata?.[pt.pointIndex]?.id;
          const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
          if (!figure) return;
          const manualList = Array.isArray(figure?.layout?.meta?.manualMarkers) ? figure.layout.meta.manualMarkers.slice() : [];
          const manualIdx = manualList.findIndex((m) => m.id === markerId);
          if (manualIdx >= 0) {
            manualList.splice(manualIdx, 1);
            writeManualMarkers(panelId, manualList);
            detectPeaksForPanel(panelId, { silentEmpty: true });
            return;
          }
          const hidden = Array.isArray(figure?.layout?.meta?.peakMarking?.hiddenIds)
            ? figure.layout.meta.peakMarking.hiddenIds.slice()
            : [];
          if (markerId && !hidden.includes(markerId)) {
            hidden.push(markerId);
          }
          const nextFigure = {
            ...figure,
            layout: {
              ...(figure.layout || {}),
              meta: {
                ...(figure.layout?.meta || {}),
                peakMarking: {
                  ...(figure.layout?.meta?.peakMarking || {}),
                  hiddenIds: hidden
                }
              }
            }
          };
          updatePanelFigure(panelId, nextFigure);
          renderPlot(panelId);
          updateCanvasState();
          persist();
          scheduleCanvasSync();
          detectPeaksForPanel(panelId, { silentEmpty: true });
          return;
        }
        const marker = {
          id: `${panelId}-manual-${Date.now()}`,
          traceId: pt.data?.uid || pt.data?._canvasId || null,
          traceLabel: pt.data?.name || 'Trace',
          color: pt.data?.marker?.color || pt.data?.line?.color || null,
          x: pt.x,
          y: pt.y,
          snap: true,
          direction: 'peak'
        };
        addManualMarker(panelId, marker);
      };
      plotEl.on('plotly_click', handler);
      manualClickHandlers.set(panelId, { plotEl, handler });
    };

    const detachTooltipHandler = (panelId) => {
      const entry = tooltipHandlers.get(panelId);
      if (!entry) return;
      if (entry.plotEl) {
        if (typeof entry.plotEl.removeListener === 'function') {
          entry.plotEl.removeListener('plotly_click', entry.clickHandler);
        } else if (typeof entry.plotEl.off === 'function') {
          entry.plotEl.off('plotly_click', entry.clickHandler);
        }
      }
      tooltipHandlers.delete(panelId);
    };

    const attachTooltipHandler = (panelId) => {
      detachTooltipHandler(panelId);
      if (!panelId || typeof getPanelDom !== 'function') return;
      const panelDom = getPanelDom(panelId);
      const plotEl = panelDom?.plotEl;
      const Plotly = typeof window !== 'undefined' ? window.Plotly : null;
      if (!plotEl || typeof plotEl.on !== 'function' || !Plotly?.relayout) return;
      const isPeakMarker = (pt) => pt?.data?.meta?.peakOverlay === true
        && pt?.data?.meta?.peakOverlayType === 'marker';
      const buildTooltipText = (pt) => {
        const kind = pt?.customdata?.kind || 'Peak';
        const traceLabel = pt?.customdata?.traceLabel || 'Trace';
        const x = Number.isFinite(pt?.x) ? pt.x.toFixed(2) : pt?.x;
        const y = Number.isFinite(pt?.y) ? pt.y.toFixed(2) : pt?.y;
        return `${kind} ${traceLabel}<br>${x} cm^-1<br>Intensity ${y}`;
      };
      const clickHandler = (event) => {
        if (state.manualPlacement) return;
        const pt = Array.isArray(event?.points) ? event.points[0] : null;
        const baseAnnotations = ensureArray(plotEl.layout?.annotations);
        const keep = baseAnnotations.filter((ann) => ann?.meta?.peakOverlayType !== 'click-tooltip');
        if (!isPeakMarker(pt)) {
          if (keep.length !== baseAnnotations.length) {
            Plotly.relayout(plotEl, { annotations: keep });
          }
          return;
        }
        const hoverLabel = plotEl._fullLayout?.hoverlabel || {};
        const font = { ...(hoverLabel.font || {}) };
        if (!font.color) font.color = '#0f172a';
        if (!font.size) font.size = 12;
        const tooltip = {
          x: pt.x,
          y: pt.y,
          text: buildTooltipText(pt),
          showarrow: true,
          ax: 0,
          ay: -24,
          xanchor: 'center',
          yanchor: 'bottom',
          align: 'left',
          bgcolor: hoverLabel.bgcolor || '#ffffff',
          bordercolor: hoverLabel.bordercolor || '#0f172a',
          borderwidth: 1,
          font,
          meta: { peakOverlay: true, peakOverlayType: 'click-tooltip' }
        };
        Plotly.relayout(plotEl, { annotations: [...keep, tooltip] });
      };
      plotEl.on('plotly_click', clickHandler);
      tooltipHandlers.set(panelId, {
        plotEl,
        clickHandler
      });
    };

    const detachRelayoutHandler = (panelId) => {
      const entry = relayoutHandlers.get(panelId);
      if (!entry) return;
      if (entry.plotEl) {
        if (typeof entry.plotEl.removeListener === 'function') {
          entry.plotEl.removeListener('plotly_relayout', entry.handler);
        } else if (typeof entry.plotEl.off === 'function') {
          entry.plotEl.off('plotly_relayout', entry.handler);
        }
      }
      relayoutHandlers.delete(panelId);
    };

    const attachRelayoutHandler = (panelId) => {
      detachRelayoutHandler(panelId);
      if (!panelId || typeof getPanelDom !== 'function') return;
      const panelDom = getPanelDom(panelId);
      const plotEl = panelDom?.plotEl;
      const Plotly = typeof window !== 'undefined' ? window.Plotly : null;
      if (!plotEl || typeof plotEl.on !== 'function' || !Plotly?.relayout) return;
      const handler = createPlotRelayoutHandler({
        panelId,
        plotEl,
        getPanelFigure,
        updatePanelFigure,
        pushHistory,
        updateHistoryButtons,
        persist,
        scheduleCanvasSync,
        baseFigureWithoutOverlays,
        computeTraceRange,
        expandRange,
        applyRelayout: (updates) => Plotly.relayout(plotEl, updates)
      });
      plotEl.on('plotly_relayout', handler);
      relayoutHandlers.set(panelId, { plotEl, handler });
    };

    detectPeaksForPanel = (panelId, {
      silentEmpty = false,
      detectionOverride = null,
      displayOverride = null,
      manualPlacementOverride = null,
      updateUi = true
    } = {}) => {
      if (!panelId) {
        if (!silentEmpty) {
          notify?.('Select a graph to run peak marking.', 'warning');
        }
        return false;
      }
      if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
        if (!silentEmpty) {
          notify?.('Peak marking is only available for plot panels.', 'warning');
        }
        return false;
      }
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
      if (!figure) return false;
      const { data, layout } = baseFigureWithoutOverlays(figure);
      const candidateTraces = data
        .filter((trace) => Array.isArray(trace?.x) && Array.isArray(trace?.y))
        .map((trace, index) => ({
          id: trace?.uid || trace?._canvasId || `trace-${index + 1}`,
          label: trace?.name || `Trace ${index + 1}`,
          x: trace.x,
          y: trace.y,
          line: trace.line,
          marker: trace.marker,
          color: trace.color
        }));
      if (!candidateTraces.length) {
        if (!silentEmpty) {
          notify?.('No compatible traces found on this graph.', 'info');
        }
        return false;
      }
      const detectionOptions = detectionOverride
        ? { ...DEFAULT_PEAK_OPTIONS, ...detectionOverride }
        : getDetectionOptions();
      if (updateUi) {
        updateChevronPreview(detectionOptions.target);
      }
      const peaks = findPeaks(candidateTraces, detectionOptions);
      const axisSnapshot = readAxisRanges(panelId);
      const yBaseline = Number.isFinite(axisSnapshot?.y?.[0])
        ? axisSnapshot.y[0]
        : layout?.yaxis?.range?.[0];
      const figureManualMarkers = Array.isArray(figure?.layout?.meta?.manualMarkers)
        ? figure.layout.meta.manualMarkers
        : [];
      const manualPeaks = figureManualMarkers.map((marker, idx) => {
        const trace = candidateTraces.find((t) => t.id === marker.traceId);
        const traceLabel = trace?.label || marker?.traceLabel || 'Manual';
        const color = marker?.color || trace?.color || trace?.line?.color || trace?.marker?.color || null;
        const baseline = Number.isFinite(yBaseline) ? yBaseline : marker?.y;
        return {
          id: marker?.id || `${panelId}-manual-${idx}`,
          traceId: marker?.traceId || null,
          traceLabel,
          color,
          index: marker?.index ?? idx,
          x: marker?.x,
          y: marker?.y,
          processedY: marker?.y,
          prominence: marker?.prominence ?? 0,
          leftBase: Number.isFinite(marker?.leftBase) ? marker.leftBase : baseline,
          rightBase: Number.isFinite(marker?.rightBase) ? marker.rightBase : baseline,
          direction: marker?.direction || 'peak',
          source: {
            manual: true,
            snap: marker?.snap !== false
          }
        };
      });
      const mergedPeaks = [...peaks, ...manualPeaks];
      const display = resolveDisplayOptions(displayOverride);
      const manualPlacement = manualPlacementOverride ?? state.manualPlacement;
      const overlayPeaks = display.showAutoMarkers
        ? mergedPeaks
        : mergedPeaks.filter((peak) => peak?.source?.manual);
      const overlays = buildPeakOverlays(overlayPeaks, {
        markerStyle: display.markerStyle,
        lineStyle: display.lineStyle,
        labelFormat: display.labelFormat,
        yMin: yBaseline,
        offsetAmount: display.offsetAmount,
        markerSize: display.markerSize,
        detectionTarget: detectionOptions.target,
        labelColor: display.labelColor,
        labelSize: display.labelSize,
        labelBox: display.labelBox,
        labelBoxThickness: display.labelBoxThickness,
        labelAlign: display.labelAlign,
        labelStyle: display.labelStyle
      });
      const markerTrace = display.showMarkers ? overlays.markerTrace : null;
      const markerAnnotations = []; // use Plotly marker trace for positioning accuracy
      const labelAnnotations = display.showLabels
        ? overlays.labelAnnotations.map((annotation) => ({
          ...annotation,
          meta: { ...(annotation.meta || {}), peakOverlay: true, peakOverlayType: 'label' }
        }))
        : [];
      const lineShapes = display.showLines
        ? overlays.lineShapes.map((shape) => ({
          ...shape,
          meta: { ...(shape.meta || {}), peakOverlay: true }
        }))
        : [];

      const nextLayout = {
        ...layout,
        shapes: [...layout.shapes, ...lineShapes],
        annotations: [...layout.annotations, ...markerAnnotations, ...labelAnnotations],
        meta: {
          ...(layout.meta || {}),
          peakMarking: {
            enabled: true,
            panelId,
            peakCount: mergedPeaks.length,
            manualPlacement,
            detection: detectionOptions,
            display: {
              showMarkers: display.showMarkers,
              showLines: display.showLines,
              showLabels: display.showLabels,
              showAutoMarkers: display.showAutoMarkers,
              markerStyle: display.markerStyle,
              lineStyle: display.lineStyle,
              labelFormat: display.labelFormat,
              offsetMarkers: display.offsetAmount > 0,
              offsetAmount: display.offsetAmount,
              markerSize: display.markerSize,
              labelColor: display.labelColor,
              labelSize: display.labelSize,
              labelBox: display.labelBox,
              labelBoxThickness: display.labelBoxThickness,
              labelAlign: display.labelAlign,
              labelStyle: display.labelStyle
            },
            updatedAt: Date.now()
          }
        }
      };

      const baseYRange = computeTraceRange(candidateTraces, 'y');
      const adjustedRange = baseYRange ? expandRange(baseYRange) || baseYRange : null;

      if (axisSnapshot?.y) {
        nextLayout.yaxis = {
          ...(nextLayout.yaxis || layout.yaxis || {}),
          range: axisSnapshot.y.slice(),
          autorange: false
        };
      } else if (adjustedRange) {
        nextLayout.yaxis = {
          ...(nextLayout.yaxis || layout.yaxis || {}),
          range: adjustedRange,
          autorange: false
        };
      }
      if (axisSnapshot?.x) {
        nextLayout.xaxis = {
          ...(nextLayout.xaxis || layout.xaxis || {}),
          range: axisSnapshot.x.slice(),
          autorange: false
        };
      } else if (layout.xaxis?.range) {
        nextLayout.xaxis = {
          ...(nextLayout.xaxis || layout.xaxis || {}),
          range: layout.xaxis.range.slice(),
          autorange: false
        };
      }

      const nextFigure = {
        ...figure,
        data: markerTrace ? [...data, markerTrace] : data,
        layout: nextLayout
      };

      pushHistoryEntry?.({ label: 'Peak marking' });
      commitFigure(panelId, nextFigure);
      attachRelayoutHandler(panelId);
      lastResult = { panelId, peaks: mergedPeaks };
      if (!mergedPeaks.length) {
        if (!silentEmpty) {
          notify?.('No peaks detected on this graph.', 'warning');
        }
      } else if (!silentEmpty) {
        notify?.(`Marked ${mergedPeaks.length} peak${mergedPeaks.length === 1 ? '' : 's'}.`, 'success');
      }
      return true;
    };

    const clearPeaksForPanel = (panelId, { silent = false } = {}) => {
      if (!panelId) return false;
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
      if (!figure) return false;
      const { data, layout } = baseFigureWithoutOverlays(figure);
      const hadOverlays = data.length !== ensureArray(figure.data).length
        || layout.shapes.length !== ensureArray(figure.layout?.shapes).length
        || layout.annotations.length !== ensureArray(figure.layout?.annotations).length
        || figure.layout?.meta?.peakMarking?.enabled;
      if (!hadOverlays) {
        return false;
      }
      const nextFigure = {
        ...figure,
        data,
        layout: {
          ...layout,
          meta: {
            ...(layout.meta || {}),
            peakMarking: {
              ...(layout.meta?.peakMarking || {}),
              enabled: false,
              peakCount: 0,
              clearedAt: Date.now()
            }
          }
        }
      };
      pushHistoryEntry?.({ label: 'Peak marking' });
      commitFigure(panelId, nextFigure);
      if (!silent) {
        notify?.('Peak markers cleared.', 'info');
      }
      if (lastResult?.panelId === panelId) {
        lastResult = { panelId: null, peaks: [] };
      }
      return true;
    };

    const handleToggle = (event) => {
      if (event?.type === 'click' && event.button !== 0) return;
      const hasExplicitState = typeof event?.currentTarget?.checked === 'boolean';
      const next = hasExplicitState ? event.currentTarget.checked : !state.enabled;
      if (next) {
        setToggleState(true);
        const success = detectPeaksForPanel(getActivePanel());
        if (!success) {
          setToggleState(false);
        }
      } else {
        const panelId = getActivePanel();
        const removed = clearPeaksForPanel(panelId, { silent: false });
        if (!removed && !panelId) {
          notify?.('No graph selected to clear.', 'info');
        }
        setToggleState(false);
      }
    };

      const handleVisibilityToggle = (event) => {
      const button = event.currentTarget;
      const key = button?.dataset?.peakVisibility;
      if (!key) return;
      const next = !button.classList.contains('is-active');
      button.classList.toggle('is-active', next);
      button.setAttribute('aria-pressed', String(next));
      if (key === 'markers') {
        state.showMarkers = next;
      } else if (key === 'lines') {
        state.showLines = next;
      } else if (key === 'labels') {
        state.showLabels = next;
      }
      if (state.enabled) {
        requestRerun();
      } else {
        const panelId = getActivePanel();
        if (panelId) {
          detectPeaksForPanel(panelId, { silentEmpty: true });
        }
      }
    };

    const handleAutoVisibilityToggle = () => {
      setAutoVisibility(!state.showAutoMarkers);
      if (state.enabled) {
        requestRerun();
      } else {
        const panelId = getActivePanel();
        if (panelId) {
          detectPeaksForPanel(panelId, { silentEmpty: true });
        }
      }
    };

    const handleTraceStyleChange = (panelId) => {
      if (!panelId) return;
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
      if (!figure) return;
      const meta = figure.layout?.meta?.peakMarking || {};
      const overlaysActive = meta?.enabled || figureHasPeakOverlays(figure);
      if (!overlaysActive) return;
      detectPeaksForPanel(panelId, {
        silentEmpty: true,
        detectionOverride: meta?.detection || null,
        displayOverride: meta?.display || null,
        manualPlacementOverride: meta?.manualPlacement,
        updateUi: panelId === getActivePanel()
      });
    };

    const handleApplyPeakDefaults = () => {
      const panelId = getActivePanel();
      if (panelId) {
        detectPeaksForPanel(panelId, { silentEmpty: true });
      }
    };

    const handleMarkerStyleClick = (event) => {
      const button = event.currentTarget;
      const style = button?.dataset?.peakMarkerStyle || 'dot';
      dom.markerButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      state.markerStyle = style;
      requestRerun();
    };

    const resetLabelOptions = () => {
      // Clear explicit color to use trace color, and restore defaults for label styling.
      state.labelColor = null;
      if (labelOptions.palette) {
        labelOptions.palette.querySelectorAll('.chip-swatch').forEach((sw) => sw.classList.remove('is-active'));
      }
      state.labelSize = 11;
      if (dom.labelSize) {
        dom.labelSize.value = state.labelSize;
      }
      state.labelBox = false;
      if (dom.labelBox) {
        dom.labelBox.checked = false;
      }
      state.labelBoxThickness = 0;
      if (dom.labelBoxThickness) {
        dom.labelBoxThickness.value = 0;
      }
      state.labelFormat = 'wavenumber';
      if (dom.labelFormatButtons?.length) {
        dom.labelFormatButtons.forEach((btn) => {
          const active = btn.dataset.peakLabelFormat === 'wavenumber';
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      state.labelStyle = { bold: true, italic: false, underline: false, strike: false };
      if (dom.labelStyleButtons?.length) {
        dom.labelStyleButtons.forEach((btn) => {
          const active = btn.dataset.peakLabelStyle === 'bold';
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      state.labelAlign = 'center';
      if (dom.labelAlignButtons?.length) {
        dom.labelAlignButtons.forEach((btn) => {
          const active = btn.dataset.peakLabelAlign === 'center';
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      requestRerun();
    };

    const handleCopyPeaks = async () => {
      const activeId = getActivePanel();
      if (!activeId) {
        notify?.('Select a graph before copying values.', 'info');
        return;
      }
      if (lastResult?.panelId !== activeId) {
        const success = detectPeaksForPanel(activeId, { silentEmpty: true });
        if (!success) {
          return;
        }
      }
      const peaks = lastResult?.panelId === activeId ? lastResult.peaks : [];
      if (!Array.isArray(peaks) || !peaks.length) {
        notify?.('Run peak detection before copying values.', 'info');
        return;
      }
      const rows = buildPeakTableRows(peaks, { includeTrace: true });
      const header = '#\tWavenumber (cm⁻¹)\tIntensity\tTrace';
      const lines = rows.map((row) => {
        const wave = Number(row.wavenumber).toFixed(4);
        const intensity = Number(row.intensity).toFixed(4);
        const trace = row.traceLabel || '';
        return `${row.rowIndex}\t${wave}\t${intensity}\t${trace}`;
      });
      const payload = [header, ...lines].join('\n');
      try {
        await writeToClipboard(payload);
        notify?.('Peak values copied to clipboard.', 'success');
      } catch (error) {
        console.warn('Peak copy failed', error);
        notify?.('Copy failed. Select and copy manually.', 'danger');
      }
    };

    const buildSpreadsheetContent = (peaks = [], detection = {}) => {
      const columns = [
        { id: 'col-1', label: '#' },
        { id: 'col-2', label: 'Trace', type: 'text' },
        { id: 'col-3', label: 'Wavenumber (cm⁻¹)' },
        { id: 'col-4', label: 'Intensity' },
        { id: 'col-5', label: 'Prominence' },
        { id: 'col-6', label: 'Source', type: 'text' },
        { id: 'col-7', label: 'Sensitivity' },
        { id: 'col-8', label: 'Min distance' },
        { id: 'col-9', label: 'Baseline', type: 'text' },
        { id: 'col-10', label: 'Smoothing', type: 'text' }
      ];
      const rows = peaks.map((peak, idx) => ({
        id: `row-${idx + 1}`,
        'col-1': idx + 1,
        'col-2': peak.traceLabel || '',
        'col-3': Number(peak.x) || 0,
        'col-4': Number(peak.y) || 0,
        'col-5': Number(peak.prominence) || 0,
        'col-6': peak?.source?.manual ? 'Manual' : 'Auto',
        'col-7': typeof detection.sensitivity === 'number' ? Math.round(detection.sensitivity * 100) : '',
        'col-8': typeof detection.minDistance === 'number' ? detection.minDistance : '',
        'col-9': detection.applyBaseline ? 'On' : 'Off',
        'col-10': detection.applySmoothing === false ? 'Off' : 'On'
      }));
      return { columns, rows, formulas: {} };
    };

    const handleSpreadsheetClick = () => {
      const activeId = getActivePanel();
      if (!activeId) {
        notify?.('Select a graph before exporting peaks.', 'info');
        return;
      }
      if (lastResult?.panelId !== activeId) {
        const success = detectPeaksForPanel(activeId, { silentEmpty: true });
        if (!success) {
          return;
        }
      }
      const peaks = Array.isArray(lastResult?.peaks) ? lastResult.peaks : [];
      if (!peaks.length) {
        notify?.('Run peak detection before exporting peaks.', 'info');
        return;
      }
      const figure = typeof getPanelFigure === 'function' ? getPanelFigure(activeId) : null;
      const detection = figure?.layout?.meta?.peakMarking?.detection || getDetectionOptions();
      const content = buildSpreadsheetContent(peaks, detection);
      const canvasRect = canvasRoot?.getBoundingClientRect?.();
      const desiredHeight = Number.isFinite(canvasRect?.height)
        ? Math.max(240, Math.round(canvasRect.height * 0.8))
        : undefined;
      createPanelOfType('spreadsheet', {
        title: 'Peaks',
        content,
        height: desiredHeight
      });
      notify?.('Opened peaks in a spreadsheet panel.', 'success');
    };

    const handleClearManualMarkers = () => {
      const panelId = getActivePanel();
      if (!panelId) {
        notify?.('Select a graph to clear manual markers.', 'info');
        return;
      }
      writeManualMarkers(panelId, []);
      // Re-run detection to rebuild overlays without manual markers.
      detectPeaksForPanel(panelId, { silentEmpty: true });
      notify?.('Manual markers cleared.', 'success');
    };

    const hideAutoOptions = (disabled) => {
      const section = menu.querySelector('[aria-label="Detection parameters"]');
      if (!section) return;
      section.querySelectorAll('input, select, button').forEach((el) => {
        if (el.id === 'tb2_peak_mode_manual' || el.id === 'tb2_peak_mode_auto') return;
        if (el.dataset?.peakClearManual !== undefined) return;
        if (el.dataset?.peakAutoVisibility !== undefined) return;
        el.disabled = !!disabled;
      });
    };

    const setMenuEnabled = (enabled) => {
      const controls = menu.querySelectorAll('input, select, button');
      controls.forEach((el) => {
        const isManualClear = el.dataset?.peakClearManual !== undefined;
        el.disabled = !enabled && !isManualClear;
      });
      const sections = menu.querySelectorAll('.workspace-peak-menu-section');
      sections.forEach((sec) => {
        const hasManualClear = sec.querySelector('[data-peak-clear-manual]');
        const disableSection = !enabled && !hasManualClear;
        sec.classList.toggle('is-disabled', disableSection);
        if (hasManualClear && !enabled) {
          sec.classList.remove('is-disabled');
        }
      });
      // Re-apply auto-options masking when re-enabling.
      if (enabled) {
        hideAutoOptions(state.manualPlacement);
      }
    };

    addListener(dom.menuToggle, 'change', handleToggle);
    addListener(dom.sensitivity, 'input', () => {
      state.sensitivity = toNumber(dom.sensitivity.value, state.sensitivity);
      updateSensitivityLabel();
      requestRerun();
    });
    addListener(dom.distance, 'input', () => {
      state.distance = toNumber(dom.distance.value, state.distance);
      updateDistanceLabel();
      requestRerun();
    });
    addListener(dom.baseline, 'change', () => {
      state.applyBaseline = dom.baseline.checked;
      requestRerun();
    });
    addListener(dom.smoothing, 'change', () => {
      state.applySmoothing = dom.smoothing.checked;
      requestRerun();
    });
    addListener(dom.manualPlacement, 'change', () => {
      setManualPlacement(dom.manualPlacement.checked);
      attachManualHandler(getActivePanel());
      hideAutoOptions(state.manualPlacement);
    });
    addListener(dom.manualModeAuto, 'change', () => {
      if (dom.manualModeAuto.checked) {
        setManualPlacement(false);
        hideAutoOptions(false);
      }
    });
    addListener(dom.autoVisibilityButton, 'click', handleAutoVisibilityToggle);
    addListener(dom.offsetAmount, 'input', () => {
      state.offsetAmount = toNumber(dom.offsetAmount.value, state.offsetAmount);
      updateOffsetLabel();
      requestRerun();
    });
    addListener(dom.markerSize, 'input', () => {
      state.markerSize = toNumber(dom.markerSize.value, state.markerSize);
      updateMarkerSizeLabel();
      requestRerun();
    });
    addListener(dom.labelSize, 'input', () => {
      state.labelSize = toNumber(dom.labelSize.value, state.labelSize);
      requestRerun();
    });
    addListener(dom.labelBoxThickness, 'input', () => {
      state.labelBoxThickness = Math.max(0, toNumber(dom.labelBoxThickness.value, state.labelBoxThickness));
      state.labelBox = state.labelBoxThickness > 0;
      requestRerun();
    });
    (dom.labelStyleButtons || []).forEach((btn) => addListener(btn, 'click', () => {
      const key = btn.dataset.peakLabelStyle;
      if (!key) return;
      const next = !btn.classList.contains('is-active');
      state.labelStyle = {
        ...state.labelStyle,
        [key]: next
      };
      dom.labelStyleButtons.forEach((b) => {
        const active = state.labelStyle[b.dataset.peakLabelStyle] === true;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      requestRerun();
    }));
    (dom.labelAlignButtons || []).forEach((btn) => addListener(btn, 'click', () => {
      const align = btn.dataset.peakLabelAlign || 'center';
      state.labelAlign = align;
      (dom.labelAlignButtons || []).forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      requestRerun();
    }));
    (dom.labelFormatButtons || []).forEach((btn) => addListener(btn, 'click', () => {
      const format = btn.dataset.peakLabelFormat || 'wavenumber';
      dom.labelFormatButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      state.labelFormat = format;
      requestRerun();
    }));
    (dom.guideStyleButtons || []).forEach((btn) => addListener(btn, 'click', () => {
      const style = btn.dataset.peakLineStyle || 'solid';
      dom.guideStyleButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      state.lineStyle = style;
      requestRerun();
    }));
    addListener(dom.labelReset, 'click', resetLabelOptions);
    dom.visibilityButtons.forEach((button) => addListener(button, 'click', handleVisibilityToggle));
    dom.markerButtons.forEach((button) => addListener(button, 'click', handleMarkerStyleClick));
    addListener(dom.copyButton, 'click', handleCopyPeaks);
    addListener(dom.spreadsheetButton, 'click', handleSpreadsheetClick);
    addListener(dom.clearManualButton, 'click', handleClearManualMarkers);
    // Close peak menu when clicking empty canvas space; keep it open when clicking panels/graphs.
    addListener(canvasRoot, 'click', (event) => {
      const target = event?.target;
      const closest = typeof target?.closest === 'function' ? target.closest.bind(target) : () => null;
      const insidePanel = closest('.workspace-panel');
      const insideToolbar = closest('.workspace-toolbar') || closest('.workspace-toolbar-vertical');
      const insideDropdown = closest('.dropdown-menu');
      if (insidePanel || insideToolbar || insideDropdown) return;
      setActivePanel(null);
      hidePeakMenu();
    });

    updateSensitivityLabel();
    updateDistanceLabel();
    updateOffsetLabel();
    updateMarkerSizeLabel();
    peakDefaultsController = createPeakDefaultsController({
      preferences: preferencesFacade,
      dom,
      labelOptions,
      state,
      setAutoVisibility,
      updateOffsetLabel,
      updateMarkerSizeLabel,
      requestRerun,
      getActivePanel,
      getActiveTechKey,
      notify,
      onApply: handleApplyPeakDefaults
    });
    updateTargetLabel(getActivePanel());
    syncMenuFromFigure(getActivePanel());
    attachManualHandler(getActivePanel());
    attachTooltipHandler(getActivePanel());
    hideAutoOptions(state.manualPlacement);
    hydrateLabelSwatches();

    return {
      handleActivePanelChange(panelId) {
        if (panelId !== lastResult?.panelId) {
          lastResult = { panelId: null, peaks: [] };
        }
        syncMenuFromFigure(panelId);
        updateTargetLabel(panelId);
        attachManualHandler(panelId);
        attachTooltipHandler(panelId);
        attachRelayoutHandler(panelId);
      },
      handleTraceStyleChange(panelId) {
        handleTraceStyleChange(panelId);
      },
      teardown() {
        cancelScheduledRerun();
        listeners.forEach(({ node, event, handler }) => {
          if (node && typeof node.removeEventListener === 'function') {
            node.removeEventListener(event, handler);
          }
        });
        peakDefaultsController?.teardown?.();
        manualClickHandlers.forEach((_, panelId) => detachManualHandler(panelId));
        tooltipHandlers.forEach((_, panelId) => detachTooltipHandler(panelId));
        relayoutHandlers.forEach((_, panelId) => detachRelayoutHandler(panelId));
      }
    };
  }

  updateHistoryButtons();
  updateStorageButtons();
  updateToolbarMetrics();

  const handleWindowResize = () => {
    panelDomRegistry.forEach((dom, panelId) => {
      applyPanelGeometry(panelId);
      if (dom?.plotEl) {
        resizePlotForPanel(panelId);
      }
      dom?.runtime?.refreshActionOverflow?.();
    });
    updateToolbarMetrics();
    requestLayoutSync();
  };

  const handleWindowScroll = () => {
    requestLayoutSync();
  };

  let workspaceObserver = null;
  if (workspacePane) {
    workspaceObserver = new MutationObserver(requestLayoutSync);
    workspaceObserver.observe(workspacePane, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  requestLayoutSync();

  const renderAll = () => {
    updateCanvasState();
    renderBrowser();
    panelDomRegistry.forEach((dom, panelId) => {
      if (dom?.plotEl) {
        renderPlot(panelId);
      }
    });
  };

  const onModelChanged = () => {
    updateCanvasState();
    renderBrowser();
    persist();
  };

  const onWindowResize = () => {
    handleWindowResize();
  };

  const teardown = () => {
    scheduleCanvasSync({ immediate: true });
    if (remoteSyncTimer) {
      window.clearTimeout(remoteSyncTimer);
      remoteSyncTimer = null;
    }
    suppressRemoteSyncOnce = false;
    if (workspaceObserver) {
      workspaceObserver.disconnect();
      workspaceObserver = null;
    }
    if (userStatusHandler && typeof document !== 'undefined') {
      document.removeEventListener('ftir:user-status', userStatusHandler);
      userStatusHandler = null;
    }
    browserFacade?.teardown?.();
    browserFacade = null;
    ioFacade?.detach?.();
    preferencesFacade?.teardown?.();
    persistence?.teardown?.();
    operationsLog.length = 0;
    operationsRenderQueued = false;
    if (operationsPanelHandles?.root?.parentNode) {
      operationsPanelHandles.root.parentNode.removeChild(operationsPanelHandles.root);
    }
    operationsPanelHandles = null;
    if (operationsToggleButton?.parentNode) {
      operationsToggleButton.parentNode.removeChild(operationsToggleButton);
    }
    operationsToggleButton = null;
    operationsVisible = true;
    if (hudButtonsHandles?.container?.parentNode) {
      hudButtonsHandles.container.parentNode.removeChild(hudButtonsHandles.container);
    }
      hudButtonsHandles = null;
      globalCommandsController?.dispose?.();
      toolbarShortcutsController?.teardown?.();
      techToolbarHandlers?.teardown?.();
      techToolbarLabelController?.teardown?.();
      techToolbarHoverController?.teardown?.();
      techToolbarHoverController = null;
      techToolbarPinController?.teardown?.();
      techToolbarPinController = null;
      techToolbarHeaderVisibilityController?.teardown?.();
      techToolbarHeaderVisibilityController = null;
      techToolbarModebarVisibilityController?.teardown?.();
      techToolbarModebarVisibilityController = null;
      panelLockController?.teardown?.();
      panelLockController = null;
      unitsToggleController?.teardown?.();
      unitsToggleController = null;
      multiTraceController?.teardown?.();
      multiTraceController = null;
      stylePainterController?.teardown?.();
      stylePainterController = null;
    templatesController?.teardown?.();
    templatesController = null;
    peakMarkingController?.teardown?.();
    peakMarkingController = null;
    devToggleButton = null;
    cdpToggleButton = null;
    ghostToggleButton = null;
    cdpModeEnabled = false;
    ghostModeEnabled = false;
    themeMenuControls?.teardown?.();
    themeMenuControls = null;
    alignIncludeAllToggle = null;
    if (cdpPanelEl?.parentNode) {
      cdpPanelEl.parentNode.removeChild(cdpPanelEl);
    }
    cdpPanelEl = null;
    cdpVisible = false;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('workspace-ghost-mode', 'workspace-ghost-hover');
    }
  };

  return {
    renderAll,
    renderBrowser,
    focusPanel: focusPanelById,
    selectPanel: setActivePanel,
    onModelChanged,
    onWindowResize,
    onWindowScroll: () => {
      handleWindowScroll();
    },
    onBeforeUnload: () => {
      scheduleCanvasSync({ immediate: true });
      persistence?.handleBeforeUnload?.();
    },
    onVisibilityChange: () => {
      persistence?.handleVisibilityChange?.();
    },
    teardown,
    getModels: () => ({ panelsModel, sectionsModel }),
    getPanelDomRegistry: () => panelDomRegistry
  };

  async function hydrateDashboardCanvasState(
    canvasId,
    { fallbackSnapshot = null, hadSnapshotOnBoot = false } = {}
  ) {
    if (!canvasId || !cloudSyncEnabled) return;
    try {
      const payload = await fetchCanvasState(canvasId);
      const applyActiveCanvasTitle = (value) => {
        if (!value) return;
        if (typeof document !== 'undefined' && document.body) {
          document.body.dataset.activeCanvasTitle = value;
        }
        const badge = document.querySelector('[data-workspace-canvas-title]');
        if (badge && badge.dataset.editing !== 'true') {
          badge.dataset.displayValue = value;
          badge.textContent = value;
        }
      };
      if (payload?.title) {
        applyActiveCanvasTitle(payload.title);
      }
      if (!isWorkspaceSnapshot(payload?.state)) {
        console.info('Canvas state missing workspace snapshot; using local data.');
        if (fallbackSnapshot) {
          suppressRemoteSyncOnce = true;
          restoreSnapshot(fallbackSnapshot, { skipHistory: true });
          history?.clear?.();
          updateHistoryButtons();
          updateStorageButtons();
          showToast('Canvas restored from local autosave. Syncing to dashboard…', 'info');
        } else if (hadSnapshotOnBoot) {
          showToast('Canvas load failed. Starting with defaults.', 'danger');
        } else {
          showToast('Canvas ready. Syncing first save to dashboard.', 'info');
        }
        scheduleCanvasSync({ immediate: true });
        return;
      }
      suppressRemoteSyncOnce = true;
      restoreSnapshot(payload.state, { skipHistory: true });
      history?.clear?.();
      updateHistoryButtons();
      updateStorageButtons();
      updateToolbarMetrics();
      requestLayoutSync();
      if (typeof storage?.save === 'function') {
        try {
          storage.save(payload.state);
        } catch {
          /* ignore storage failures */
        }
      }
      scheduleCanvasSync({ reset: true });
      showToast(`Canvas "${payload.title || 'Untitled canvas'}" loaded.`, 'success');
    } catch (err) {
      console.warn('Failed to load dashboard canvas state', err);
      if (fallbackSnapshot) {
        suppressRemoteSyncOnce = true;
        restoreSnapshot(fallbackSnapshot, { skipHistory: true });
        history?.clear?.();
        updateHistoryButtons();
        updateStorageButtons();
        showToast('Canvas load failed. Restored last local snapshot.', 'warning');
        scheduleCanvasSync({ immediate: true });
      } else if (hadSnapshotOnBoot) {
        showToast('Canvas load failed. Starting with defaults.', 'danger');
      }
    }
  }
}
