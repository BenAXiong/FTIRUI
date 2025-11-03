const DEFAULT_LIMIT = 25;

const cloneSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot ?? null;
  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch {
    return snapshot;
  }
};

export function createHistory({ limit = DEFAULT_LIMIT } = {}) {
  const capacity = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
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

  return {
    push(snapshot) {
      past.push(cloneSnapshot(snapshot));
      if (past.length > capacity) {
        past.shift();
      }
      future.length = 0;
      notify();
    },
    undo(currentState) {
      if (!past.length) return null;
      future.push(cloneSnapshot(currentState));
      const snapshot = past.pop();
      notify();
      return snapshot ?? null;
    },
    redo(currentState) {
      if (!future.length) return null;
      past.push(cloneSnapshot(currentState));
      const snapshot = future.pop();
      notify();
      return snapshot ?? null;
    },
    clear() {
      past.length = 0;
      future.length = 0;
      notify();
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
        past: past.slice(),
        future: future.slice()
      };
    }
  };
}

export default {
  createHistory
};
