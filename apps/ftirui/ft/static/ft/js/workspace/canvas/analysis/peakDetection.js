const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const ensureArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_SENSITIVITY = 0.65;
const DEFAULT_DISTANCE = 35;
const DEFAULT_BASELINE_WINDOW = 25;
const DEFAULT_SMOOTHING_WINDOW = 7;

export const DEFAULT_PEAK_OPTIONS = {
  sensitivity: DEFAULT_SENSITIVITY,
  minDistance: DEFAULT_DISTANCE,
  smoothingWindow: DEFAULT_SMOOTHING_WINDOW,
  baselineWindow: DEFAULT_BASELINE_WINDOW,
  applyBaseline: false,
  applySmoothing: true
};

const MARKER_STYLE_MAP = {
  dot: { symbol: 'circle', size: 11 },
  triangle: { symbol: 'triangle-up', size: 12 },
  square: { symbol: 'square', size: 11 }
};

const LINE_STYLE_MAP = {
  solid: 'solid',
  dashed: 'dash',
  dotted: 'dot'
};

const LABEL_FORMATTERS = {
  wavenumber: (peak) => `${peak.x.toFixed(2)} cm^-1`,
  'wavenumber-intensity': (peak) => `${peak.x.toFixed(2)} cm^-1 · ${peak.y.toFixed(2)}`,
  'wavenumber-trace': (peak) => `${peak.x.toFixed(2)} cm^-1 · ${peak.traceLabel || 'Trace'}`
};

const normalizeSensitivity = (value) => {
  if (!isFiniteNumber(value)) return DEFAULT_SENSITIVITY;
  if (value > 1) return clamp(value / 100, 0, 1);
  return clamp(value, 0, 1);
};

const normalizeOptions = (options = {}) => ({
  sensitivity: normalizeSensitivity(options.sensitivity ?? DEFAULT_SENSITIVITY),
  minDistance: isFiniteNumber(options.minDistance) ? Math.max(0, options.minDistance) : DEFAULT_DISTANCE,
  smoothingWindow: isFiniteNumber(options.smoothingWindow)
    ? Math.max(1, Math.floor(options.smoothingWindow))
    : DEFAULT_SMOOTHING_WINDOW,
  baselineWindow: isFiniteNumber(options.baselineWindow)
    ? Math.max(1, Math.floor(options.baselineWindow))
    : DEFAULT_BASELINE_WINDOW,
  applyBaseline: options.applyBaseline === true,
  applySmoothing: options.applySmoothing !== false
});

const pairSamples = (trace) => {
  const xs = ensureArray(trace?.x);
  const ys = ensureArray(trace?.y);
  const samples = [];
  const total = Math.min(xs.length, ys.length);
  for (let i = 0; i < total; i += 1) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    samples.push({ x, y, rawY: y });
  }
  return samples;
};

const applyMovingAverage = (samples, windowSize) => {
  const half = Math.max(1, Math.floor(windowSize / 2));
  return samples.map((sample, index) => {
    let acc = 0;
    let count = 0;
    for (let offset = -half; offset <= half; offset += 1) {
      const neighbor = samples[index + offset];
      if (!neighbor) continue;
      acc += neighbor.y;
      count += 1;
    }
    return {
      ...sample,
      y: count > 0 ? acc / count : sample.y
    };
  });
};

const flattenBaseline = (samples, windowSize) => {
  const half = Math.max(1, Math.floor(windowSize / 2));
  return samples.map((sample, index) => {
    let localMin = sample.y;
    for (let offset = -half; offset <= half; offset += 1) {
      const neighbor = samples[index + offset];
      if (!neighbor) continue;
      if (neighbor.y < localMin) {
        localMin = neighbor.y;
      }
    }
    return {
      ...sample,
      baseline: localMin,
      y: sample.y - localMin
    };
  });
};

const estimateProminence = (samples, targetIndex) => {
  const peakY = samples[targetIndex]?.y ?? 0;
  let leftMin = peakY;
  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const value = samples[i].y;
    leftMin = Math.min(leftMin, value);
    if (value > samples[i + 1].y) break;
  }
  let rightMin = peakY;
  for (let i = targetIndex + 1; i < samples.length; i += 1) {
    const value = samples[i].y;
    rightMin = Math.min(rightMin, value);
    if (value > samples[i - 1].y) break;
  }
  const base = Math.max(leftMin, rightMin);
  return {
    prominence: peakY - base,
    leftBase: leftMin,
    rightBase: rightMin
  };
};

const computeRange = (samples) => {
  if (!samples.length) return 0;
  let min = samples[0].y;
  let max = samples[0].y;
  samples.forEach((sample) => {
    if (sample.y < min) min = sample.y;
    if (sample.y > max) max = sample.y;
  });
  return max - min;
};

const detectPeaksInSeries = (samples, trace, options) => {
  if (samples.length < 3) return [];
  const { minDistance, sensitivity } = options;
  const valueRange = computeRange(samples);
  const minProminence = valueRange * (0.15 + (1 - sensitivity) * 0.35);

  const peaks = [];
  let lastAcceptedX = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    if (!(prev.y < curr.y && curr.y >= next.y)) continue;
    const { prominence, leftBase, rightBase } = estimateProminence(samples, i);
    if (!isFiniteNumber(prominence) || prominence <= 0 || prominence < minProminence) continue;
    if ((curr.x - lastAcceptedX) < minDistance) {
      const lastPeak = peaks[peaks.length - 1];
      if (lastPeak && prominence <= lastPeak.prominence) {
        continue;
      }
      peaks.pop();
    }
    peaks.push({
      id: `${trace?.id || 'trace'}-${i}`,
      traceId: trace?.id ?? null,
      traceLabel: trace?.label || trace?.name || trace?.legendgroup || 'Trace',
      color: trace?.line?.color || trace?.marker?.color || trace?.color || null,
      index: i,
      x: curr.x,
      y: curr.rawY ?? curr.y,
      processedY: curr.y,
      prominence,
      leftBase,
      rightBase,
      source: {
        applyBaseline: options.applyBaseline,
        applySmoothing: options.applySmoothing
      }
    });
    lastAcceptedX = curr.x;
  }
  return peaks;
};

export function findPeaks(traces = [], rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const results = [];
  traces.forEach((trace) => {
    let samples = pairSamples(trace);
    if (!samples.length) return;
    if (options.applyBaseline) {
      samples = flattenBaseline(samples, options.baselineWindow);
    }
    if (options.applySmoothing) {
      samples = applyMovingAverage(samples, options.smoothingWindow);
    }
    results.push(...detectPeaksInSeries(samples, trace, options));
  });
  return results;
}

export function buildPeakOverlays(peaks = [], {
  markerStyle = 'dot',
  lineStyle = 'solid',
  labelFormat = 'wavenumber',
  color: overrideColor = null
} = {}) {
  if (!Array.isArray(peaks) || !peaks.length) {
    return {
      markerTrace: null,
      lineShapes: [],
      labelAnnotations: []
    };
  }
  const markerConfig = MARKER_STYLE_MAP[markerStyle] || MARKER_STYLE_MAP.dot;
  const lineDash = LINE_STYLE_MAP[lineStyle] || LINE_STYLE_MAP.solid;
  const formatLabel = LABEL_FORMATTERS[labelFormat] || LABEL_FORMATTERS.wavenumber;

  const markerTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Peaks',
    hovertemplate: 'Peak %{customdata.traceLabel}<br>%{x:.2f} cm^-1<br>Intensity %{y:.2f}<extra></extra>',
    x: peaks.map((peak) => peak.x),
    y: peaks.map((peak) => peak.y),
    marker: {
      size: markerConfig.size,
      symbol: markerConfig.symbol,
      color: overrideColor || peaks[0]?.color || '#e85d04',
      line: { width: 1, color: '#fff' }
    },
    customdata: peaks.map((peak) => ({
      traceLabel: peak.traceLabel,
      prominence: peak.prominence,
      index: peak.index
    }))
  };

  const lineShapes = peaks.map((peak) => ({
    type: 'line',
    x0: peak.x,
    x1: peak.x,
    y0: peak.leftBase ?? 0,
    y1: peak.y,
    line: {
      color: overrideColor || peak.color || '#e85d04',
      dash: lineDash,
      width: 1
    }
  }));

  const labelAnnotations = peaks.map((peak) => ({
    x: peak.x,
    y: peak.y,
    text: formatLabel(peak),
    showarrow: false,
    font: {
      size: 11,
      color: '#0f172a',
      family: 'inherit'
    },
    bgcolor: 'rgba(255,255,255,.9)',
    bordercolor: 'rgba(15,23,42,.15)',
    borderpad: 2,
    ay: -10
  }));

  return {
    markerTrace,
    lineShapes,
    labelAnnotations
  };
}

export function buildPeakTableRows(peaks = [], { includeTrace = true } = {}) {
  if (!Array.isArray(peaks) || !peaks.length) return [];
  return peaks.map((peak, idx) => ({
    rowIndex: idx + 1,
    peakIndex: peak.index,
    wavenumber: peak.x,
    intensity: peak.y,
    prominence: peak.prominence,
    traceLabel: includeTrace ? peak.traceLabel : undefined,
    traceId: includeTrace ? peak.traceId : undefined,
    detectionMeta: peak.source
  }));
}
