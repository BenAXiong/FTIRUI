import { describe, expect, it } from 'vitest';

import {
  findPeaks,
  buildPeakOverlays,
  buildPeakTableRows,
  DEFAULT_PEAK_OPTIONS
} from '../../../../apps/ftirui/ft/static/ft/js/workspace/canvas/analysis/peakDetection.js';

const sampleTrace = {
  id: 'trace-1',
  label: 'Sample',
  x: [0, 1, 2, 3, 4, 5, 6, 7],
  y: [0, 2, 5, 1, 0, 1, 4, 1],
  line: { color: '#ff0000' }
};

describe('peakDetection findPeaks', () => {
  it('detects local maxima respecting min distance', () => {
    const peaks = findPeaks([sampleTrace], {
      sensitivity: 0.55,
      minDistance: 1,
      applyBaseline: false,
      applySmoothing: false,
      target: 'peak'
    });
    expect(peaks).toHaveLength(2);
    expect(peaks[0].x).toBeCloseTo(2);
    expect(peaks[0].y).toBeCloseTo(5);
    expect(peaks[1].x).toBeCloseTo(6);
    expect(peaks[1].traceLabel).toBe('Sample');
  });

  it('applies baseline flattening before detection', () => {
    const slopedTrace = {
      id: 'trace-2',
      label: 'Slope',
      x: [0, 1, 2, 3, 4, 5],
      y: [0, 1.2, 0.4, 2.8, 0.6, 0.2]
    };
    const peaks = findPeaks([slopedTrace], {
      ...DEFAULT_PEAK_OPTIONS,
      sensitivity: 0.4,
      applyBaseline: true,
      applySmoothing: false,
      minDistance: 0.5,
      target: 'peak'
    });
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks[0].x).toBeCloseTo(3);
    expect(peaks[0].source.applyBaseline).toBe(true);
    expect(peaks[0].source.applySmoothing).toBe(false);
  });
});

describe('peakDetection formatters', () => {
  const mockPeaks = [
    {
      id: 'p-1',
      traceId: 't1',
      traceLabel: 'Sample',
      x: 123.456,
      y: 0.98,
      prominence: 0.75,
      index: 10,
      leftBase: 0.1,
      rightBase: 0.2,
      color: '#123456',
      source: { applyBaseline: true, applySmoothing: true }
    }
  ];

  it('creates overlay payloads', () => {
    const overlays = buildPeakOverlays(mockPeaks, {
      markerStyle: 'triangle',
      lineStyle: 'dotted',
      labelFormat: 'wavenumber-intensity',
      color: '#abcdef'
    });
    expect(overlays.markerTrace).toBeTruthy();
    expect(overlays.markerTrace.marker.symbol).toBe('triangle-up');
    expect(overlays.lineShapes[0].line.dash).toBe('dot');
    expect(overlays.labelAnnotations[0].text).toContain('cm^-1');
  });

  it('creates spreadsheet rows with metadata', () => {
    const rows = buildPeakTableRows(mockPeaks);
    expect(rows).toHaveLength(1);
    expect(rows[0].wavenumber).toBeCloseTo(123.456);
    expect(rows[0].traceLabel).toBe('Sample');
    expect(rows[0].detectionMeta.applyBaseline).toBe(true);
  });
});
