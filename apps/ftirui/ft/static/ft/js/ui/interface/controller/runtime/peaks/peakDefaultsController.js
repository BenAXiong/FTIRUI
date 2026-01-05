const normalizeLabelStyle = (style = {}) => ({
  bold: style.bold === true,
  italic: style.italic === true,
  underline: style.underline === true,
  strike: style.strike === true
});

const setToggleButtonState = (buttons, key, active) => {
  (buttons || []).forEach((btn) => {
    if (btn.dataset?.peakVisibility !== key) return;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
};

export function createPeakDefaultsController({
  preferences,
  dom,
  labelOptions,
  state,
  setAutoVisibility,
  updateOffsetLabel,
  updateMarkerSizeLabel,
  requestRerun,
  getActivePanel,
  getActiveTechKey,
  notify,
  onApply
} = {}) {
  if (!preferences || !dom || !state || typeof getActiveTechKey !== 'function') return null;
  const listeners = [];

  const buildDisplayDefaults = () => ({
    showMarkers: state.showMarkers,
    showLines: state.showLines,
    showLabels: state.showLabels,
    showAutoMarkers: state.showAutoMarkers,
    markerStyle: state.markerStyle,
    lineStyle: state.lineStyle,
    labelFormat: state.labelFormat,
    offsetAmount: state.offsetAmount,
    markerSize: state.markerSize,
    labelSize: state.labelSize,
    labelBox: state.labelBox,
    labelBoxThickness: state.labelBoxThickness,
    labelAlign: state.labelAlign,
    labelStyle: { ...(state.labelStyle || {}) }
  });

  const applyDisplayDefaults = (display = {}) => {
    if (display.showMarkers !== undefined) {
      state.showMarkers = !!display.showMarkers;
      setToggleButtonState(dom.visibilityButtons, 'markers', state.showMarkers);
    }
    if (display.showLines !== undefined) {
      state.showLines = !!display.showLines;
      setToggleButtonState(dom.visibilityButtons, 'lines', state.showLines);
    }
    if (display.showLabels !== undefined) {
      state.showLabels = !!display.showLabels;
      setToggleButtonState(dom.visibilityButtons, 'labels', state.showLabels);
    }
    if (display.showAutoMarkers !== undefined) {
      setAutoVisibility?.(display.showAutoMarkers);
    }
    if (display.markerStyle && dom.markerButtons?.length) {
      state.markerStyle = display.markerStyle;
      dom.markerButtons.forEach((btn) => {
        const active = btn.dataset.peakMarkerStyle === display.markerStyle;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
    if (display.lineStyle && dom.guideStyleButtons?.length) {
      state.lineStyle = display.lineStyle;
      dom.guideStyleButtons.forEach((btn) => {
        const active = btn.dataset.peakLineStyle === display.lineStyle;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    } else if (dom.lineStyle && typeof display.lineStyle === 'string') {
      dom.lineStyle.value = display.lineStyle;
      state.lineStyle = display.lineStyle;
    }
    if (dom.labelFormatButtons?.length && typeof display.labelFormat === 'string') {
      state.labelFormat = display.labelFormat;
      dom.labelFormatButtons.forEach((btn) => {
        const active = btn.dataset.peakLabelFormat === display.labelFormat;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
    const boxThickness = Number.isFinite(display.labelBoxThickness)
      ? display.labelBoxThickness
      : (display.labelBox ? 1 : 0);
    state.labelBoxThickness = boxThickness;
    state.labelBox = boxThickness > 0;
    if (dom.labelBoxThickness) {
      dom.labelBoxThickness.value = boxThickness;
    }
    if (dom.labelAlignButtons?.length && typeof display.labelAlign === 'string') {
      const align = ['left', 'center', 'right'].includes(display.labelAlign)
        ? display.labelAlign
        : 'center';
      state.labelAlign = align;
      dom.labelAlignButtons.forEach((btn) => {
        const active = btn.dataset.peakLabelAlign === align;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
    if (dom.labelStyleButtons?.length && display.labelStyle && typeof display.labelStyle === 'object') {
      state.labelStyle = normalizeLabelStyle(display.labelStyle);
      dom.labelStyleButtons.forEach((btn) => {
        const key = btn.dataset.peakLabelStyle;
        const active = state.labelStyle[key] === true;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
    state.labelColor = null;
    if (labelOptions?.palette) {
      labelOptions.palette.querySelectorAll('.chip-swatch').forEach((sw) => sw.classList.remove('is-active'));
    }
    if (Number.isFinite(display.labelSize) && dom.labelSize) {
      state.labelSize = display.labelSize;
      dom.labelSize.value = state.labelSize;
    }
    if (Number.isFinite(display.offsetAmount) && dom.offsetAmount) {
      state.offsetAmount = display.offsetAmount;
      dom.offsetAmount.value = state.offsetAmount;
      updateOffsetLabel?.();
    }
    if (Number.isFinite(display.markerSize) && dom.markerSize) {
      state.markerSize = display.markerSize;
      dom.markerSize.value = state.markerSize;
      updateMarkerSizeLabel?.();
    }
  };

  const triggerRerun = () => {
    if (state?.enabled && typeof requestRerun === 'function') {
      requestRerun();
      return;
    }
    if (typeof onApply === 'function') {
      onApply();
    }
  };

  const handleDefaultActionClick = (event) => {
    const action = event?.currentTarget?.dataset?.peakDefaultAction;
    if (!action) return;
    const techKey = getActiveTechKey();
    if (!techKey) return;
    if (action === 'set') {
      const defaults = preferences.readPeakDefaults?.({}) || {};
      defaults[techKey] = buildDisplayDefaults();
      preferences.writePeakDefaults?.(defaults);
      notify?.('Saved peak defaults for this tech.', 'success');
      return;
    }
    if (action === 'apply') {
      const defaults = preferences.readPeakDefaults?.({}) || {};
      const display = defaults?.[techKey];
      if (!display) {
        notify?.('No peak defaults saved for this tech.', 'info');
        return;
      }
      applyDisplayDefaults(display);
      triggerRerun();
      notify?.('Applied peak defaults.', 'success');
    }
  };

  (dom.defaultActionButtons || []).forEach((button) => {
    if (!button || typeof button.addEventListener !== 'function') return;
    const handler = (event) => handleDefaultActionClick(event);
    button.addEventListener('click', handler);
    listeners.push({ button, handler });
  });

  return {
    applyDisplayDefaults,
    buildDisplayDefaults,
    teardown() {
      listeners.forEach(({ button, handler }) => {
        button.removeEventListener('click', handler);
      });
    }
  };
}
