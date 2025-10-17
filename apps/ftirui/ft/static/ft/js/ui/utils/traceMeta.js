export function normalizeTraceMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const result = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (!text) return;
    result[String(key).toUpperCase()] = text;
  });
  return result;
}

export function summarizeTraceMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const preferred = ['TITLE', 'DATE', 'ORIGIN', 'SAMPLE', 'RESOLUTION', 'INPUT_MODE', 'CONVERSION', 'YUNITS'];
  const parts = [];
  const formatKey = (key) => key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  preferred.forEach((key) => {
    const val = meta[key];
    if (!val) return;
    parts.push(`${formatKey(key)}: ${val}`);
  });
  const extras = Object.keys(meta)
    .filter((key) => !preferred.includes(key) && !key.startsWith('POINT') && key !== 'FILENAME')
    .slice(0, 3);
  extras.forEach((key) => {
    const val = meta[key];
    if (!val) return;
    parts.push(`${formatKey(key)}: ${val}`);
  });
  return parts.join('\n');
}
