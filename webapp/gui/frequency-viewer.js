(function initVoltForgeFrequencyViewer(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const gui = root.gui || (root.gui = {});

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }

  function formatFrequency(value) {
    if (!Number.isFinite(value) || value <= 0) return "0.00 Hz";
    if (value >= 1000) return `${value.toFixed(1)} Hz`;
    if (value >= 1) return `${value.toFixed(2)} Hz`;
    return `${value.toFixed(4)} Hz`;
  }

  function estimateFrequency(timeValues, values) {
    if (!timeValues || !values || timeValues.length < 6 || values.length < 6) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const centered = values.map((value) => value - mean);
    const rms = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0) / centered.length);
    if (!Number.isFinite(rms) || rms < 1e-9) return 0;

    const threshold = rms * 0.18;
    const crossings = [];
    for (let index = 1; index < centered.length; index += 1) {
      const previous = centered[index - 1];
      const current = centered[index];
      if (previous < 0 && current >= 0 && (Math.abs(previous) > threshold || Math.abs(current) > threshold)) {
        const ratio = Math.abs(previous) + Math.abs(current) > 0
          ? Math.abs(previous) / (Math.abs(previous) + Math.abs(current))
          : 0;
        crossings.push(timeValues[index - 1] + (timeValues[index] - timeValues[index - 1]) * ratio);
      }
    }

    const intervals = [];
    for (let index = 1; index < crossings.length; index += 1) {
      const interval = crossings[index] - crossings[index - 1];
      if (interval > 0) intervals.push(interval);
    }
    if (intervals.length >= 2) {
      const sorted = intervals.slice().sort((left, right) => left - right);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > 0) return 1 / median;
    }

    const peaks = [];
    for (let index = 1; index < centered.length - 1; index += 1) {
      if (centered[index] > threshold && centered[index] >= centered[index - 1] && centered[index] > centered[index + 1]) {
        peaks.push(timeValues[index]);
      }
    }
    if (peaks.length >= 2) {
      const peakIntervals = [];
      for (let index = 1; index < peaks.length; index += 1) {
        const interval = peaks[index] - peaks[index - 1];
        if (interval > 0) peakIntervals.push(interval);
      }
      if (peakIntervals.length) {
        const sorted = peakIntervals.slice().sort((left, right) => left - right);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (median > 0) return 1 / median;
      }
    }

    return 0;
  }

  class FrequencyViewer {
    constructor() {
      this.payload = null;
      this.metrics = [];
      this.animationFrame = null;
      this.animationProgress = 1;

      this.root = createElement("section", "analysis-modal hidden");
      this.root.innerHTML = `
        <div class="analysis-backdrop" data-close></div>
        <div class="analysis-shell analysis-shell-wide">
          <header class="analysis-header">
            <div>
              <p class="eyebrow" data-kicker>transient analysis</p>
              <h3 data-title>Voltage Frequency Viewer</h3>
            </div>
            <div class="analysis-toolbar">
              <button type="button" class="ghost-btn" data-export>Export CSV</button>
              <button type="button" class="ghost-btn" data-close-btn>Close</button>
            </div>
          </header>
          <div class="analysis-body analysis-body-stack">
            <div class="analysis-status" data-status>No voltage traces available.</div>
            <div class="frequency-grid">
              <canvas class="analysis-canvas frequency-canvas" data-canvas></canvas>
              <div class="frequency-list" data-list></div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.root);
      this.canvas = this.root.querySelector("[data-canvas]");
      this.listHost = this.root.querySelector("[data-list]");
      this.statusHost = this.root.querySelector("[data-status]");
      this.titleHost = this.root.querySelector("[data-title]");
      this.kickerHost = this.root.querySelector("[data-kicker]");
      this.exportButton = this.root.querySelector("[data-export]");
      this.closeBackdrop = this.root.querySelector("[data-close]");
      this.closeButton = this.root.querySelector("[data-close-btn]");

      this.closeBackdrop.addEventListener("click", () => this.close());
      this.closeButton.addEventListener("click", () => this.close());
      this.exportButton.addEventListener("click", () => this.exportCsv());
      global.addEventListener("resize", () => this.draw());
    }

    setPayload(payload) {
      this.payload = payload || null;
      const labels = payload && payload.labels ? payload.labels : {};
      this.titleHost.textContent = labels.title || "Voltage Frequency Viewer";
      this.kickerHost.textContent = labels.kicker || "transient analysis";
      this.exportButton.textContent = labels.export || "Export CSV";
      this.closeButton.textContent = labels.close || "Close";
      this.metrics = this.buildMetrics(payload && payload.result);
      this.renderList(labels);
      this.startIntroAnimation(labels);
      this.draw(labels);
    }

    buildMetrics(result) {
      if (!result || !result.success || !Array.isArray(result.traces)) return [];
      return result.traces
        .filter((trace) => trace.kind === "voltage")
        .map((trace) => ({
          id: trace.id,
          label: trace.label,
          frequency: estimateFrequency(result.timeValues, trace.values),
          peak: Math.max(...trace.values.map((value) => Math.abs(value)), 0),
        }));
    }

    renderList(labels = {}) {
      this.listHost.innerHTML = "";
      if (!this.metrics.length) {
        this.statusHost.textContent = labels.empty || "No voltage traces available for frequency analysis.";
        return;
      }

      const maxMetric = this.metrics.reduce((best, metric) => (metric.frequency > best.frequency ? metric : best), this.metrics[0]);
      this.statusHost.textContent = `${labels.summary || "Strongest detected frequency"}: ${maxMetric.label} - ${formatFrequency(maxMetric.frequency)}`;

      this.metrics.forEach((metric) => {
        const card = createElement("div", "frequency-card");
        card.innerHTML = `
          <strong>${metric.label}</strong>
          <span>${formatFrequency(metric.frequency)}</span>
          <small>${labels.peak || "Peak voltage"}: ${metric.peak.toFixed(2)} V</small>
        `;
        this.listHost.appendChild(card);
      });
    }

    open() {
      this.root.classList.remove("hidden");
      this.startIntroAnimation(this.payload && this.payload.labels);
      this.draw(this.payload && this.payload.labels);
    }

    close() {
      this.stopAnimation();
      this.root.classList.add("hidden");
    }

    stopAnimation() {
      if (this.animationFrame) {
        global.cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }

    startIntroAnimation(labels = {}) {
      this.stopAnimation();
      this.animationProgress = 0;
      const start = global.performance ? global.performance.now() : Date.now();
      const duration = 680;
      const tick = (now) => {
        const elapsed = now - start;
        this.animationProgress = Math.max(0, Math.min(1, elapsed / duration));
        this.draw(labels);
        if (this.animationProgress < 1) {
          this.animationFrame = global.requestAnimationFrame(tick);
        } else {
          this.animationFrame = null;
        }
      };
      this.animationFrame = global.requestAnimationFrame(tick);
    }

    exportCsv() {
      if (!this.metrics.length) return;
      const rows = ["signal,frequency_hz,peak_voltage_v"];
      this.metrics.forEach((metric) => {
        rows.push([metric.label, metric.frequency, metric.peak].join(","));
      });
      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "voltforge-frequency.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    draw(labels = {}) {
      const context = this.canvas.getContext("2d");
      const bounds = this.canvas.getBoundingClientRect();
      const ratio = global.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      this.canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle = "#07111f";
      context.fillRect(0, 0, bounds.width, bounds.height);

      const plot = {
        left: 62,
        top: 24,
        width: Math.max(160, bounds.width - 88),
        height: Math.max(220, bounds.height - 72),
      };

      context.strokeStyle = "rgba(148, 163, 184, 0.18)";
      context.strokeRect(plot.left, plot.top, plot.width, plot.height);

      if (!this.metrics.length) {
        context.fillStyle = "#9fb2d9";
        context.font = "14px Segoe UI";
        context.fillText(labels.placeholder || "Run a transient simulation to see the voltage frequency chart.", plot.left + 18, plot.top + 28);
        return;
      }

      const maxFrequency = Math.max(...this.metrics.map((metric) => metric.frequency), 1);
      context.font = "12px Segoe UI";
      context.fillStyle = "rgba(170, 179, 214, 0.9)";
      for (let row = 0; row <= 4; row += 1) {
        const y = plot.top + (plot.height / 4) * row;
        context.strokeStyle = "rgba(56, 189, 248, 0.08)";
        context.beginPath();
        context.moveTo(plot.left, y);
        context.lineTo(plot.left + plot.width, y);
        context.stroke();
        const label = formatFrequency(maxFrequency * (1 - row / 4));
        context.fillText(label, 10, y + 4);
      }

      const gap = 16;
      const barWidth = Math.max(28, (plot.width - gap * Math.max(0, this.metrics.length - 1)) / this.metrics.length);
      this.metrics.forEach((metric, index) => {
        const barHeight = (metric.frequency / maxFrequency) * (plot.height - 28) * Math.max(this.animationProgress, 0.04);
        const x = plot.left + index * (barWidth + gap);
        const y = plot.top + plot.height - barHeight;
        const gradient = context.createLinearGradient(x, y, x, plot.top + plot.height);
        gradient.addColorStop(0, "rgba(56, 189, 248, 0.92)");
        gradient.addColorStop(1, "rgba(139, 92, 246, 0.92)");
        context.fillStyle = gradient;
        context.fillRect(x, y, barWidth, barHeight);

        context.fillStyle = "#eef2ff";
        context.textAlign = "center";
        context.fillText(formatFrequency(metric.frequency), x + barWidth / 2, Math.max(plot.top + 14, y - 8));

        const label = metric.label.length > 12 ? `${metric.label.slice(0, 12)}...` : metric.label;
        context.save();
        context.translate(x + barWidth / 2, plot.top + plot.height + 14);
        context.rotate(-Math.PI / 8);
        context.fillStyle = "rgba(170, 179, 214, 0.9)";
        context.fillText(label, 0, 0);
        context.restore();
      });

      context.textAlign = "left";
    }
  }

  gui.FrequencyViewer = FrequencyViewer;
})(window);
