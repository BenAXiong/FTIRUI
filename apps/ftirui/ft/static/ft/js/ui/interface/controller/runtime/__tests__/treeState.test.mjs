import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserTreeState } from '../browser/treeState.js';

const buildSections = () => {
  const map = new Map();
  map.set('section_all', {
    id: 'section_all',
    name: 'All',
    collapsed: false,
    locked: true,
    parentId: null
  });
  map.set('section_a', {
    id: 'section_a',
    name: 'Group A',
    collapsed: false,
    locked: false,
    parentId: null
  });
  map.set('section_b', {
    id: 'section_b',
    name: 'Group B',
    collapsed: true,
    locked: false,
    parentId: null
  });
  return map;
};

test('createBrowserTreeState sorts panels by index and falls back to order', () => {
  const sections = buildSections();
  const state = createBrowserTreeState({
    searchTerm: '',
    sections,
    sectionOrder: ['section_all', 'section_a', 'section_b'],
    defaultSectionId: 'section_all',
    getPanelsOrdered: () => ([
      { id: 'p1', sectionId: 'section_a', index: 5 },
      { id: 'p2', sectionId: 'section_a' },
      { id: 'p3', sectionId: 'section_b', index: 2 }
    ]),
    coerceNumber: Number
  });

  assert.equal(state.hasPanels, true);
  assert.deepEqual(
    state.sortedPanels.map((p) => p.panelId),
    ['p2', 'p3', 'p1'],
    'panels should be ordered by explicit index (including zero) then position'
  );
  assert.deepEqual(
    state.panelsBySection.get('section_a').map((p) => p.panelId),
    ['p2', 'p1'],
    'panels should be grouped by section while preserving sorted order'
  );
});

test('createBrowserTreeState normalises search term casing', () => {
  const state = createBrowserTreeState({
    searchTerm: '  Spectra ',
    sections: buildSections(),
    sectionOrder: ['section_all'],
    defaultSectionId: 'section_all',
    getPanelsOrdered: () => [],
    coerceNumber: Number
  });

  assert.equal(state.term, 'spectra');
  assert.equal(state.searchTerm, '  Spectra ');
});
