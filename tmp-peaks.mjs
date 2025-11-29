import fs from 'fs';
import { findPeaks } from './apps/ftirui/ft/static/ft/js/workspace/canvas/analysis/peakDetection.js';
const csvPath = './apps/ftirui/ft/static/ft/demos/Fe2S2(CO)6.csv';
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const rows = lines.slice(2)
  .map((line) => line.split(',').map(Number))
  .filter((parts) => parts.length === 2 && parts.every((n) => Number.isFinite(n)));
const trace = { id: 'trace', label: 'Fe2S2', x: rows.map(([x]) => x), y: rows.map(([, y]) => y) };
const peaks = findPeaks([trace], {
  sensitivity: 1,
  minDistance: 5,
  target: 'dip',
  applyBaseline: true,
  applySmoothing: false
});
console.log('rows', rows.length, 'peaks', peaks.length);
console.log(peaks.slice(0, 5));
