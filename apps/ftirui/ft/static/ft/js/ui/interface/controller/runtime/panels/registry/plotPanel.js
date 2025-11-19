export const plotPanelType = {
  id: 'plot',
  label: 'Graph',
  isDefault: true,
  capabilities: {
    plot: true
  },
  getDefaultTitle(index) {
    return index ? `Graph ${index}` : 'Graph';
  },
  prepareInitialState(incomingState = {}, { defaultLayout, deepClone }) {
    const figure = incomingState.figure
      ? deepClone(incomingState.figure)
      : {
        data: [],
        layout: typeof defaultLayout === 'function'
          ? defaultLayout(incomingState.figurePayload || {})
          : {}
      };
    return {
      figure
    };
  },
  mountContent({ hostEl }) {
    hostEl.classList.add('workspace-panel-plot');
    return {
      plotEl: hostEl
    };
  }
};
