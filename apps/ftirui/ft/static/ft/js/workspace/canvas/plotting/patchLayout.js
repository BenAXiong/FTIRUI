/**
 * Responsibility: Provide immutable-friendly helpers for cloning figures and applying dotted layout patches.
 * Inputs: accepts figure objects and patch descriptors passed by the actions controller.
 * Outputs: returns cloned figure structures and mutates provided copies in-place as directed.
 * Never: never reach into DOM or Plotly, never mutate the original model references, never call storage/history.
 */

export function cloneFigure(fig) {
  return {
    data: (fig?.data ?? []).map(d => ({ ...d, line: d.line ? { ...d.line } : d.line })),
    layout: structuredClone(fig?.layout ?? {})
  };
}

// Set a dotted path inside an object: setDotted(obj, "xaxis.gridcolor", "#eee")
export function setDotted(obj, dottedKey, value) {
  const parts = dottedKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// Apply a shallow layout patch with dotted keys → returns new figure
export function applyLayoutPatch(fig, patch) {
  const out = cloneFigure(fig);
  for (const [key, val] of Object.entries(patch ?? {})) {
    setDotted(out.layout, key, val);
  }
  return out;
}

// Example guard: ensure enabling minor grid implies enabling major grid.
export function guardAxisGrid(layout, axisKey) {
  const a = layout?.[axisKey] ?? {};
  if (a.minorgridcolor && !a.gridcolor) {
    layout[axisKey].gridcolor = a.minorgridcolor;
  }
}
