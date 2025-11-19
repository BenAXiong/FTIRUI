import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const IMAGE_KIND = 'image';
const CURRENT_VERSION = 1;

const normalizeImageContent = (value = {}) => {
  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : 'Image';
  const dataUrl = typeof value?.dataUrl === 'string' ? value.dataUrl : '';
  const description = typeof value?.description === 'string' ? value.description.trim() : '';
  return {
    kind: IMAGE_KIND,
    version: CURRENT_VERSION,
    name,
    dataUrl,
    description
  };
};

registerContentKind(IMAGE_KIND, {
  normalize(value) {
    return normalizeImageContent(value);
  },
  serialize(value) {
    return normalizeImageContent(value);
  }
});

export const imagePanelType = {
  id: 'image',
  label: 'Image',
  capabilities: {
    plot: false
  },
  panelClass: 'workspace-panel--image',
  getDefaultTitle() {
    return 'Image';
  },
  prepareInitialState(incomingState = {}) {
    const existing = incomingState.content;
    return {
      content: normalizeImageContent(existing)
    };
  },
  mountContent({ panelId, panelState = {}, hostEl, selectors = {} }) {
    if (!hostEl) return { plotEl: null };
    hostEl.classList.add('workspace-panel-plot--image');
    hostEl.innerHTML = '';

    const safeGetContent = typeof selectors.getPanelContent === 'function'
      ? selectors.getPanelContent
      : () => null;
    let currentContent = normalizeImageContent(safeGetContent(panelId) ?? panelState.content);

    const wrapper = document.createElement('div');
    wrapper.className = 'workspace-image-panel';

    const imageEl = document.createElement('img');
    imageEl.className = 'workspace-image';
    wrapper.appendChild(imageEl);
    hostEl.appendChild(wrapper);

    const renderContent = (content) => {
      currentContent = normalizeImageContent(content);
      if (currentContent.dataUrl) {
        imageEl.src = currentContent.dataUrl;
        imageEl.alt = currentContent.name || 'Image';
        wrapper.classList.remove('is-empty');
      } else {
        imageEl.removeAttribute('src');
        imageEl.alt = 'No image';
        wrapper.classList.add('is-empty');
      }
    };

    renderContent(currentContent);

    return {
      plotEl: null,
      refreshContent(nextContent) {
        if (!nextContent || typeof nextContent !== 'object') return;
        renderContent(nextContent);
      }
    };
  }
};
