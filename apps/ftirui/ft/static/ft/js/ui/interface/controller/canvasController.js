/**
 * Responsibility: Shield callers from the workspace runtime with guarded, timed operations.
 * Inputs: accepts toast and debug hooks plus runtime context forwarded into the runtime module.
 * Outputs: exposes render/focus/select handlers, model accessors, and lifecycle management.
 * Never: never reach into DOM directly, never call Plotly, never mutate panel models outside runtime APIs.
 */
import { initWorkspaceRuntime } from './runtime/workspaceRuntime.js';

const SESSION_DEBUG_FLAG = 'ftir.canvas.controller.debug';

const noop = () => {};

const defaultToasts = {
  error(message, error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error(message, error);
    }
  },
  warn(message, error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(message, error);
    }
  },
  info(message) {
    if (typeof console !== 'undefined' && console.info) {
      console.info(message);
    }
  }
};

const resolveDebugFlag = (debugOptions = {}) => {
  if (Object.prototype.hasOwnProperty.call(debugOptions, 'enabled')) {
    return !!debugOptions.enabled;
  }
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const stored = sessionStorage.getItem(SESSION_DEBUG_FLAG);
    return stored === '1' || stored === 'true';
  } catch {
    return false;
  }
};

export class CanvasController {
  constructor(options = {}) {
    const { toasts = {}, debug = {} } = options;
    this._toasts = {
      error: typeof toasts.error === 'function' ? toasts.error : defaultToasts.error,
      warn: typeof toasts.warn === 'function' ? toasts.warn : defaultToasts.warn,
      info: typeof toasts.info === 'function' ? toasts.info : defaultToasts.info
    };
    const debugEnabled = resolveDebugFlag(debug);
    this._debug = {
      enabled: debugEnabled,
      logTimings: debugEnabled && debug.logTimings !== false,
      onRenderTiming: typeof debug.onRenderTiming === 'function' ? debug.onRenderTiming : noop,
      onLayoutTiming: typeof debug.onLayoutTiming === 'function' ? debug.onLayoutTiming : noop
    };
    this._runtime = null;
  }

  init(context = {}) {
    return this._guard('init', () => {
      this._runtime = initWorkspaceRuntime({
        ...context,
        debugFlags: this._debug
      });
      return this;
    });
  }

  renderAll() {
    return this._withTiming('renderAll', () => this._runtime?.renderAll?.());
  }

  renderBrowser() {
    return this._withTiming('renderBrowser', () => this._runtime?.renderBrowser?.());
  }

  focusPanel(panelId, options) {
    return this._guard('focusPanel', () => this._runtime?.focusPanel?.(panelId, options));
  }

  selectPanel(panelId, options) {
    return this._guard('selectPanel', () => this._runtime?.selectPanel?.(panelId, options));
  }

  onModelChanged() {
    return this._withTiming('onModelChanged', () => this._runtime?.onModelChanged?.());
  }

  onWindowResize() {
    return this._withTiming('onWindowResize', () => this._runtime?.onWindowResize?.());
  }

  onWindowScroll() {
    return this._withTiming('onWindowScroll', () => this._runtime?.onWindowScroll?.());
  }

  onBeforeUnload() {
    return this._guard('onBeforeUnload', () => this._runtime?.onBeforeUnload?.());
  }

  onVisibilityChange() {
    return this._withTiming('onVisibilityChange', () => this._runtime?.onVisibilityChange?.());
  }

  teardown() {
    const result = this._guard('teardown', () => this._runtime?.teardown?.());
    this._runtime = null;
    return result;
  }

  getModels() {
    return this._guard('getModels', () => this._runtime?.getModels?.() ?? null);
  }

  getPanelDomRegistry() {
    return this._guard('getPanelDomRegistry', () => this._runtime?.getPanelDomRegistry?.() ?? null);
  }

  _guard(label, fn) {
    try {
      return fn?.();
    } catch (error) {
      this._toasts.error?.(`[CanvasController] ${label} failed`, error);
      return null;
    }
  }

  _withTiming(label, fn) {
    if (!fn) return null;
    const useTiming = this._debug.enabled && typeof performance !== 'undefined' && typeof performance.now === 'function';
    const start = useTiming ? performance.now() : null;
    const result = this._guard(label, fn);
    if (useTiming && start !== null) {
      const duration = performance.now() - start;
      if (this._debug.logTimings && typeof console !== 'undefined' && console.debug) {
        console.debug(`[CanvasController] ${label} took ${duration.toFixed(2)}ms`);
      }
      const hook = label === 'renderAll' || label === 'renderBrowser'
        ? this._debug.onRenderTiming
        : this._debug.onLayoutTiming;
      try {
        hook({ label, duration });
      } catch {
        /* swallow telemetry errors */
      }
    }
    return result;
  }
}

export const createCanvasController = (options = {}) => new CanvasController(options);
