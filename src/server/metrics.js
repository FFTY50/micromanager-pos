const DEFAULT_HISTOGRAM_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000, 10000];

function createMetricsRegistry() {
  const counters = new Map();
  const gauges = new Map();
  const histograms = new Map();

  function incCounter(name, value = 1) {
    const current = counters.get(name) || 0;
    counters.set(name, current + value);
  }

  function setGauge(name, value) {
    gauges.set(name, value);
  }

  function observeHistogram(name, value, buckets = DEFAULT_HISTOGRAM_BUCKETS) {
    if (!Number.isFinite(value)) return;
    let hist = histograms.get(name);
    if (!hist) {
      hist = {
        buckets: [...buckets].sort((a, b) => a - b),
        counts: new Array(buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      histograms.set(name, hist);
    }
    hist.sum += value;
    hist.count += 1;
    for (let i = 0; i < hist.buckets.length; i += 1) {
      if (value <= hist.buckets[i]) {
        hist.counts[i] += 1;
      }
    }
  }

  function toPrometheus() {
    const lines = [];
    gauges.forEach((value, name) => {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    });

    counters.forEach((value, name) => {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    });

    histograms.forEach((hist, name) => {
      lines.push(`# TYPE ${name} histogram`);
      let cumulative = 0;
      for (let i = 0; i < hist.buckets.length; i += 1) {
        cumulative += hist.counts[i];
        lines.push(`${name}_bucket{le="${hist.buckets[i]}"} ${cumulative}`);
      }
      lines.push(`${name}_bucket{le="+Inf"} ${hist.count}`);
      lines.push(`${name}_sum ${hist.sum}`);
      lines.push(`${name}_count ${hist.count}`);
    });

    return lines.join('\n');
  }

  return {
    incCounter,
    setGauge,
    observeHistogram,
    toPrometheus,
  };
}

module.exports = { createMetricsRegistry };
