export function downsamplePreview(x, y, target = 150) {
  if (x.length <= target) {
    return { px: x, py: y };
  }

  const stride = Math.ceil(x.length / target);
  const px = [];
  const py = [];

  for (let i = 0; i < x.length; i += stride) {
    px.push(x[i]);
    py.push(y[i]);
  }

  return { px, py };
}
