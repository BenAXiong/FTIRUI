import { normalizeDashValue } from './styling.js';

export function lineChipSvg({ color = '#888', width = 2, opacity = 1, dash = 'solid' }) {
  const d = normalizeDashValue(dash);
  const patterns = {
    solid: '',
    dot: '1 6',
    dash: '6 6',
    longdash: '12 6',
    dashdot: '6 4 1 4',
    longdashdot: '12 4 1 4'
  };
  const dashAttr = patterns[d] ? ` stroke-dasharray="${patterns[d]}"` : '';
  const safeW = Math.max(1, Math.min(12, Number(width) || 2));   // clamp 1..12
  const safeOp = Math.max(0.05, Math.min(1, Number(opacity) || 1));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 16" preserveAspectRatio="none">
      <line x1="6" y1="8" x2="66" y2="8"
            stroke="${color}" stroke-opacity="${safeOp}"
            stroke-width="${safeW}" stroke-linecap="round"${dashAttr}/>
    </svg>`;
  return svg.replace(/\s+/g, ' ').trim();
}

export function lineChipUri(opts){
  return `url("data:image/svg+xml,${encodeURIComponent(lineChipSvg(opts))}")`;
}

export function applyLineChip(el, {color, width, opacity, dash}){
  if (!el) return;
  el.style.backgroundImage = lineChipUri({color, width, opacity, dash});
  // Optional: also store current values for popups
  el.dataset.color = color; el.dataset.width = width;
  el.dataset.opacity = opacity; el.dataset.dash = dash;
}