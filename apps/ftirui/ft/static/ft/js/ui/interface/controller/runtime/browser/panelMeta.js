const NON_PLOT_PANEL_INFO = {
  markdown: {
    label: 'Markdown note',
    icon: 'bi-markdown'
  },
  spreadsheet: {
    label: 'Spreadsheet',
    icon: 'bi-table'
  },
  script: {
    label: 'Script notebook',
    icon: 'bi-journal-code'
  },
  image: {
    label: 'Image panel',
    icon: 'bi-images'
  }
};

export function getNonPlotPanelInfo(typeId) {
  if (!typeId) return null;
  return NON_PLOT_PANEL_INFO[typeId] || null;
}

export function resolvePanelDisplayTitle({
  recordTitle = '',
  index = 0,
  panelType = null,
  isPlotPanel = true
} = {}) {
  const normalizedTitle = typeof recordTitle === 'string' ? recordTitle.trim() : '';
  if (normalizedTitle) {
    return normalizedTitle;
  }
  if (isPlotPanel !== false) {
    return index ? `Graph ${index}` : 'Graph';
  }
  const info = getNonPlotPanelInfo(panelType);
  if (info?.label) {
    return info.label;
  }
  return index ? `Panel ${index}` : 'Panel';
}
