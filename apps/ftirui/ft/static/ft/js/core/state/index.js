const ROOT_FOLDER_ID = 'folder_root';
const COLOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
  '#bcbd22', '#17becf'
];

export function createState() {
  return {
    traces: {},
    order: [],
    folders: {
      [ROOT_FOLDER_ID]: {
        id: ROOT_FOLDER_ID,
        name: 'All Traces',
        parent: null,
        folders: [],
        traces: [],
        collapsed: false
      }
    },
    folderOrder: [ROOT_FOLDER_ID],
    ui: {
      activeFolder: ROOT_FOLDER_ID
    },
    global: {
      normalize: 'off',
      xinvert: true,
      hovermode: 'x',
      inputAuto: true,
      inputMode: 'tr',
      units: 'fraction'
    },
    history: [],
    future: []
  };
}

export function rootFolderId() {
  return ROOT_FOLDER_ID;
}

export function newId() {
  return 't_' + Math.random().toString(36).slice(2, 9);
}

export function newFolderId() {
  return 'f_' + Math.random().toString(36).slice(2, 9);
}

export function nextColor(idx) {
  return COLOR_PALETTE[idx % COLOR_PALETTE.length];
}

export function palette() {
  return COLOR_PALETTE.slice();
}
