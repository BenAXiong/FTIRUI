const noop = () => {};

const preventDefault = (handler) => (event) => {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  handler(event);
};

export function createGlobalCommandsController({
  buttons = {},
  actions = {}
} = {}) {
  const listeners = [];
  const add = (node, handler) => {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    const wrapped = preventDefault(handler);
    node.addEventListener('click', wrapped);
    listeners.push({ node, wrapped });
  };

  const {
    markdownButton,
    sheetButton,
    imageBrowseButton,
    imageDriveButton,
    imageLinkButton
  } = buttons;

  const {
    createPanel = noop,
    openImagePicker = noop,
    importImageFromDrive = noop,
    promptImageUrl = noop
  } = actions;

  add(markdownButton, () => createPanel('markdown', {
    title: 'Markdown note',
    width: 640,
    height: 420
  }));
  add(sheetButton, () => createPanel('spreadsheet', {
    title: 'Spreadsheet',
    width: 880,
    height: 520
  }));
  add(imageBrowseButton, () => openImagePicker());
  add(imageDriveButton, () => importImageFromDrive());
  add(imageLinkButton, () => promptImageUrl());

  const dispose = () => {
    listeners.splice(0).forEach(({ node, wrapped }) => {
      if (node && typeof node.removeEventListener === 'function') {
        node.removeEventListener('click', wrapped);
      }
    });
  };

  return {
    dispose
  };
}
