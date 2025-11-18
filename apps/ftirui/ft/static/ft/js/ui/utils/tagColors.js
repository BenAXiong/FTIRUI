const TAG_COLOR_PALETTE = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf'
];

const DEFAULT_TAGS = ['FT-IR', 'NMR', 'XPS', 'Abs', 'MS', 'XRD', 'Multiple'];
const registry = new Map();

const normalizeTag = (tag) => `${tag ?? ''}`.trim().toLowerCase();

const registerTagColor = (tag) => {
  const key = normalizeTag(tag);
  if (!key || registry.has(key)) return;
  const index = registry.size % TAG_COLOR_PALETTE.length;
  registry.set(key, TAG_COLOR_PALETTE[index]);
};

DEFAULT_TAGS.forEach(registerTagColor);

export const getWorkspaceTagColor = (tag) => {
  const key = normalizeTag(tag);
  if (!key) return TAG_COLOR_PALETTE[0];
  if (!registry.has(key)) {
    registerTagColor(tag);
  }
  return registry.get(key) || TAG_COLOR_PALETTE[0];
};

export const TAG_COLORS = TAG_COLOR_PALETTE.slice();
