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
    markdownButton
  } = buttons;

  const {
    createPanel = noop
  } = actions;

  add(markdownButton, () => createPanel('markdown', {
    title: 'Markdown note',
    width: 640,
    height: 420
  }));

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
