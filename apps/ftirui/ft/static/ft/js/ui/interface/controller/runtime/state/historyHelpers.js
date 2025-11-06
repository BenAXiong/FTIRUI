export function createHistoryHelpers({
  pushHistory,
  updateHistoryButtons,
  persist
} = {}) {
  const safePush = typeof pushHistory === 'function'
    ? (label) => pushHistory(label)
    : () => {};
  const safePersist = typeof persist === 'function'
    ? (...args) => persist(...args)
    : () => {};
  const safeRefresh = typeof updateHistoryButtons === 'function'
    ? (...args) => updateHistoryButtons(...args)
    : () => {};

  return {
    queueMutation(task, { persistChange = true, label = null } = {}) {
      if (typeof task !== 'function') return false;
      safePush(label);
      task();
      if (persistChange) {
        safePersist();
      }
      safeRefresh();
      return true;
    },
    push(label = null) {
      safePush(label);
    },
    pushHistory(label = null) {
      safePush(label);
    },
    persist() {
      safePersist();
    },
    updateHistoryButtons() {
      safeRefresh();
    },
    refresh() {
      safeRefresh();
    }
  };
}
