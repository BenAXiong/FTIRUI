export function el(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

export function setHTML(id, html) {
  const node = el(id);
  if (node) {
    node.innerHTML = html;
  }
  return node;
}

export function show(id, visible) {
  const node = el(id);
  if (node) {
    node.style.display = visible ? '' : 'none';
  }
  return node;
}

export function onEl(id, eventName, handler, options) {
  const node = el(id);
  if (node) {
    node.addEventListener(eventName, handler, options);
  }
  return node;
}

export function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
