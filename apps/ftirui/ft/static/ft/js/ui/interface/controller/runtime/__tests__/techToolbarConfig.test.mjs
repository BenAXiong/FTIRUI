import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TECH_FEATURES,
  resolveTechFeatureSet
} from '../toolbar/techToolbarConfig.js';

const makeOption = ({ key, label, symbol }) => ({
  getAttribute: (name) => {
    if (name === 'data-tech-option') return key;
    if (name === 'data-tech-label') return label;
    if (name === 'data-tech-symbol') return symbol;
    return null;
  }
});

test('resolveTechFeatureSet returns default features for FTIR', () => {
  const techOptions = [makeOption({ key: 'ftir', label: 'FT-IR', symbol: 'FT' })];
  const features = resolveTechFeatureSet({ techKey: 'ftir', techOptions });
  assert.equal(features, DEFAULT_TECH_FEATURES);
});

test('resolveTechFeatureSet returns disabled placeholders for non-default tech', () => {
  const techOptions = [makeOption({ key: 'xrd', label: 'XRD', symbol: 'XRD' })];
  const features = resolveTechFeatureSet({ techKey: 'xrd', techOptions });
  assert.equal(features[3].label, 'XRD3');
  assert.equal(features[3].display, 'badge');
  assert.equal(features[3].disabled, true);
  assert.equal(features[3].isPlaceholder, true);
});
