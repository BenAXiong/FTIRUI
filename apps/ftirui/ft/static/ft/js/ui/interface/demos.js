import { fetchDemoFiles } from '../../services/demos.js';
import { ensureFolderStructure } from './state.js';

export function hideDemoButton(instance) {
  instance.dom.demoBtn?.classList.add('d-none');
  instance.dom.dz?.classList.add('d-none');
  instance.dom.dz?.classList.remove('dragover');
  instance.dom.plot?.classList.remove('dragover');
}

export function showDemoButton(instance) {
  instance.dom.demoBtn?.classList.remove('d-none');
  instance.dom.dz?.classList.remove('d-none');
  instance.dom.dz?.classList.remove('dragover');
  instance.dom.plot?.classList.remove('dragover');
}

export function syncDemoButton(instance) {
  const hasTraces = (instance.state.order || []).length > 0;
  if (hasTraces) {
    hideDemoButton(instance);
  } else {
    showDemoButton(instance);
  }
}

export async function preloadDemoFiles(instance, { limit = 6, force = false } = {}) {
  ensureFolderStructure(instance.state);

  if (!force && Array.isArray(instance.demoFilesCache) && instance.demoFilesCache.length) {
    return instance.demoFilesCache;
  }

  try {
    const files = await fetchDemoFiles(limit);
    instance.demoFilesCache = files;
    return files;
  } catch (err) {
    console.warn('demo preload failed:', err);
    return Array.isArray(instance.demoFilesCache) ? instance.demoFilesCache : [];
  }
}
