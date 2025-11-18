const BUTTON_STYLES = {
  base: 'workspace-hud-fab',
  ops: 'workspace-operations-toggle',
  dev: 'workspace-dev-toggle',
  cdp: 'workspace-cdp-toggle',
  ghost: 'workspace-ghost-toggle',
  collapse: 'workspace-hud-collapse'
};

export function createHudButtons({
  canvasWrapper,
  onToggleOperations,
  onToggleDevMode,
  onToggleCdp,
  onToggleGhost,
  onToggleCollapse,
  devModeEnabled = false,
  ghostModeEnabled = false
} = {}) {
  if (!canvasWrapper) return null;
  const container = ensureContainer(canvasWrapper);
  const operationsBtn = ensureButton(container, 'ops', {
    label: 'Ops',
    ariaLabel: 'Toggle operations log',
    onClick: onToggleOperations
  });
  const devBtn = ensureButton(container, 'dev', {
    label: 'Dev',
    ariaLabel: 'Toggle workspace dev mode',
    onClick: onToggleDevMode
  });
  const cdpBtn = ensureButton(container, 'cdp', {
    label: 'CDP',
    ariaLabel: 'Open Canvas Data Peeker',
    onClick: onToggleCdp
  });
  const ghostBtn = ensureButton(container, 'ghost', {
    icon: 'bi bi-eye',
    ariaLabel: 'Toggle UI visibility',
    onClick: onToggleGhost
  });
  const collapseBtn = ensureButton(container, 'collapse', {
    icon: 'bi bi-chevron-right',
    ariaLabel: 'Collapse controls',
    onClick: () => {
      const next = !container.classList.contains('is-collapsed');
      container.classList.toggle('is-collapsed', next);
      updateCollapseIcon(collapseBtn, next);
      onToggleCollapse?.(next);
    }
  });
  collapseBtn.classList.add('workspace-hud-collapse');

  updateDevState(devBtn, devModeEnabled);
  updateGhostState(ghostBtn, ghostModeEnabled);

  return {
    container,
    operationsBtn,
    devBtn,
    cdpBtn,
    ghostBtn,
    collapseBtn,
    updateDevState: (enabled) => updateDevState(devBtn, enabled),
    updateGhostState: (enabled) => updateGhostState(ghostBtn, enabled)
  };
}

function ensureContainer(root) {
  let container = root.querySelector('.workspace-hud-fab-container');
  if (container?.isConnected) return container;
  container = document.createElement('div');
  container.className = 'workspace-hud-fab-container';
  root.appendChild(container);
  return container;
}

function ensureButton(container, type, { label = '', icon = null, ariaLabel = null, onClick = () => {} }) {
  const existing = container.querySelector(`[data-hud-fab="${type}"]`);
  if (existing) return existing;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.hudFab = type;
  const preset = BUTTON_STYLES[type] ?? '';
  btn.className = `${BUTTON_STYLES.base} ${preset}`.trim();
  if (icon) {
    const iconEl = document.createElement('i');
    iconEl.className = icon;
    btn.appendChild(iconEl);
  }
  if (label) {
    btn.appendChild(document.createTextNode(label));
  }
  btn.setAttribute('aria-label', ariaLabel || label || type);
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    onClick?.(event);
  });
  container.appendChild(btn);
  return btn;
}

function updateDevState(btn, enabled) {
  if (!btn) return;
  btn.classList.toggle('is-active', enabled);
  btn.setAttribute('aria-pressed', String(enabled));
}

function updateGhostState(btn, enabled) {
  if (!btn) return;
  btn.classList.toggle('is-active', enabled);
  btn.setAttribute('aria-pressed', String(enabled));
  const iconEl = btn.querySelector('i');
  if (iconEl) {
    iconEl.className = enabled ? 'bi bi-eye-slash' : 'bi bi-eye';
  }
}

function updateCollapseIcon(btn, collapsed) {
  if (!btn) return;
  const iconEl = btn.querySelector('i');
  if (iconEl) {
    iconEl.className = collapsed ? 'bi bi-chevron-left' : 'bi bi-chevron-right';
  }
  btn.setAttribute('aria-pressed', String(collapsed));
}
