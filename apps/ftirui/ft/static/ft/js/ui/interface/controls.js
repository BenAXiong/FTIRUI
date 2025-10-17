import {
  setUnitsForMode,
  syncInputControls,
  applyResolvedInputMode,
  currentInputMode
} from './inputMode.js';
import { signalAutosaveActivity } from './sessions.js';

export function bindGlobalControls(instance, { renderPlot, applyDisplayUnits }) {
  const { state } = instance;
  const plotEl = instance.dom.plot;

  const invx = document.getElementById('b_invx');
  const grid = document.getElementById('b_grid');
  const unif = document.getElementById('b_unified');
  const norm = document.getElementById('b_norm');
  const png = document.getElementById('b_png');
  const svg = document.getElementById('b_svg');
  const autoInput = instance.dom.unitAuto || document.getElementById('b_units_auto');
  const absInput = instance.dom.unitAbs || document.getElementById('b_units_abs');
  const trInput = instance.dom.unitTr || document.getElementById('b_units_tr');

  if (!plotEl) return;

  setUnitsForMode(state, state.global.units || state.global.inputMode || 'tr');

  if (invx) invx.checked = !!state.global.xinvert;
  if (unif) unif.checked = state.global.hovermode === 'x unified';
  if (norm) norm.value = state.global.normalize || 'off';

  const syncControls = (shouldRender = false) => {
    syncInputControls(instance);
    if (shouldRender) {
      applyDisplayUnits();
      renderPlot();
    }
  };

  if (autoInput) {
    autoInput.addEventListener('change', () => {
      state.global.inputAuto = !!autoInput.checked;
      if (state.global.inputAuto) {
        setUnitsForMode(state, currentInputMode(state));
      }
      syncControls(true);
      signalAutosaveActivity(instance);
    });
  }

  const handleManualSelect = (mode) => {
    state.global.inputAuto = false;
    applyResolvedInputMode(state, mode);
    setUnitsForMode(state, mode);
    syncControls(true);
    signalAutosaveActivity(instance);
  };

  if (absInput) {
    absInput.addEventListener('change', () => {
      if (!absInput.checked) return;
      handleManualSelect('abs');
    });
  }

  if (trInput) {
    trInput.addEventListener('change', () => {
      if (!trInput.checked) return;
      handleManualSelect('tr');
    });
  }

  syncControls(false);

  invx?.addEventListener('change', () => {
    state.global.xinvert = invx.checked;
    renderPlot();
    signalAutosaveActivity(instance);
  });

  grid?.addEventListener('change', () => {
    Plotly.relayout(plotEl, {
      'xaxis.showgrid': grid.checked,
      'yaxis.showgrid': grid.checked
    });
    signalAutosaveActivity(instance);
  });

  unif?.addEventListener('change', () => {
    state.global.hovermode = unif.checked ? 'x unified' : 'x';
    Plotly.relayout(plotEl, { hovermode: state.global.hovermode });
    signalAutosaveActivity(instance);
  });

  norm?.addEventListener('change', () => {
    state.global.normalize = norm.value;
    renderPlot();
    signalAutosaveActivity(instance);
  });

  png?.addEventListener('click', async () => {
    const url = await Plotly.toImage(plotEl, { format: 'png', scale: 2, height: 600, width: 1000 });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plot.png';
    a.click();
  });

  svg?.addEventListener('click', async () => {
    const url = await Plotly.toImage(plotEl, { format: 'svg', height: 600, width: 1000 });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plot.svg';
    a.click();
  });
}
