export function createHistoryHelpers({ pushHistory, updateHistoryButtons, persist } = {}) {
  const safePush = typeof pushHistory === 'function' ? pushHistory : () => {};
  const safePersist = typeof persist === 'function' ? persist : () => {};
  const safeRefresh = typeof updateHistoryButtons === 'function' ? updateHistoryButtons : () => {};

  return {
    queueMutation(task, { persistChange = true } = {}) {
      if (typeof task !== 'function') return false;
      safePush();
      task();
      if (persistChange) {
        safePersist();
      }
      safeRefresh();
      return true;
    },
    push() {
      safePush();
    },
    persist() {
      safePersist();
    },
    refresh() {
      safeRefresh();
    }
  };
}
