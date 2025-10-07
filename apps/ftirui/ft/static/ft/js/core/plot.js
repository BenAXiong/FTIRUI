export function buildData(state) {
  const out = [];
  state.order.forEach(id => {
    const t = state.traces[id];
    if (!t.visible) return;
    const x = state.global.xinvert ? [...t.data.x].reverse() : t.data.x;
    const y = t.data.y; // normalization later
    out.push({
      type: 'scatter', mode: 'lines', name: t.name,
      x, y,
      line: { color: t.color, width: 2, dash: t.dash },
      opacity: t.opacity
    });
  });
  return out;
}

export function buildLayout(state) {
  return {
    hovermode: state.global.hovermode,
    xaxis: { autorange: state.global.xinvert ? 'reversed' : true, showgrid: true },
    yaxis: { showgrid: true, zeroline: true },
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
