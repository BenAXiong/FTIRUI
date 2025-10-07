export function createState() {
  return {
    traces: {},          // id -> meta
    order: [],           // trace ordering
    global: {
      normalize: 'off',
      xinvert: false,
      hovermode: 'x'     // or 'x unified'
    }
  };
}

export function newId() {
  return 't_' + Math.random().toString(36).slice(2, 9);
}

export function nextColor(idx) {
  const P = ['#1f77b4','#ff7f0e','#2ca02c','#d62728',
             '#9467bd','#8c564b','#e377c2','#7f7f7f',
             '#bcbd22','#17becf'];
  return P[idx % P.length];
}
