const DASH_PATTERNS = {
  solid: '',
  dot: '1 6',
  dash: '6 6',
  longdash: '12 6',
  dashdot: '6 4 1 4',
  longdashdot: '12 4 1 4'
};

export function normalizeDashValue(value) {
  return Object.prototype.hasOwnProperty.call(DASH_PATTERNS, value) ? value : 'solid';
}

export function dashIconSvg(value) {
  const dashValue = normalizeDashValue(value);
  const pattern = DASH_PATTERNS[dashValue];
  const dashAttr = pattern ? ` stroke-dasharray="${pattern}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 10" preserveAspectRatio="none"><line x1="1" y1="5" x2="35" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"${dashAttr}></line></svg>`;
}

export function dashIconUri(value) {
  const svg = dashIconSvg(value).replace(/\s+/g, ' ').trim();
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function applyDashIcon(selectEl, dashValue) {
  if (!selectEl) return;
  const value = normalizeDashValue(dashValue);
  selectEl.dataset.dash = value;
  selectEl.style.backgroundImage = dashIconUri(value);
}

export function toHexColor(color) {
  if (!color) return '#888888';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
  const ctx = toHexColor._ctx || (toHexColor._ctx = document.createElement('canvas').getContext('2d'));
  ctx.fillStyle = '#000000ff';
  ctx.fillStyle = color;
  const computed = ctx.fillStyle;
  if (computed.startsWith('#')) return computed;
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = (+match[1]).toString(16).padStart(2, '0');
    const g = (+match[2]).toString(16).padStart(2, '0');
    const b = (+match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#888888';
}
