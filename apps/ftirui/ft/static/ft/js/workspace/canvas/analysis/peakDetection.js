const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const ensureArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_SENSITIVITY = 0.65;
const DEFAULT_DISTANCE = 35;
const DEFAULT_BASELINE_WINDOW = 25;
const DEFAULT_SMOOTHING_WINDOW = 7;
const DEFAULT_BAND_WINDOW = 30; // cm-1 window for band picking

export const DEFAULT_PEAK_OPTIONS = {
  sensitivity: DEFAULT_SENSITIVITY,
  minDistance: DEFAULT_DISTANCE,
  smoothingWindow: DEFAULT_SMOOTHING_WINDOW,
  baselineWindow: DEFAULT_BASELINE_WINDOW,
  applyBaseline: false,
  applySmoothing: true,
  target: 'dip',
  bandWindow: DEFAULT_BAND_WINDOW
};

const MARKER_STYLE_MAP = {
  dot: { symbol: 'circle', size: 11 },
  triangle: { symbol: 'triangle-up', size: 12 },
  'triangle-down': { symbol: 'triangle-down', size: 12 },
  square: { symbol: 'square', size: 11 },
  cross: { symbol: 'x', size: 13 },
  slit: { symbol: 'line-ns-open', size: 28 },
  // Arrowheads (inverted: default points down for peaks; alt points up for dips)
  chevron: { symbol: 'arrow-down', altSymbol: 'arrow-up', size: 14 }
};

const LINE_STYLE_MAP = {
  solid: 'solid',
  dashed: 'dash',
  dotted: 'dot'
};

const LABEL_FORMATTERS = {
  wavenumber: (peak) => `${peak.x.toFixed(1)} cm^-1`,
  'wavenumber-intensity': (peak) => `${peak.x.toFixed(1)} cm^-1 · ${peak.y.toFixed(1)}`,
  'wavenumber-trace': (peak) => `${peak.x.toFixed(1)} cm^-1 · ${peak.traceLabel || 'Trace'}`,
  'peak-index': (peak) => {
    const idx = Number.isFinite(peak.displayIndex) ? peak.displayIndex : (Number.isFinite(peak.index) ? peak.index + 1 : '');
    return idx ? `${idx}` : '';
  },
  'index-wavenumber': (peak) => {
    const idx = Number.isFinite(peak.displayIndex) ? peak.displayIndex : (Number.isFinite(peak.index) ? peak.index + 1 : '');
    const prefix = idx ? `${idx}. ` : '';
    return `${prefix}${peak.x.toFixed(1)}`;
  }
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
  applySmoothing: options.applySmoothing !== false,
  target: typeof options.target === 'string' ? options.target : DEFAULT_PEAK_OPTIONS.target,
  bandWindow: isFiniteNumber(options.bandWindow)
    ? Math.max(1, options.bandWindow)
    : DEFAULT_BAND_WINDOW
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

const flattenBaseline = (samples, windowSize, { reference = 'min' } = {}) => {
  const half = Math.max(1, Math.floor(windowSize / 2));
  const useMax = reference === 'max';
  return samples.map((sample, index) => {
    let pivot = sample.y;
    for (let offset = -half; offset <= half; offset += 1) {
      const neighbor = samples[index + offset];
      if (!neighbor) continue;
      if (useMax ? neighbor.y > pivot : neighbor.y < pivot) {
        pivot = neighbor.y;
      }
    }
    return {
      ...sample,
      baseline: pivot,
      y: useMax ? pivot - sample.y : sample.y - pivot
    };
  });
};

const estimateProminence = (values, targetIndex) => {
  const peakValue = values[targetIndex] ?? 0;
  let leftValue = peakValue;
  let leftIndex = targetIndex;
  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const current = values[i];
    if (current > values[i + 1]) break;
    if (current < leftValue) {
      leftValue = current;
      leftIndex = i;
    }
  }
  let rightValue = peakValue;
  let rightIndex = targetIndex;
  for (let i = targetIndex + 1; i < values.length; i += 1) {
    const current = values[i];
    if (current > values[i - 1]) break;
    if (current < rightValue) {
      rightValue = current;
      rightIndex = i;
    }
  }
  const base = Math.max(leftValue, rightValue);
  return {
    prominence: peakValue - base,
    leftIndex,
    rightIndex
  };
};

const computeRange = (values) => {
  const list = ensureArray(values);
  if (!list.length) return 0;
  let min = list[0];
  let max = list[0];
  list.forEach((value) => {
    if (value < min) min = value;
    if (value > max) max = value;
  });
  return max - min;
};

const computeDataRange = (traces = [], axisKey = 'y') => {
  const values = [];
  traces.forEach((trace) => {
    const series = ensureArray(trace?.[axisKey]);
    series.forEach((value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        values.push(numeric);
      }
    });
  });
  if (!values.length) return null;
  let min = values[0];
  let max = values[0];
  values.forEach((value) => {
    if (value < min) min = value;
    if (value > max) max = value;
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    const delta = Math.abs(min) || 1;
    return [min - delta * 0.05, max + delta * 0.05];
  }
  return [min, max];
};

const detectPeaksInSeries = (samples, detectionValues, trace, options, { polarity = 'peak' } = {}) => {
  if (samples.length < 3) return [];
  const baseValues = Array.isArray(detectionValues) && detectionValues.length === samples.length
    ? detectionValues
    : samples.map((sample) => sample.y);
  const baseMax = Math.max(...baseValues);
  const values = polarity === 'dip'
    ? baseValues.map((value) => baseMax - value)
    : baseValues.slice();
  const { sensitivity } = options;
  const valueRange = computeRange(values);
  // Lower floor for high sensitivity to capture smaller features without over-triggering.
  // Make low sensitivity more aggressive by steepening the slope on (1 - sensitivity).
  const minProminence = valueRange * (0.003 + (1 - sensitivity) * 0.35);
  const effectiveMinDistance = Math.max(0, options.minDistance ?? 0);

  const peaks = [];
  let lastAcceptedX = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    const next = values[i + 1];
    if (!(prev < curr && curr >= next)) continue;
    const { prominence, leftIndex, rightIndex } = estimateProminence(values, i);
    if (!isFiniteNumber(prominence) || prominence <= 0 || prominence < minProminence) continue;
    const currentX = samples[i].x;
    if (Math.abs(currentX - lastAcceptedX) < effectiveMinDistance) {
      const lastPeak = peaks[peaks.length - 1];
      if (lastPeak && prominence <= lastPeak.prominence) {
        continue;
      }
      peaks.pop();
    }
    const leftBase = samples[leftIndex]?.rawY ?? samples[i].rawY;
    const rightBase = samples[rightIndex]?.rawY ?? samples[i].rawY;
    peaks.push({
      id: `${trace?.id || 'trace'}-${polarity}-${i}`,
      traceId: trace?.id ?? null,
      traceLabel: trace?.label || trace?.name || trace?.legendgroup || 'Trace',
      color: trace?.line?.color || trace?.marker?.color || trace?.color || null,
      index: i,
      x: currentX,
      y: samples[i].rawY ?? samples[i].y,
      processedY: samples[i].y,
      prominence,
      leftBase,
      rightBase,
      direction: polarity === 'dip' ? 'dip' : 'peak',
      source: {
        applyBaseline: options.applyBaseline,
        applySmoothing: options.applySmoothing
      }
    });
    lastAcceptedX = currentX;
  }
  return peaks;
};

const scorePeaks = (peaks) => peaks.reduce((sum, peak) => sum + Math.max(0, Number(peak?.prominence) || 0), 0);

const choosePeakSet = (primary, secondary) => {
  if (!secondary.length) return primary;
  if (!primary.length) return secondary;
  if (secondary.length > primary.length) return secondary;
  if (primary.length > secondary.length) return primary;
  const primaryScore = scorePeaks(primary);
  const secondaryScore = scorePeaks(secondary);
  if (secondaryScore > primaryScore) return secondary;
  return primary;
};

const dedupeByDistance = (points, minDistance) => {
  const deduped = [];
  points
    .slice()
    .sort((a, b) => a.x - b.x)
    .forEach((peak) => {
      const tooClose = deduped.some((p) => Math.abs(p.x - peak.x) < minDistance);
      if (!tooClose) {
        deduped.push(peak);
      }
    });
  return deduped;
};

const pickBandsFromPeaks = (peaks, { windowSize, minDistance = 0 } = {}) => {
  if (!Array.isArray(peaks) || peaks.length === 0) return [];

  const sorted = peaks.slice().sort((a, b) => a.x - b.x);
  const grouped = [];
  let windowStart = sorted[0].x;
  let bucket = [];

  sorted.forEach((peak) => {
    if (bucket.length === 0) {
      bucket.push(peak);
      return;
    }
    const withinWindow = (peak.x - windowStart) <= windowSize;
    if (withinWindow) {
      bucket.push(peak);
    } else {
      grouped.push(bucket);
      bucket = [peak];
      windowStart = peak.x;
    }
  });
  if (bucket.length) grouped.push(bucket);

  const windowPicks = grouped.map((group) => group.reduce(
    (best, candidate) => {
      if (!best) return candidate;
      const bestProm = Number(best.prominence) || 0;
      const candProm = Number(candidate.prominence) || 0;
      if (candProm > bestProm) return candidate;
      if (candProm === bestProm && candidate.x < best.x) return candidate;
      return best;
    },
    null
  ));

  return dedupeByDistance(
    windowPicks.map((peak) => ({
      ...peak,
      source: { ...(peak.source || {}), bandPicked: true, window: windowSize }
    })),
    minDistance
  );
};

export function findPeaks(traces = [], rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const results = [];
  traces.forEach((trace) => {
    const prepareSamples = (mode) => {
      let prepared = pairSamples(trace);
      if (!prepared.length) return prepared;
      if (options.applyBaseline) {
        prepared = flattenBaseline(prepared, options.baselineWindow, {
          reference: mode === 'dip' ? 'max' : 'min'
        });
      }
      if (options.applySmoothing) {
        prepared = applyMovingAverage(prepared, options.smoothingWindow);
      }
      return prepared;
    };

    const peakSamples = prepareSamples('peak');
    const dipSamples = prepareSamples('dip');
    if (!peakSamples.length || !dipSamples.length) return;

    const maxima = detectPeaksInSeries(
      peakSamples,
      peakSamples.map((sample) => sample.y),
      trace,
      options,
      { polarity: 'peak' }
    );
    const minima = detectPeaksInSeries(
      dipSamples,
      dipSamples.map((sample) => sample.y),
      trace,
      options,
      { polarity: 'dip' }
    );
    let chosen = minima;
    if (options.target === 'peak') {
      chosen = maxima;
    } else if (options.target === 'auto') {
      chosen = choosePeakSet(maxima, minima);
    }
    const baseCandidates = chosen.length ? chosen : [...maxima, ...minima];
    const bandCandidates = pickBandsFromPeaks(
      baseCandidates,
      {
        windowSize: options.bandWindow,
        minDistance: options.minDistance
      }
    );

    const merged = options.target === 'band' && bandCandidates.length ? bandCandidates : baseCandidates;
    const deduped = dedupeByDistance(merged, options.minDistance);
    const sorted = deduped.slice().sort((a, b) => (b?.prominence || 0) - (a?.prominence || 0));
    results.push(...sorted);
  });
  return results;
}

export function buildPeakOverlays(peaks = [], {
  markerStyle = 'dot',
  lineStyle = 'solid',
  labelFormat = 'wavenumber',
  color: overrideColor = null,
  yMin = null,
  offsetAmount = 0,
  markerSize = null,
  detectionTarget = null,
  labelColor = null,
  labelSize = null,
  labelBox = false,
  labelBoxThickness = 1,
  labelAlign = 'center',
  labelStyle = {}
} = {}) {
  const safePeaks = Array.isArray(peaks) ? peaks.slice() : [];
  // Sort peaks by descending wavenumber for consistent numbering/labels.
  safePeaks.sort((a, b) => (Number(b?.x) || 0) - (Number(a?.x) || 0));
  safePeaks.forEach((peak, idx) => {
    peak.displayIndex = idx + 1;
  });
  const markerConfig = MARKER_STYLE_MAP[markerStyle] || MARKER_STYLE_MAP.dot;
  const lineDash = LINE_STYLE_MAP[lineStyle] || LINE_STYLE_MAP.solid;
  const formatLabel = LABEL_FORMATTERS[labelFormat] || LABEL_FORMATTERS.wavenumber;

  const resolveBaseline = (peak) => {
    if (peak.direction === 'dip') {
      if (Number.isFinite(yMin)) {
        return yMin;
      }
      return peak.y;
    }
    const left = isFiniteNumber(peak.leftBase) ? peak.leftBase : peak.y;
    const right = isFiniteNumber(peak.rightBase) ? peak.rightBase : peak.y;
    return Math.min(left, right);
  };

  const computeMarkerY = (peak) => {
    if (!offsetAmount || offsetAmount <= 0) return peak.y;
    const baseline = resolveBaseline(peak);
    const span = Math.max(Math.abs(peak.y - baseline), 1);
    const shift = span * (offsetAmount / 400); // 100% now represents one-quarter of the span to baseline
    const direction = -1; // always shift downward; dips now move down instead of up
    const target = peak.y + direction * shift;
    const minY = Math.min(peak.y, baseline);
    const maxY = Math.max(peak.y, baseline);
    const clamped = Math.min(maxY, Math.max(minY, target));
    return clamped;
  };

  const markerSymbols = safePeaks.map((peak) => {
    const isDip = peak.direction === 'dip';
    const orientation = detectionTarget === 'peak' || detectionTarget === 'dip'
      ? detectionTarget
      : (isDip ? 'dip' : 'peak');
    if (markerConfig.altSymbol && markerStyle === 'chevron') {
      return orientation === 'dip' ? markerConfig.altSymbol : markerConfig.symbol;
    }
    return markerConfig.symbol || 'circle';
  });

  const markerSymbolValue = markerSymbols.length && markerSymbols.every((symbol) => symbol === markerSymbols[0])
    ? markerSymbols[0]
    : markerSymbols;

  const markerTrace = safePeaks.length ? {
    type: 'scatter',
    mode: 'markers',
    name: 'Peaks',
    showlegend: false,
    hoverinfo: 'skip',
    x: safePeaks.map((peak) => peak.x),
    y: safePeaks.map((peak) => computeMarkerY(peak)),
    marker: {
      size: markerSize ?? markerConfig.size,
      symbol: markerSymbolValue,
      color: overrideColor || safePeaks[0]?.color || '#e85d04',
      line: { width: markerStyle === 'slit' ? 1.5 : 1, color: '#fff' }
    },
    meta: { peakOverlay: true, peakOverlayType: 'marker' },
    customdata: safePeaks.map((peak) => ({
      id: peak.id,
      traceLabel: peak.traceLabel,
      prominence: peak.prominence,
      index: peak.displayIndex ?? peak.index,
      kind: peak.direction === 'dip' ? 'Dip' : 'Peak'
    }))
  } : null;

  const lineShapes = safePeaks.map((peak) => {
    const baseline = resolveBaseline(peak);
    return {
      type: 'line',
      x0: peak.x,
      x1: peak.x,
      y0: baseline,
      y1: peak.y,
      line: {
        color: overrideColor || peak.color || '#e85d04',
        dash: lineDash,
        width: 1
      },
      meta: { peakOverlay: true, peakOverlayType: 'guide' }
    };
  });

  const labelAnnotations = safePeaks.map((peak) => {
    const alignLeft = labelAlign === 'left';
    const alignRight = labelAlign === 'right';
    const alignCenter = !alignLeft && !alignRight;
    const xshift = alignLeft ? -10 : alignRight ? 10 : 0;
    // Anchor/align so "left" truly places text to the left of the marker, and vice versa.
    const textAlign = alignLeft ? 'right' : alignRight ? 'left' : 'center';
    const anchor = alignLeft ? 'right' : alignRight ? 'left' : 'center';
    const fontSize = Math.max(8, labelSize ?? 11);
    const pad = labelBox ? Math.max(4, Math.round(fontSize * 0.55)) : Math.max(3, Math.round(fontSize * 0.45));
    const markerY = computeMarkerY(peak);
    const gap = Math.max(6, Math.round(fontSize * 0.8));
    const labelY = markerY;
    // Keep center above marker; left/right sit inline, and lift when boxed to avoid covering the marker.
    const boxLift = labelBox ? Math.max(3, Math.round(fontSize * 0.35)) : 0;
    const yshift = alignCenter ? -(gap + boxLift * 3) : -(boxLift * 3);
    const styledText = (() => {
      let txt = formatLabel(peak);
      const style = typeof labelStyle === 'object' && labelStyle ? labelStyle : {};
      if (style.bold) txt = `<b>${txt}</b>`;
      if (style.italic) txt = `<i>${txt}</i>`;
      if (style.underline) txt = `<u>${txt}</u>`;
      if (style.strike) txt = `<s>${txt}</s>`;
      return txt;
    })();
    return {
      x: peak.x,
      y: labelY,
      text: `\u00a0${styledText}\u00a0`,
      showarrow: false,
      font: {
        size: fontSize,
        color: labelColor || peak.color || '#0f172a',
        family: 'inherit'
      },
      bgcolor: labelBox ? 'rgba(255,255,255,.9)' : 'transparent',
      bordercolor: labelBox ? (labelColor || peak.color || 'rgba(15,23,42,.35)') : 'transparent',
      borderpad: pad,
      borderwidth: labelBox ? Math.max(0, Number(labelBoxThickness) || 1) : 0,
    yshift,
    xshift,
    align: textAlign,
    xanchor: anchor,
    meta: { peakOverlay: true, peakOverlayType: 'label' }
    };
  });

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
     direction: peak.direction,
    detectionMeta: peak.source
  }));
}
