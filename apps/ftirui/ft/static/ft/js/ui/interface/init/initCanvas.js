/**
 * Responsibility: Bootstrap the workspace canvas by collecting DOM roots and wiring the controller.
 * Inputs: optional controller configuration plus DOM selectors resolved within this module.
 * Outputs: returns the active canvas controller and manages global event handlers for lifecycle.
 * Never: never touch panels/models directly, never import Plotly, never assume global listeners persist beyond controller teardown.
 */
import { createCanvasController } from '../controller/canvasController.js';

let activeSession = null;

const collectRoots = () => {
  if (typeof document === 'undefined') return {};
  const canvas = document.getElementById('c_canvas_root');
  const canvasWrapper = canvas?.closest('.workspace-canvas-wrapper') || null;
  return {
    canvas,
    addPlotButton: document.getElementById('c_canvas_add_plot'),
    resetButton: document.getElementById('c_canvas_reset_layout'),
    browseButton: document.getElementById('c_canvas_browse_btn'),
    demoButton: document.getElementById('c_canvas_demo_btn'),
    fileInput: document.getElementById('c_canvas_file_input'),
    emptyOverlay: document.getElementById('c_canvas_empty'),
    canvasWrapper,
    topToolbar: canvasWrapper?.querySelector('.workspace-toolbar') || null,
    verticalToolbar: canvasWrapper?.querySelector('.workspace-toolbar-vertical') || null,
    workspacePane: document.getElementById('pane-plotC'),
    appFrame: document.querySelector('.app-frame-main'),
    appFooter: document.querySelector('.app-footer')
  };
};

const attachGlobalHandlers = (controller) => {
  if (typeof window === 'undefined') return null;
  const handlers = {
    resize: () => controller.onWindowResize(),
    scroll: () => controller.onWindowScroll(),
    beforeUnload: () => controller.onBeforeUnload(),
    visibilityChange: () => controller.onVisibilityChange()
  };
  window.addEventListener('resize', handlers.resize);
  window.addEventListener('scroll', handlers.scroll, { passive: true });
  window.addEventListener('beforeunload', handlers.beforeUnload);
  document.addEventListener('visibilitychange', handlers.visibilityChange);
  return handlers;
};

const detachGlobalHandlers = (handlers) => {
  if (!handlers || typeof window === 'undefined') return;
  window.removeEventListener('resize', handlers.resize);
  window.removeEventListener('scroll', handlers.scroll);
  window.removeEventListener('beforeunload', handlers.beforeUnload);
  document.removeEventListener('visibilitychange', handlers.visibilityChange);
};

export const initCanvas = (options = {}) => {
  if (activeSession?.controller) {
    return activeSession.controller;
  }

  const controller = createCanvasController(options);
  controller.init({
    roots: collectRoots()
  });

  controller.renderAll();

  const handlers = attachGlobalHandlers(controller);

  activeSession = {
    controller,
    handlers,
    dispose() {
      detachGlobalHandlers(this.handlers);
      controller.teardown();
      activeSession = null;
    }
  };

  return controller;
};

export const disposeCanvas = () => {
  if (!activeSession) return;
  activeSession.dispose();
};

export const getActiveCanvasController = () => activeSession?.controller ?? null;
