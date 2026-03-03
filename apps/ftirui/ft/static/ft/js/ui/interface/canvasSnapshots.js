import {
  createCanvasVersion,
  listCanvasVersions,
  fetchCanvasVersion
} from '../../services/dashboard.js';
import { captureEvent } from '../../services/analytics.js';

const toast = (options = {}) => window.showAppToast?.(options);

export function initCanvasSnapshots({ bridge, saveButton, manageButton, modal }) {
  if (!bridge) {
    disableButton(saveButton);
    disableButton(manageButton);
    return null;
  }

  const controller = createController({ bridge, modal });

  saveButton?.addEventListener('click', () => controller.saveSnapshot());
  manageButton?.addEventListener('click', () => controller.openModal());

  return controller;
}

function createController({ bridge, modal }) {
  const modalInstance = modal && typeof bootstrap !== 'undefined'
    ? bootstrap.Modal.getOrCreateInstance(modal)
    : null;
  const listContainer = modal?.querySelector('[data-snapshot-list]');
  const emptyState = modal?.querySelector('[data-snapshot-empty]');

  const renderList = (items) => {
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (!items.length) {
      emptyState?.classList.remove('d-none');
      return;
    }
    emptyState?.classList.add('d-none');
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'snapshot-row d-flex align-items-center justify-content-between gap-2';
      row.innerHTML = `
        <div>
          <div class="fw-semibold">${escapeHtml(item.label || item.id.slice(0, 8))}</div>
          <div class="text-muted small">${formatRelative(item.created)} • ${formatSize(item.state_size)}</div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" data-action="restore" data-version="${item.id}">
            Restore
          </button>
        </div>
      `;
      listContainer.appendChild(row);
    });
  };

  const refresh = async () => {
    if (!listContainer) return;
    listContainer.classList.add('is-loading');
    try {
      const payload = await listCanvasVersions(bridge.id);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      renderList(items);
    } catch (err) {
      toast({
        title: 'Unable to load snapshots',
        message: err?.message || String(err),
        variant: 'danger'
      });
    } finally {
      listContainer.classList.remove('is-loading');
    }
  };

  const handleRestore = async (versionId) => {
    if (!versionId) return;
    try {
      const version = await fetchCanvasVersion(bridge.id, versionId);
      if (!version?.state) {
        throw new Error('Snapshot payload missing.');
      }
      await bridge.save(version.state, version.label);
      bridge.applyLocal(version.state);
      captureEvent('snapshot_restored', {
        canvas_id: bridge.id,
        restore_source: 'version_list'
      });
      toast({
        title: 'Snapshot restored',
        message: version.label ? `"${version.label}" applied.` : 'Canvas restored.',
        variant: 'success'
      });
      modalInstance?.hide();
    } catch (err) {
      toast({
        title: 'Restore failed',
        message: err?.message || String(err),
        variant: 'danger'
      });
    }
  };

  listContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-action="restore"]');
    if (btn?.dataset.version) {
      void handleRestore(btn.dataset.version);
    }
  });

  return {
    async saveSnapshot() {
      const label = window.prompt('Snapshot label', bridge.defaultTitle || 'Snapshot');
      if (label === null) return;
      try {
        await createCanvasVersion(bridge.id, { label });
        toast({
          title: 'Snapshot saved',
          message: `"${label || 'Snapshot'}" created.`,
          variant: 'success'
        });
      } catch (err) {
        toast({
          title: 'Unable to save snapshot',
          message: err?.message || String(err),
          variant: 'danger'
        });
      }
    },
    openModal() {
      if (!modalInstance) return;
      modalInstance.show();
      void refresh();
    }
  };
}

function disableButton(btn) {
  if (!btn) return;
  btn.disabled = true;
  btn.title = 'Available when a project canvas is open';
}

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatRelative = (iso) => {
  if (!iso) return '—';
  try {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return iso;
    return value.toLocaleString();
  } catch {
    return iso;
  }
};

const formatSize = (value) => {
  if (!Number.isFinite(Number(value)) || !value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / Math.pow(1024, idx);
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[idx]}`;
};
