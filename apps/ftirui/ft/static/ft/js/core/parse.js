export async function parseFileToXY(file) {
  const text = await file.text(); // fine for M1
  const lines = text.split(/\r?\n/).filter(Boolean);
  const x = new Array(lines.length);
  const y = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const [sx, sy] = lines[i].split(/[,\t; ]+/);
    x[i] = Number(sx); y[i] = Number(sy);
  }
  return { x, y };
}

export function downsamplePreview(x, y, target = 150) {
  if (x.length <= target) return { px: x, py: y };
  const stride = Math.ceil(x.length / target);
  const px = [], py = [];
  for (let i = 0; i < x.length; i += stride) { px.push(x[i]); py.push(y[i]); }
  return { px, py };
}

export async function checksumFile(file) {
  const buf = await file.arrayBuffer();
  const view = new Uint8Array(buf);
  let h = 2166136261;
  for (let i = 0; i < view.length; i++) { h ^= view[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
