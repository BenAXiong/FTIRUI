# Legacy Workspace Preview/Live Controls

This directory preserves the former `initControls.js` implementation that used to power the Plotly preview/live/convert cards inside the Workspace tab.

## What it contains

- The original drag-and-drop + file input workflow (`drop_zone`, `conv_files`) that posted data to `/preview/`, `/data/`, `/plot`, and `/plot/` for conversions.
- UI helpers for the preview popup, demo/live plotting buttons, and ad‑hoc zoom controls.
- DOM binding glue for marker placement (`plotly_click`), “invert” toggles, X/Y range fields, and autosave relayout calls.
- Convenience utilities such as `scheduleReplot`, `filesToFileList`, and the conversion download logic that streamed responses back to disk.

## Why it was archived

The modern workspace runtime now owns all canvas behaviour, while the legacy preview widgets are no longer rendered in the app shell. Keeping the old script in the main bundle meant shipping unused code. The production entry point (`apps/ftirui/ft/static/ft/js/ui/workspace/initControls.js`) has therefore been replaced with a lightweight module that bootstraps only the canvas controller.

## How to reuse it

1. Copy or import `initControls.js` from this folder into your experiment.
2. Ensure the expected DOM structure exists (`#drop_zone`, `#preview_area`, `#plotly_plot`, conversion inputs, etc.).
3. Include Plotly (`window.Plotly`) and provide the same backend endpoints (`/preview/`, `/data/`, `/plot`) if you need live data.
4. Optionally cherry-pick specific helpers (e.g., conversion downloader) into new modules; the logic is pure and can be transplanted easily.

> The archived file is no longer bundled or referenced by the app. Rely on Git history or this directory if you ever need inspiration from the old workflow.
