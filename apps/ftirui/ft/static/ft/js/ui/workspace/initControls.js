/**
 * Responsibility: Mount the workspace pane and bootstrap the canvas controller once.
 * This replaces the legacy preview/live tooling, keeping only the wiring needed
 * by app.js to initialise the modern workspace runtime.
 */
import { initWorkspaceCanvas } from '../interface/workspaceCanvas.js';

let workspaceMounted = false;
let canvasBootstrapped = false;

const bootWorkspaceCanvas = () => {
  if (canvasBootstrapped) return;
  initWorkspaceCanvas();
  canvasBootstrapped = true;
};

export function mountWorkspace() {
  if (workspaceMounted) return true;
  const workspacePane = document.getElementById('pane-plotC');
  if (!workspacePane) return false;
  bootWorkspaceCanvas();
  workspaceMounted = true;
  return true;
}

export function __resetWorkspaceMountForTests() {
  workspaceMounted = false;
  canvasBootstrapped = false;
}
