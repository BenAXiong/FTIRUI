const DEFAULT_MAX_WIDTH = 960;
const DATA_URL_PREFIX = 'data:image/';

const resolveHtml2Canvas = () => {
  if (typeof window === 'undefined') return null;
  return window.html2canvas || null;
};

const resolveTargetWidth = (target) => {
  if (!target) return 0;
  const rect = target.getBoundingClientRect?.();
  if (rect && rect.width) return rect.width;
  return target.offsetWidth || 0;
};

const resolveScale = (target, maxWidth) => {
  const width = resolveTargetWidth(target);
  if (!width || !maxWidth) return 1;
  return Math.min(1, maxWidth / width);
};

export function createCanvasThumbnailController({
  canvasWrapper,
  getActiveCanvasId,
  canCapture,
  saveThumbnail,
  maxWidth = DEFAULT_MAX_WIDTH
} = {}) {
  if (typeof saveThumbnail !== 'function') return null;

  let hasCaptured = false;
  let inFlight = false;

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
    if (inFlight || hasCaptured) return;
    if (!shouldCapture()) return;
    const canvasId = resolveCanvasId();
    if (!canvasId) return;
    const target = resolveTarget();
    if (!target || !target.isConnected) return;
    const html2canvas = resolveHtml2Canvas();
    if (!html2canvas) return;

    inFlight = true;
    try {
      const scale = resolveScale(target, maxWidth);
      const output = await html2canvas(target, {
        backgroundColor: null,
        useCORS: true,
        scale,
        logging: false
      });
      const dataUrl = output?.toDataURL?.('image/png');
      if (!dataUrl || !dataUrl.startsWith(DATA_URL_PREFIX)) return;
      hasCaptured = true;
      await saveThumbnail(canvasId, { thumbnail: dataUrl }, { keepalive });
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Thumbnail] capture failed', error);
      }
    } finally {
      inFlight = false;
    }
  };

  return {
    captureNow: (options) => capture(options),
    handleBeforeUnload() {
      void capture({ keepalive: true });
    },
    teardown() {
      hasCaptured = true;
    }
  };
}
