/**
 * Responsibility: Provide the legacy workspace bootstrap entry that wires the new controller.
 * Inputs: accepts optional controller configuration passed down to the bootstrapper.
 * Outputs: returns the active canvas controller instance and re-exports helper accessors.
 * Never: never reach back into DOM or models directly, never instantiate Plotly or browser facades here.
 */
import { initCanvas, disposeCanvas, getActiveCanvasController } from './init/initCanvas.js';

export const initWorkspaceCanvas = (options = {}) => initCanvas(options);

export { disposeCanvas, getActiveCanvasController };
