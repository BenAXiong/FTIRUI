export function buildData(state) {
  const out = [];
  state.order.forEach((id) => {
    const trace = state.traces[id];
    if (!trace?.visible) return;

    const xValues = state.global.xinvert ? [...trace.data.x].reverse() : trace.data.x;
    const yValues = trace.data.y;

    out.push({
      type: 'scatter',
      mode: 'lines',
      name: trace.name,
      x: xValues,
      y: yValues,
      line: { color: trace.color, width: trace.width || 2, dash: trace.dash },
      opacity: trace.opacity
    });
  });
  return out;
}

export function buildLayout(state) {
  const unitsKey = state.global.units || 'fraction';
  const yAxisTitle = unitsKey === 'absorbance'
    ? 'Absorbance (A)'
    : unitsKey === 'percent'
      ? 'Transmittance (%)'
      : 'Transmittance';

  return {
    hovermode: state.global.hovermode,
    xaxis: { autorange: state.global.xinvert ? 'reversed' : true, showgrid: true },
    yaxis: { showgrid: true, zeroline: true, title: { text: yAxisTitle } },
    legend: { orientation: 'h' },
    margin: { l: 50, r: 15, t: 20, b: 40 }
  };
}

export function render(instance) {
  Plotly.react(
    instance.dom.plot,
    buildData(instance.state),
    buildLayout(instance.state),
    { responsive: true, displaylogo: false }
  );
}
