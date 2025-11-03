const DEFAULT_LIMIT = 25;
const DEFAULT_TOLERANCE = 4;

const cloneSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot ?? null;
  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch {
    return snapshot;
  }
};

const getPanelMap = (snapshot) => {
  const panels = snapshot?.panels;
  const items = Array.isArray(panels?.items)
    ? panels.items
    : Array.isArray(panels)
      ? panels
      : [];
  const map = new Map();
  items.forEach((item) => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });
  return map;
};

const geometryDelta = (prev, next) => {
  if (!prev || !next) return null;
  const prevMap = getPanelMap(prev);
  const nextMap = getPanelMap(next);
  if (prevMap.size === 0 && nextMap.size === 0) return 0;
  if (prevMap.size !== nextMap.size) return Number.POSITIVE_INFINITY;
  let delta = 0;
  let compared = false;
  for (const [id, current] of nextMap.entries()) {
    const prior = prevMap.get(id);
    if (!prior) return Number.POSITIVE_INFINITY;
    const keys = ['x', 'y', 'width', 'height'];
    keys.forEach((key) => {
      const a = Number(prior[key]);
      const b = Number(current[key]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        compared = true;
        delta += Math.abs(a - b);
      }
    });
  }
  return compared ? delta : null;
};

const serialize = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

export function createHistory({
  limit = DEFAULT_LIMIT,
  tolerance = DEFAULT_TOLERANCE
} = {}) {
  const capacity = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  const squashTolerance = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_TOLERANCE;
  const past = [];
  const future = [];
  let onChange = null;

  const notify = () => {
    if (typeof onChange === 'function') {
      onChange({
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        size: past.length,
        futureSize: future.length
      });
    }
  };

  const pushEntry = (entry) => {
    past.push(entry);
    if (past.length > capacity) {
      past.shift();
    }
    future.length = 0;
  };

  return {
    push(snapshot, label = null) {
      const state = cloneSnapshot(snapshot);
      const last = past[past.length - 1];
      if (last) {
        const serializedLast = last.__serialized ?? serialize(last.state);
        const serializedNext = serialize(state);
        if (serializedLast && serializedNext && serializedLast === serializedNext) {
          last.label = label || last.label;
          notify();
          return false;
        }
        const delta = geometryDelta(last.state, state);
        if (delta != null && delta <= squashTolerance) {
          last.state = state;
          last.label = label || last.label;
          last.__serialized = serializedNext;
          notify();
          return true;
        }
      }
      pushEntry({
        state,
        label,
        __serialized: serialize(state)
      });
      notify();
      return true;
    },
    undo(currentState) {
      if (!past.length) return null;
      future.push({
        state: cloneSnapshot(currentState)
      });
      const entry = past.pop();
      notify();
      return entry?.state ?? null;
    },
    redo(currentState) {
      if (!future.length) return null;
      past.push({
        state: cloneSnapshot(currentState),
        label: null,
        __serialized: serialize(currentState)
      });
      const entry = future.pop();
      notify();
      return entry?.state ?? null;
    },
    clear() {
      past.length = 0;
      future.length = 0;
      notify();
    },
    rewind() {
      if (!past.length) return false;
      past.pop();
      notify();
      return true;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    setOnChange(handler) {
      onChange = typeof handler === 'function' ? handler : null;
      notify();
    },
    inspect() {
      return {
        past: past.map((entry) => cloneSnapshot(entry.state)),
        future: future.map((entry) => cloneSnapshot(entry.state))
      };
    }
  };
}

export default {
  createHistory
};
