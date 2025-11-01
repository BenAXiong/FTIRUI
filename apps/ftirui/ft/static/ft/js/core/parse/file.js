export async function parseFileToXY(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const x = new Array(lines.length);
  const y = new Array(lines.length);

  for (let i = 0; i < lines.length; i += 1) {
    const [sx, sy] = lines[i].split(/[,\t; ]+/);
    x[i] = Number(sx);
    y[i] = Number(sy);
  }

  return { x, y };
}

export async function checksumFile(file) {
  const buffer = await file.arrayBuffer();
  const view = new Uint8Array(buffer);
  let hash = 2166136261;

  for (let i = 0; i < view.length; i += 1) {
    hash ^= view[i];
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}
