export function createColorCursorManager(initial = 0) {
  let cursor = Number.isFinite(initial) ? initial : 0;

  const get = () => cursor;
  const set = (value) => {
    if (Number.isFinite(value)) {
      cursor = value;
    }
    return cursor;
  };
  const reset = (value = 0) => {
    cursor = Number.isFinite(value) ? value : 0;
    return cursor;
  };
  const increment = (step = 1) => {
    cursor += Number.isFinite(step) ? step : 1;
    return cursor;
  };

  return {
    get,
    set,
    reset,
    increment
  };
}
