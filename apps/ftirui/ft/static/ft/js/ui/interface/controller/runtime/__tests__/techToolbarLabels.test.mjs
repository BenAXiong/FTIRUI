import test from 'node:test';
import assert from 'node:assert/strict';

import { createTechToolbarLabelController } from '../toolbar/techToolbarLabels.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...classes) => classes.forEach((cls) => set.add(cls)),
    remove: (...classes) => classes.forEach((cls) => set.delete(cls)),
    contains: (cls) => set.has(cls),
    toggle: (cls, force) => {
      const wants = typeof force === 'boolean' ? force : !set.has(cls);
      if (wants) {
        set.add(cls);
      } else {
        set.delete(cls);
      }
      return wants;
    },
    forEach: (fn) => {
      set.forEach(fn);
    },
    reset: (value = '') => {
      set.clear();
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => set.add(cls));
    },
    toString: () => Array.from(set).join(' ')
  };
};

const createElement = (tagName = 'div') => {
  const classList = createClassList();
  const attributes = {};
  const element = {
    tagName,
    children: [],
    parentNode: null,
    dataset: {},
    classList,
    hidden: false,
    disabled: false,
    textContent: '',
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    prepend(child) {
      child.parentNode = element;
      element.children.unshift(child);
      return child;
    },
    after(child) {
      if (!element.parentNode) return;
      const idx = element.parentNode.children.indexOf(element);
      if (idx < 0) return;
      child.parentNode = element.parentNode;
      element.parentNode.children.splice(idx + 1, 0, child);
    },
    querySelector(selector) {
      const match = (node) => {
        if (!node) return false;
        if (selector === '.visually-hidden') {
          return node.classList.contains('visually-hidden');
        }
        if (selector === '[data-tech-original-icon]') {
          return node.dataset.techOriginalIcon === 'true';
        }
        if (selector === '[data-tech-badge]') {
          return node.dataset.techBadge === 'true';
        }
        if (selector === '.workspace-toolbar-icon:not(.workspace-toolbar-tech-badge)') {
          return node.classList.contains('workspace-toolbar-icon')
            && !node.classList.contains('workspace-toolbar-tech-badge');
        }
        return false;
      };
      const stack = [...element.children];
      while (stack.length) {
        const node = stack.shift();
        if (match(node)) return node;
        if (node?.children?.length) {
          stack.push(...node.children);
        }
      }
      return null;
    },
    addEventListener() {},
    removeEventListener() {}
  };

  Object.defineProperty(element, 'className', {
    get() {
      return classList.toString();
    },
    set(value) {
      classList.reset(value);
    }
  });

  return element;
};

const makeOption = ({ key, label, symbol }) => ({
  getAttribute: (name) => {
    if (name === 'data-tech-option') return key;
    if (name === 'data-tech-label') return label;
    if (name === 'data-tech-symbol') return symbol;
    return null;
  }
});

test('createTechToolbarLabelController swaps icons to badge labels for non-default tech', () => {
  const previousDocument = global.document;
  global.document = { createElement };
  const techToggle = createElement('button');
  techToggle.dataset.techKey = 'xrd';

  const button = createElement('button');
  button.setAttribute('title', 'Toggle peak marking');
  button.setAttribute('aria-label', 'Toggle peak marking');
  const icon = createElement('i');
  icon.className = 'workspace-toolbar-icon bi bi-bullseye';
  const hidden = createElement('span');
  hidden.className = 'visually-hidden';
  hidden.textContent = 'Toggle peak marking';
  button.appendChild(icon);
  button.appendChild(hidden);

  const controller = createTechToolbarLabelController({
    techToggle,
    techOptions: [makeOption({ key: 'xrd', label: 'XRD', symbol: 'XRD' })],
    buttons: [{ node: button, slot: 3 }],
    defaultTech: 'ftir'
  });

  const badge = button.querySelector('[data-tech-badge]');
  assert.equal(button.disabled, true);
  assert.equal(icon.hidden, true);
  assert.equal(badge.textContent, 'XRD3');

  controller.updateToolbar('ftir');
  assert.equal(button.disabled, false);
  assert.equal(icon.hidden, false);
  assert.equal(badge.hidden, true);
  assert.equal(button.getAttribute('title'), 'Toggle peak marking');
  global.document = previousDocument;
});
