import { escapeHtml } from './dom.js';

let markedConfigured = false;

const getMarked = () => {
  if (typeof window === 'undefined') return null;
  const candidate = window.marked || window.Marked;
  if (candidate && typeof candidate.parse === 'function') {
    return candidate;
  }
  if (typeof candidate === 'function') {
    return { parse: candidate };
  }
  return null;
};

const formatPlainMarkdown = (input) => {
  const safe = escapeHtml(input);
  const blocks = safe.split(/\n{2,}/).map((block) => block.trim());
  return blocks
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('') || '<p class="text-muted mb-0">Start typing…</p>';
};

export function renderMarkdown(text = '') {
  const value = typeof text === 'string' ? text : '';
  if (!value.trim()) {
    return '<p class="text-muted mb-0">Start typing…</p>';
  }
  const marked = getMarked();
  if (marked) {
    try {
      if (!markedConfigured && typeof marked.setOptions === 'function') {
        marked.setOptions({ breaks: true });
        markedConfigured = true;
      }
      return marked.parse(value);
    } catch {
      return formatPlainMarkdown(value);
    }
  }
  return formatPlainMarkdown(value);
}
