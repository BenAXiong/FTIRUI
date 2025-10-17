import { getDisplayConfig } from '../../ui/config/display.js';

export function normalizeGlobalInputState(state) {
  if (!state || !state.global) return;
  const global = state.global;
  if (typeof global.inputAuto !== 'boolean') {
    const legacyMode = String(global.inputMode || '').trim().toLowerCase();
    global.inputAuto = legacyMode === 'auto' || legacyMode === '';
  }
  let mode = String(global.inputMode || '').trim().toLowerCase();
  if (mode === 'auto' || (mode !== 'abs' && mode !== 'tr')) {
    const units = String(global.units || '').trim().toLowerCase();
    mode = units.startsWith('abs') ? 'abs' : 'tr';
  }
  if (mode !== 'abs' && mode !== 'tr') mode = 'tr';
  global.inputMode = mode;
}

export function isInputAuto(state) {
  return !!(state?.global?.inputAuto ?? true);
}

export function currentInputMode(state) {
  const mode = String(state?.global?.inputMode || '').trim().toLowerCase();
  return mode === 'abs' ? 'abs' : 'tr';
}

export function uploadInputUnits(state) {
  return isInputAuto(state) ? 'auto' : currentInputMode(state);
}

export function applyResolvedInputMode(state, resolved) {
  if (!state || !state.global) return;
  state.global.inputMode = resolved === 'abs' ? 'abs' : 'tr';
  if (state.global.inputAuto !== false) {
    const cfg = getDisplayConfig(state.global.inputMode);
    state.global.units = cfg.key;
  }
}

export function setUnitsForMode(state, mode) {
  if (!state || !state.global) return getDisplayConfig(mode);
  const cfg = getDisplayConfig(mode);
  state.global.units = cfg.key;
  return cfg;
}

export function syncInputControls(instance) {
  if (!instance || !instance.state) return;
  const { state } = instance;
  const autoInput = instance.dom?.unitAuto || document.getElementById('b_units_auto');
  const absInput = instance.dom?.unitAbs || document.getElementById('b_units_abs');
  const trInput = instance.dom?.unitTr || document.getElementById('b_units_tr');
  const autoLabel = instance.dom?.unitAutoLabel || document.querySelector('label[for="b_units_auto"]');
  const absLabel = instance.dom?.unitAbsLabel || document.querySelector('label[for="b_units_abs"]');
  const trLabel = instance.dom?.unitTrLabel || document.querySelector('label[for="b_units_tr"]');

  const autoEnabled = isInputAuto(state);
  const mode = currentInputMode(state);
  const disableManual = autoEnabled;

  if (autoInput) autoInput.checked = autoEnabled;
  if (autoLabel) autoLabel.classList.toggle('active', autoEnabled);

  if (absInput) {
    absInput.checked = mode === 'abs';
    absInput.disabled = disableManual;
  }
  if (trInput) {
    trInput.checked = mode !== 'abs';
    trInput.disabled = disableManual;
  }

  if (absLabel) absLabel.classList.toggle('disabled', disableManual);
  if (trLabel) trLabel.classList.toggle('disabled', disableManual);
}
