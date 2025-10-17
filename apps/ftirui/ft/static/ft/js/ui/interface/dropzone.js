import { hideDemoButton, showDemoButton, preloadDemoFiles } from './demos.js';

export async function collectDroppedFiles(dataTransfer) {
  const files = [];
  if (!dataTransfer) return files;

  const items = dataTransfer.items;
  if (items && items.length) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        const entryFiles = await readEntryRecursive(entry);
        files.push(...entryFiles);
      } else {
        const file = item.getAsFile?.();
        if (file) files.push(file);
      }
    }
  } else if (dataTransfer.files?.length) {
    files.push(...dataTransfer.files);
  }
  return files;
}

async function readEntryRecursive(entry) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [file];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = [];
    const readBatch = () => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    let batch;
    do {
      batch = await readBatch();
      entries.push(...batch);
    } while (batch.length > 0);
    const files = [];
    for (const child of entries) {
      const result = await readEntryRecursive(child);
      files.push(...result);
    }
    return files;
  }
  return [];
}

export function bindDropzone(instance, { onFiles }) {
  const overlay = instance.dom.dz || document.getElementById('b_dropzone');
  const plotEl = instance.dom.plot || document.getElementById('b_plot_el');
  const inputEl = instance.dom.inp || document.getElementById('b_file_input');
  const browseBtn = instance.dom.browseBtn || document.getElementById('b_browse_btn');
  const demoBtn = instance.dom.demoBtn || document.getElementById('b_demo_btn');

  const triggerBrowse = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    inputEl?.click();
  };

  if (browseBtn && !browseBtn.dataset.dropzoneBound) {
    browseBtn.dataset.dropzoneBound = '1';
    browseBtn.addEventListener('click', triggerBrowse);
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('#b_demo_btn')) return;
      triggerBrowse(e);
    });
  }

  if (demoBtn && !demoBtn.dataset.dropzoneBound) {
    demoBtn.dataset.dropzoneBound = '1';
    demoBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideDemoButton(instance);
      try {
        const files = await preloadDemoFiles(instance, { limit: 12 });
        if (!files.length) {
          showDemoButton(instance);
          return;
        }
        await onFiles(files);
      } catch (err) {
        console.warn('demo preload failed:', err);
        showDemoButton(instance);
      }
    });
  }

  inputEl?.addEventListener('change', async () => {
    if (!inputEl.files?.length) return;
    await onFiles(inputEl.files);
    inputEl.value = '';
  });

  const addDragHighlight = () => {
    if (overlay && !overlay.classList.contains('d-none')) {
      overlay.classList.add('dragover');
    }
    plotEl?.classList.add('dragover');
  };

  const clearDragHighlight = () => {
    overlay?.classList.remove('dragover');
    plotEl?.classList.remove('dragover');
  };

  const handleDrag = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    addDragHighlight();
  };

  const handleDrop = async (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    clearDragHighlight();
    const items = await collectDroppedFiles(e.dataTransfer);
    if (!items.length) return;
    await onFiles(items);
  };

  [overlay, plotEl].forEach((target) => {
    if (!target) return;
    target.addEventListener('dragenter', handleDrag);
    target.addEventListener('dragover', handleDrag);
    target.addEventListener('dragleave', (e) => {
      if (target.contains(e.relatedTarget)) return;
      e.preventDefault();
      clearDragHighlight();
    });
    target.addEventListener('drop', handleDrop);
  });
}
