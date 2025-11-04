import test from 'node:test';
import assert from 'node:assert/strict';

import { createSectionManager } from '../sections/manager.js';

test('section manager initializes with default section', () => {
  const manager = createSectionManager({ defaultSectionId: 'section_all' });
  const root = manager.get('section_all');

  assert.ok(root, 'default section should exist');
  assert.equal(root.name, 'Group 1');
  assert.equal(root.locked, true);
  assert.deepEqual(manager.getOrder(), ['section_all']);
  assert.equal(manager.getMap().size, 1);
});

test('createSection registers hierarchy and order', () => {
  const manager = createSectionManager({ defaultSectionId: 'section_all' });
  const parent = manager.createSection('Parent');
  const child = manager.createSection('Child', { parentId: parent.id });

  assert.ok(manager.has(parent.id));
  assert.ok(manager.has(child.id));
  assert.deepEqual(manager.getOrder().slice(-1), [parent.id]);

  const descendants = manager.collectDescendants(parent.id);
  assert.deepEqual(descendants, [parent.id, child.id]);
  assert.equal(manager.isSectionAncestor(parent.id, child.id), true);
});

test('snapshot and load roundtrip preserves structure', () => {
  const manager = createSectionManager({ defaultSectionId: 'section_all' });
  const section = manager.createSection('Experiment');
  manager.setSectionCollapsed(section.id, true);
  manager.toggleSectionVisibility(section.id);

  const snapshot = manager.snapshot();

  const clone = createSectionManager({ defaultSectionId: 'section_all' });
  clone.load(snapshot);

  assert.deepEqual(clone.snapshot(), snapshot);
  assert.equal(clone.isSectionVisible(section.id), false);
  assert.equal(clone.get(section.id)?.collapsed, true);
});
