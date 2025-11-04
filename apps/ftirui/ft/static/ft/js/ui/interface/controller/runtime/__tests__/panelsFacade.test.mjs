import test from 'node:test';
import assert from 'node:assert/strict';

import { createPanelsFacade } from '../panels/facade.js';
import { createRuntimeState } from '../context/runtimeState.js';

const createPanelsModelStub = () => {
  const panels = new Map();
  panels.set('panel-1', {
    id: 'panel-1',
    sectionId: 'section_all',
    index: 1,
    figure: { data: [], layout: {} }
  });

  return {
    getPanel(id) {
      return panels.get(id) || null;
    },
    getPanelsInIndexOrder() {
      return Array.from(panels.values());
    },
    getPanelTraces(id) {
      return panels.get(id)?.figure?.data || [];
    },
    getPanelFigure(id) {
      return panels.get(id)?.figure || { data: [], layout: {} };
    },
    updatePanelFigure(id, figure) {
      if (panels.has(id)) {
        panels.get(id).figure = figure;
      }
    },
    addTrace(id, trace) {
      if (!panels.has(id)) return;
      panels.get(id).figure.data.push(trace);
    },
    registerPanel(state) {
      panels.set(state.id, state);
      return state;
    },
    removePanel(id) {
      panels.delete(id);
    },
    moveTrace: () => true,
    attachToSection: () => {},
    setPanelIndex: () => {},
    bringPanelToFront: () => {},
    setPanelSize: () => {},
    setPanelPosition: () => {},
    setHidden: () => {},
    setCollapsed: () => {}
  };
};

const sectionsMap = new Map([
  ['section_all', { id: 'section_all', name: 'All', collapsed: false, locked: true }]
]);

const createRuntimeStateStub = (panelsModel) =>
  createRuntimeState({
    panelsModel,
    sections: sectionsMap,
    defaultSectionId: 'section_all',
    panelDomRegistry: new Map(),
    getPanelDom: () => ({}),
    getActivePanelId: () => null,
    setActivePanel: () => {},
    getNextPanelSequence: () => 2
  });

test('appendFilesToGraph queues uploaded traces and persists', async () => {
  const panelsModel = createPanelsModelStub();
  const runtimeState = createRuntimeStateStub(panelsModel);

  let persisted = false;
  let toastMessage = '';
  let historyPushCount = 0;

  const facade = createPanelsFacade({
    models: { panelsModel },
    plot: { renderNow: () => {} },
    history: {
      history: { rewind: () => { throw new Error('should not rewind on success'); } },
      pushHistory: () => { historyPushCount += 1; },
      updateHistoryButtons: () => {}
    },
    persistence: { persist: () => { persisted = true; } },
    browser: {
      renderBrowser: () => {},
      refreshPanelVisibility: () => {},
      updateCanvasState: () => {}
    },
    state: runtimeState,
    utils: {
      ensureArray: (value) => (Array.isArray(value) ? value : []),
      deepClone: (value) => JSON.parse(JSON.stringify(value)),
      decodeName: (value) => value,
      ensureTraceId: (trace) => {
        trace._canvasId = trace._canvasId || `trace_${Math.random().toString(36).slice(2, 6)}`;
      },
      toHexColor: (value) => value || '#1f77b4',
      defaultLayout: () => ({ data: [], layout: {} }),
      pickColor: () => '#ff0000',
      showToast: (message) => { toastMessage = message; },
      clampGeometryToCanvas: (geometry) => geometry,
      fallbackColor: '#1f77b4'
    },
    services: {
      uploadTraceFile: async (file) => ({
        name: `Trace ${file.name}`,
        x: [1, 2, 3],
        y: [4, 5, 6]
      })
    },
    registry: {}
  });

  const fileLike = { name: 'sample.dat' };
  await facade.appendFilesToGraph('panel-1', [fileLike]);

  const traces = panelsModel.getPanelTraces('panel-1');
  assert.equal(traces.length, 1);
  assert.ok(traces[0].name.startsWith('Trace sample.dat'));
  assert.ok(traces[0]._canvasId, 'trace id should be assigned');
  assert.equal(historyPushCount, 1);
  assert.equal(persisted, true);
  assert.equal(toastMessage, 'Added 1 file to graph.');
});
