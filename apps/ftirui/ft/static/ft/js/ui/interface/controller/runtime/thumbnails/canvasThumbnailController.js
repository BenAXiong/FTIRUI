const DEFAULT_MAX_WIDTH = 360;
const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 300000;
const DATA_URL_PREFIX = 'data:image/';
const ERROR_STORAGE_KEY = 'ftir.thumb.lastError';
const isDebug = () => typeof window !== 'undefined' && window.__FTIR_THUMB_DEBUG === true;
const debugLog = (...args) => {
  if (!isDebug() || typeof console === 'undefined' || !console.info) return;
  console.info('[Thumbnail]', ...args);
};

const recordError = (error) => {
  if (typeof localStorage === 'undefined') return;
  const message = error?.message || String(error || 'Unknown error');
  const entry = {
    message,
    stack: error?.stack || null,
    time: new Date().toISOString()
  };
  try {
    localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore storage failures */
  }
};

const clearError = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
};

const resolveHtml2Canvas = () => {
  if (typeof window === 'undefined') return null;
  return window.html2canvas || null;
};

const resolvePlotly = () => {
  if (typeof window === 'undefined') return null;
  return window.Plotly || null;
};

const resolveTargetWidth = (target) => {
  if (!target) return 0;
  const rect = target.getBoundingClientRect?.();
  if (rect && rect.width) return rect.width;
  return target.offsetWidth || 0;
};

const resolveScale = (width, maxWidth) => {
  if (!width || !maxWidth) return 1;
  return Math.min(1, maxWidth / width);
};

const resolveCaptureBounds = (target) => {
  if (!target) return null;
  const targetRect = target.getBoundingClientRect?.();
  if (!targetRect) return null;
  const rects = [];
  const addRect = (node) => {
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    rects.push(rect);
  };
  target.querySelectorAll('.workspace-panel').forEach((node) => addRect(node));
  addRect(target.querySelector('.workspace-toolbar'));
  addRect(target.querySelector('.workspace-toolbar-vertical'));
  if (!rects.length) {
    addRect(target);
  }
  if (!rects.length) return null;

  const padding = 12;
  let minX = rects[0].left;
  let minY = rects[0].top;
  let maxX = rects[0].right;
  let maxY = rects[0].bottom;
  rects.slice(1).forEach((rect) => {
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  });
  minX = Math.max(minX - padding, targetRect.left);
  minY = Math.max(minY - padding, targetRect.top);
  maxX = Math.min(maxX + padding, targetRect.right);
  maxY = Math.min(maxY + padding, targetRect.bottom);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const x = Math.max(0, minX - targetRect.left);
  const y = Math.max(0, minY - targetRect.top);
  return {
    x,
    y,
    width,
    height
  };
};

const resolvePlotTargets = (target) => {
  if (!target) return [];
  return Array.from(target.querySelectorAll('.js-plotly-plot'));
};

const resolveBackgroundColor = (target) => {
  if (!target || typeof window === 'undefined') return '#0b1220';
  const computed = window.getComputedStyle?.(target);
  const color = computed?.backgroundColor;
  if (!color || color === 'transparent') return '#0b1220';
  return color;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const capturePlotsOnly = async (target, maxWidth) => {
  const plotly = resolvePlotly();
  if (!plotly || typeof plotly.toImage !== 'function') return null;
  const plots = resolvePlotTargets(target);
  if (!plots.length) return null;
  const targetRect = target.getBoundingClientRect?.();
  if (!targetRect) return null;
  const rects = plots
    .map((plot) => ({ plot, rect: plot.getBoundingClientRect() }))
    .filter(({ rect }) => rect && rect.width && rect.height);
  if (!rects.length) return null;

  let minX = rects[0].rect.left;
  let minY = rects[0].rect.top;
  let maxX = rects[0].rect.right;
  let maxY = rects[0].rect.bottom;
  rects.slice(1).forEach(({ rect }) => {
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  });
  const padding = 8;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = resolveScale(width, maxWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = resolveBackgroundColor(target);
  ctx.fillRect(0, 0, width, height);

  for (const { plot, rect } of rects) {
    const plotWidth = Math.max(1, Math.round(rect.width));
    const plotHeight = Math.max(1, Math.round(rect.height));
    const dataUrl = await plotly.toImage(plot, { format: 'png', width: plotWidth, height: plotHeight });
    if (!dataUrl) continue;
    const img = await loadImage(dataUrl);
    const x = rect.left - minX;
    const y = rect.top - minY;
    ctx.drawImage(img, x, y, rect.width, rect.height);
  }

  return canvas.toDataURL('image/png');
};

export function createCanvasThumbnailController({
  canvasWrapper,
  getActiveCanvasId,
  canCapture,
  saveThumbnail,
  beforeNavigate = null,
  maxWidth = DEFAULT_MAX_WIDTH,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS
} = {}) {
  if (typeof saveThumbnail !== 'function') return null;

  let inFlight = false;
  let captureTimer = null;
  let disposed = false;
  let isDirty = false;
  let backButton = null;
  let backButtonHandler = null;

  const resolveTarget = () => {
    if (canvasWrapper) return canvasWrapper;
    if (typeof document === 'undefined') return null;
    return document.querySelector('.workspace-canvas-wrapper');
  };

  const shouldCapture = () => {
    if (typeof canCapture === 'function') return !!canCapture();
    return true;
  };

  const resolveCanvasId = () => {
    if (typeof getActiveCanvasId === 'function') return getActiveCanvasId();
    return null;
  };

  const capture = async ({ keepalive = false } = {}) => {
    if (inFlight || disposed) {
      debugLog('skip: inFlight/disposed', { inFlight, disposed });
      return;
    }
    if (!isDirty) {
      debugLog('skip: no changes');
      return;
    }
    if (!shouldCapture()) {
      debugLog('skip: canCapture=false');
      return;
    }
    const canvasId = resolveCanvasId();
    if (!canvasId) {
      debugLog('skip: no canvasId');
      return;
    }
    const target = resolveTarget();
    if (!target || !target.isConnected) {
      debugLog('skip: target missing');
      return;
    }
    const html2canvas = resolveHtml2Canvas();
    if (!html2canvas) {
      debugLog('skip: html2canvas missing');
      return;
    }

    inFlight = true;
    try {
      debugLog('capture:start', { canvasId, keepalive });
      let dataUrl = await capturePlotsOnly(target, maxWidth);
      if (dataUrl) {
        debugLog('capture:rendered:plotly');
      } else {
        const bounds = resolveCaptureBounds(target);
        const scale = resolveScale(bounds?.width || resolveTargetWidth(target), maxWidth);
        const html2canvas = resolveHtml2Canvas();
        if (!html2canvas) {
          debugLog('skip: html2canvas missing');
          return;
        }
        debugLog('capture:rendered:html2canvas');
        const output = await html2canvas(target, {
          backgroundColor: null,
          useCORS: true,
          scale,
          foreignObjectRendering: false,
          logging: false,
          ...(bounds ? bounds : {})
        });
        dataUrl = output?.toDataURL?.('image/png');
      }
      if (!dataUrl || !dataUrl.startsWith(DATA_URL_PREFIX)) {
        debugLog('skip: invalid dataUrl');
        return;
      }
      debugLog('capture:uploading');
      await saveThumbnail(canvasId, { thumbnail: dataUrl }, { keepalive });
      isDirty = false;
      clearError();
      debugLog('capture:saved');
    } catch (error) {
      recordError(error);
      debugLog('capture:error', error?.message || error);
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Thumbnail] capture failed', error);
      }
    } finally {
      inFlight = false;
    }
  };

  const scheduleAutosaveCapture = () => {
    if (disposed) return;
    isDirty = true;
    if (captureTimer) clearTimeout(captureTimer);
    debugLog('autosave:scheduled', { delayMs: autosaveDebounceMs });
    captureTimer = setTimeout(() => {
      captureTimer = null;
      void capture();
    }, autosaveDebounceMs);
  };

  const attachBackButton = (button) => {
    if (!button || typeof button.addEventListener !== 'function') return;
    if (backButton && backButtonHandler) {
      backButton.removeEventListener('click', backButtonHandler);
    }
    backButton = button;
    backButtonHandler = (event) => {
      if (!event || event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = backButton?.getAttribute?.('href');
      if (!href) return;
      debugLog('back:click', { href });
      event.preventDefault();
      event.stopPropagation();
      const navigate = () => window.location.assign(href);
      const runBeforeNavigate = async () => {
        if (typeof beforeNavigate === 'function') {
          await beforeNavigate();
        }
      };
      if (!isDirty) {
        runBeforeNavigate()
          .catch(() => {})
          .finally(() => {
            navigate();
          });
        return;
      }
      runBeforeNavigate()
        .catch(() => {})
        .then(() => capture())
        .catch(() => {})
        .finally(() => {
          navigate();
        });
    };
    backButton.addEventListener('click', backButtonHandler);
  };

  return {
    captureNow: (options) => capture(options),
    handleAutosave: () => scheduleAutosaveCapture(),
    attachBackButton,
    teardown() {
      disposed = true;
      if (captureTimer) {
        clearTimeout(captureTimer);
        captureTimer = null;
      }
      if (backButton && backButtonHandler) {
        backButton.removeEventListener('click', backButtonHandler);
      }
      backButton = null;
      backButtonHandler = null;
    }
  };
}
