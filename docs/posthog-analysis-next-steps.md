# PostHog Analysis Next Steps

This note covers what to do with the first PostHog data now that the initial implementation is live.

It is intentionally narrow. The goal is to answer a few real product questions before adding more events or building a large dashboard.

## First Questions To Answer

- are users reaching the dashboard and workspace successfully
- do they open a canvas after landing
- do they import a file after opening a canvas
- do they save work after importing
- do they show any upgrade intent later

## First 3 Insights To Build

1. Funnel
   - `route_resolved`
   - `canvas_opened`
   - `file_imported`
   - `canvas_saved`

2. Daily trend
   - `canvas_opened`
   - `canvas_saved`
   - `file_imported`
   - `plan_checkout_started`

3. Breakdown
   - event: `canvas_saved` or `file_imported`
   - breakdown by:
     - `auth_state`
     - `workspace_plan`
     - `route_name`

## Signals To Watch

- many `route_resolved` but few `canvas_opened`
  - likely entry or dashboard UX confusion

- many `canvas_opened` but few `file_imported`
  - likely import friction

- many `file_imported` but few `canvas_saved`
  - likely unclear value or save behavior

- strong usage but no `plan_checkout_started`
  - likely pricing, timing, or upgrade CTA problem

## What Not To Do Yet

- do not add many more events yet
- do not build a large analytics dashboard yet
- do not optimize around web vitals or person profiles first

## Rule

Use the current event set to answer these product questions first. Only add more instrumentation once the first insights stop being sufficient.
