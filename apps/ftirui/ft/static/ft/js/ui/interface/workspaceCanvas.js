import { initCanvas, disposeCanvas, getActiveCanvasController } from './init/initCanvas.js';

export const initWorkspaceCanvas = (options = {}) => initCanvas(options);

export { disposeCanvas, getActiveCanvasController };
