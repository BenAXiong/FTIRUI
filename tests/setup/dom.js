import { afterEach, vi } from 'vitest';

if (!global.window) {
  global.window = global;
}

if (!window.showAppToast) {
  window.showAppToast = () => {};
}

if (!global.fetch) {
  global.fetch = vi.fn();
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

