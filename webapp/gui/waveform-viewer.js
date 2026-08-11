(function initVoltForgeWaveformViewer(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const gui = root.gui || (root.gui = {});

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }

  function formatTime(value) {
    if (Math.abs(value) >= 1) return `${value.toFixed(3)} s`;
    if (Math.abs(value) >= 1e-3) return `${(value * 1e3).toFixed(3)} ms`;
    if (Math.abs(value) >= 1e-6) return `${(value * 1e6).toFixed(3)} us`;
    return `${(value * 1e9).toFixed(3)} ns`;
  }

  function formatSignalValue(value) {
    if (!Number.isFinite(value)) return "--";
    const absolute = Math.abs(value);
    if (absolute >= 1) return value.toFixed(4);
    if (absolute >= 1e-3) return value.toFixed(6);
    return value.toExponential(4);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getTraceKind(trace) {
    return trace && trace.kind === "current" ? "current" : "voltage";
  }

  function formatTraceValue(trace, value) {
    return `${formatSignalValue(value)} ${getTraceKind(trace) === "current" ? "A" : "V"}`;
  }

  function getAxisRange(traces, visibleIndices) {
    if (!traces.length || !visibleIndices.length) {
      return { min: -1, max: 1 };
    }

    const values = visibleIndices.flatMap((entry) => traces.map((trace) => trace.values[entry.index]));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: -1, max: 1 };
    }
    if (Math.abs(max - min) < 1e-9) {
      max += 1;
      min -= 1;
    } else {
      const padding = (max - min) * 0.08;
      max += padding;
      min -= padding;
    }

    return { min, max };
  }

  const TRACE_COLORS = ["#38bdf8", "#8b5cf6", "#34d399", "#f59e0b", "#fb7185", "#a3e635", "#f472b6", "#22d3ee"];

  function tintTraceColor(hex, alpha) {
    const normalized = String(hex || "").replace("#", "");
    if (normalized.length !== 6) return `rgba(56, 189, 248, ${alpha})`;
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  class WaveformViewer {
    constructor() {
      this.result = null;
      this.labels = {};
      this.selectedTraceIds = new Set();
      this.view = { startTime: 0, endTime: 1 };
      this.cursorX = null;
      this.dragState = null;
      this.animationFrame = null;
      this.animationProgress = 1;
      this.playbackTime = null;
      this.playbackStartedAt = 0;
      this.introStartedAt = 0;

      this.root = createElement("section", "analysis-modal hidden");
      this.root.innerHTML = `
        <div class="analysis-backdrop" data-close></div>
        <div class="analysis-shell">
          <header class="analysis-header">
            <div>
              <p class="eyebrow" data-eyebrow>web package</p>
              <h3 data-title>Transient Waveform Viewer</h3>
            </div>
            <div class="analysis-toolbar">
              <button type="button" class="ghost-btn" data-export>Export CSV</button>
              <button type="button" class="ghost-btn" data-reset>Reset View</button>
              <button type="button" class="ghost-btn" data-close-btn>Close</button>
            </div>
          </header>
          <div class="analysis-body">
            <aside class="analysis-sidebar">
              <div class="analysis-status" data-status>Select a signal to begin.</div>
              <div class="analysis-signals" data-signals></div>
            </aside>
            <div class="analysis-plot-wrap">
              <canvas class="analysis-canvas" data-canvas></canvas>
              <div class="analysis-cursor" data-cursor>Cursor: --</div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.root);
      this.canvas = this.root.querySelector("[data-canvas]");
      this.signalsHost = this.root.querySelector("[data-signals]");
      this.statusHost = this.root.querySelector("[data-status]");
      this.cursorHost = this.root.querySelector("[data-cursor]");
      this.eyebrowHost = this.root.querySelector("[data-eyebrow]");
      this.titleHost = this.root.querySelector("[data-title]");
      this.closeBackdrop = this.root.querySelector("[data-close]");
      this.closeButton = this.root.querySelector("[data-close-btn]");
      this.exportButton = this.root.querySelector("[data-export]");
      this.resetButton = this.root.querySelector("[data-reset]");

      this.closeBackdrop.addEventListener("click", () => this.close());
      this.closeButton.addEventListener("click", () => this.close());
      this.exportButton.addEventListener("click", () => this.exportCsv());
      this.resetButton.addEventListener("click", () => this.resetView());
      this.canvas.addEventListener("mousemove", (event) => this.handleCursor(event));
      this.canvas.addEventListener("mouseleave", () => {
        this.cursorX = null;
        this.draw();
      });
      this.canvas.addEventListener("wheel", (event) => this.handleZoom(event), { passive: false });
      this.canvas.addEventListener("pointerdown", (event) => this.startPan(event));
      global.addEventListener("pointermove", (event) => this.handlePan(event));
      global.addEventListener("pointerup", () => this.stopPan());
      global.addEventListener("resize", () => this.draw());
    }

    setResult(result, labels = {}) {
      this.result = result;
      this.labels = labels || {};
      this.selectedTraceIds.clear();

      if (result && result.traces && result.traces.length) {
        const preferred = result.traces.filter((trace) => getTraceKind(trace) === "voltage");
        const defaults = preferred.length ? preferred : result.traces;
        defaults.slice(0, Math.min(4, defaults.length)).forEach((trace) => {
          this.selectedTraceIds.add(trace.id);
        });
      }

      this.eyebrowHost.textContent = this.labels.eyebrow || "web package";
      this.titleHost.textContent = this.labels.title || "Transient Waveform Viewer";
      this.exportButton.textContent = this.labels.export || "Export CSV";
      this.resetButton.textContent = this.labels.reset || "Reset View";
      this.closeButton.textContent = this.labels.close || "Close";
      this.cursorHost.textContent = `${this.labels.cursor || "Cursor"}: --`;

      this.resetView();
      this.renderSignalList();
      this.startAnimationLoop();
      this.draw();
    }

    open() {
      this.root.classList.remove("hidden");
      this.startAnimationLoop();
      this.draw();
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

    startAnimationLoop() {
      this.stopAnimation();
      this.animationProgress = 0;
      this.playbackTime = null;
      this.introStartedAt = global.performance ? global.performance.now() : Date.now();
      this.playbackStartedAt = this.introStartedAt;
      const duration = 720;
      const cycleDuration = 3600;
      const tick = (now) => {
        const elapsed = now - this.introStartedAt;
        this.animationProgress = clamp(elapsed / duration, 0, 1);
        if (this.result && this.result.timeValues && this.result.timeValues.length) {
          const span = Math.max(1e-9, this.view.endTime - this.view.startTime);
          const cycleProgress = ((now - this.playbackStartedAt) % cycleDuration) / cycleDuration;
          this.playbackTime = this.view.startTime + span * cycleProgress;
          if (this.cursorX === null) {
            this.updateCursorReadout(this.playbackTime);
          }
        }
        this.draw();
        this.animationFrame = global.requestAnimationFrame(tick);
      };
      this.animationFrame = global.requestAnimationFrame(tick);
    }

    updateCursorReadout(timeValue) {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) {
        this.cursorHost.textContent = `${this.labels.cursor || "Cursor"}: --`;
        return;
      }
      const index = this.findNearestIndex(timeValue);
      const selected = this.getSelectedTraces();
      const values = selected.slice(0, 3).map((trace) => `${trace.label}: ${formatTraceValue(trace, trace.values[index])}`);
      this.cursorHost.textContent = `${this.labels.cursor || "Cursor"}: ${formatTime(this.result.timeValues[index])}${values.length ? " | " : ""}${values.join(" | ")}`;
    }

    resetView() {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      this.view.startTime = this.result.timeValues[0];
      this.view.endTime = this.result.timeValues[this.result.timeValues.length - 1];
      this.draw();
    }

    renderSignalList() {
      this.signalsHost.innerHTML = "";
      if (!this.result || !this.result.traces || !this.result.traces.length) {
        this.statusHost.textContent = this.labels.noData || "No transient data available.";
        return;
      }

      this.statusHost.textContent = `${this.labels.statusSignals || "Signals"}: ${this.result.traces.length}`;
      this.result.traces.forEach((trace, index) => {
        const item = createElement("label", "signal-toggle");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = this.selectedTraceIds.has(trace.id);
        input.addEventListener("change", () => {
          if (input.checked) this.selectedTraceIds.add(trace.id);
          else this.selectedTraceIds.delete(trace.id);
          this.draw();
        });

        const swatch = createElement("span", "signal-swatch");
        swatch.style.background = TRACE_COLORS[index % TRACE_COLORS.length];
        const text = createElement("span", "signal-label", trace.label);
        item.append(input, swatch, text);
        this.signalsHost.appendChild(item);
      });
    }

    getSelectedTraces() {
      if (!this.result || !this.result.traces) return [];
      return this.result.traces.filter((trace) => this.selectedTraceIds.has(trace.id));
    }

    getPlotRect() {
      const bounds = this.canvas.getBoundingClientRect();
      return {
        left: 64,
        top: 22,
        right: bounds.width - 30,
        bottom: bounds.height - 38,
        width: bounds.width - 94,
        height: bounds.height - 60,
      };
    }

    handleZoom(event) {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const plot = this.getPlotRect();
      const x = event.clientX - rect.left;
      const ratio = clamp((x - plot.left) / Math.max(1, plot.width), 0, 1);
      const currentSpan = this.view.endTime - this.view.startTime;
      const anchor = this.view.startTime + currentSpan * ratio;
      const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;
      const maxSpan = this.result.timeValues[this.result.timeValues.length - 1] - this.result.timeValues[0];
      const nextSpan = clamp(currentSpan * zoomFactor, 1e-6, maxSpan || 1);
      this.view.startTime = anchor - nextSpan * ratio;
      this.view.endTime = anchor + nextSpan * (1 - ratio);
      this.keepViewInBounds();
      this.draw();
    }

    startPan(event) {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      this.dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startTime: this.view.startTime,
        endTime: this.view.endTime,
      };
      this.canvas.setPointerCapture(event.pointerId);
    }

    handlePan(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId || !this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      const plot = this.getPlotRect();
      const totalDelta = ((event.clientX - this.dragState.startX) / Math.max(1, plot.width)) * (this.dragState.endTime - this.dragState.startTime);
      this.view.startTime = this.dragState.startTime - totalDelta;
      this.view.endTime = this.dragState.endTime - totalDelta;
      this.keepViewInBounds();
      this.draw();
    }

    stopPan() {
      this.dragState = null;
    }

    keepViewInBounds() {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      const minimum = this.result.timeValues[0];
      const maximum = this.result.timeValues[this.result.timeValues.length - 1];
      const span = this.view.endTime - this.view.startTime;
      if (this.view.startTime < minimum) {
        this.view.startTime = minimum;
        this.view.endTime = minimum + span;
      }
      if (this.view.endTime > maximum) {
        this.view.endTime = maximum;
        this.view.startTime = maximum - span;
      }
      this.view.startTime = clamp(this.view.startTime, minimum, maximum);
      this.view.endTime = clamp(this.view.endTime, minimum, maximum);
    }

    handleCursor(event) {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const plot = this.getPlotRect();
      const relativeX = clamp(event.clientX - rect.left, plot.left, plot.right);
      const ratio = clamp((relativeX - plot.left) / Math.max(1, plot.width), 0, 1);
      this.cursorX = this.view.startTime + ratio * (this.view.endTime - this.view.startTime);
      this.updateCursorReadout(this.cursorX);
      this.draw();
    }

    findNearestIndex(timeValue) {
      const values = this.result.timeValues;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      values.forEach((value, index) => {
        const distance = Math.abs(value - timeValue);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    }

    exportCsv() {
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length) return;
      const selected = this.getSelectedTraces();
      const headers = ["time"].concat(selected.map((trace) => trace.label));
      const rows = [headers.join(",")];
      this.result.timeValues.forEach((time, index) => {
        rows.push([time].concat(selected.map((trace) => trace.values[index])).join(","));
      });
      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "voltforge-waveforms.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    draw() {
      const context = this.canvas.getContext("2d");
      const rect = this.canvas.getBoundingClientRect();
      const ratio = global.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "#07111f";
      context.fillRect(0, 0, rect.width, rect.height);

      const plot = this.getPlotRect();
      context.strokeStyle = "rgba(148, 163, 184, 0.18)";
      context.strokeRect(plot.left, plot.top, plot.width, plot.height);

      const selected = this.getSelectedTraces();
      if (!this.result || !this.result.timeValues || !this.result.timeValues.length || !selected.length) {
        context.fillStyle = "#9fb2d9";
        context.font = "14px Segoe UI";
        context.fillText(this.labels.placeholder || "Select one or more signals to draw the transient plot.", plot.left + 16, plot.top + 24);
        return;
      }

      const visibleIndices = this.result.timeValues
        .map((time, index) => ({ time, index }))
        .filter((entry) => entry.time >= this.view.startTime && entry.time <= this.view.endTime);
      if (!visibleIndices.length) return;
      const introCount = Math.max(2, Math.ceil(visibleIndices.length * Math.max(this.animationProgress, 0.02)));
      const revealedIndices = visibleIndices.slice(0, introCount);
      const activeTime = clamp(
        this.cursorX !== null ? this.cursorX : (this.playbackTime ?? this.view.startTime),
        this.view.startTime,
        this.view.endTime,
      );
      const activeVisibleIndex = visibleIndices.findIndex((entry) => entry.time >= activeTime);
      const playheadLimit = activeVisibleIndex >= 0 ? activeVisibleIndex + 1 : revealedIndices.length;
      const playheadIndices = revealedIndices.slice(
        0,
        Math.max(2, Math.min(playheadLimit, revealedIndices.length)),
      );

      const voltageTraces = selected.filter((trace) => getTraceKind(trace) === "voltage");
      const currentTraces = selected.filter((trace) => getTraceKind(trace) === "current");
      const leftAxis = getAxisRange(voltageTraces.length ? voltageTraces : selected, revealedIndices);
      const rightAxis = currentTraces.length ? getAxisRange(currentTraces, revealedIndices) : null;

      context.strokeStyle = "rgba(56, 189, 248, 0.08)";
      context.lineWidth = 1;
      for (let grid = 0; grid <= 4; grid += 1) {
        const y = plot.top + (plot.height / 4) * grid;
        context.beginPath();
        context.moveTo(plot.left, y);
        context.lineTo(plot.right, y);
        context.stroke();
      }

      selected.forEach((trace, index) => {
        const axis = getTraceKind(trace) === "current" && rightAxis ? rightAxis : leftAxis;
        const color = TRACE_COLORS[index % TRACE_COLORS.length];

        context.beginPath();
        revealedIndices.forEach((entry, pointIndex) => {
          const x = plot.left + ((entry.time - this.view.startTime) / Math.max(1e-9, this.view.endTime - this.view.startTime)) * plot.width;
          const y = plot.bottom - ((trace.values[entry.index] - axis.min) / Math.max(1e-9, axis.max - axis.min)) * plot.height;
          if (pointIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = tintTraceColor(color, 0.24);
        context.lineWidth = getTraceKind(trace) === "current" ? 1.5 : 1.85;
        context.setLineDash(getTraceKind(trace) === "current" ? [8, 5] : []);
        context.stroke();
        context.setLineDash([]);

        context.beginPath();
        playheadIndices.forEach((entry, pointIndex) => {
          const x = plot.left + ((entry.time - this.view.startTime) / Math.max(1e-9, this.view.endTime - this.view.startTime)) * plot.width;
          const y = plot.bottom - ((trace.values[entry.index] - axis.min) / Math.max(1e-9, axis.max - axis.min)) * plot.height;
          if (pointIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = color;
        context.lineWidth = getTraceKind(trace) === "current" ? 1.9 : 2.5;
        context.setLineDash(getTraceKind(trace) === "current" ? [7, 4] : []);
        context.stroke();
        context.setLineDash([]);
      });

      context.fillStyle = "#9fb2d9";
      context.font = "12px Segoe UI";
      context.textAlign = "left";
      context.fillText(formatTime(this.view.startTime), plot.left, plot.bottom + 18);
      context.fillText(formatTime(this.view.endTime), plot.right - 68, plot.bottom + 18);
      context.fillText(`${formatSignalValue(leftAxis.max)} V`, 8, plot.top + 8);
      context.fillText(`${formatSignalValue(leftAxis.min)} V`, 8, plot.bottom);
      context.fillText(this.labels.voltageAxis || "Voltage (V)", 8, Math.max(14, plot.top - 6));

      if (rightAxis) {
        context.textAlign = "right";
        context.fillText(`${formatSignalValue(rightAxis.max)} A`, rect.width - 8, plot.top + 8);
        context.fillText(`${formatSignalValue(rightAxis.min)} A`, rect.width - 8, plot.bottom);
        context.fillText(this.labels.currentAxis || "Current (A)", rect.width - 8, Math.max(14, plot.top - 6));
        context.textAlign = "left";
      }

      const cursorTime = this.cursorX !== null ? this.cursorX : this.playbackTime;
      if (cursorTime !== null && Number.isFinite(cursorTime)) {
        const x = plot.left + ((cursorTime - this.view.startTime) / Math.max(1e-9, this.view.endTime - this.view.startTime)) * plot.width;
        context.strokeStyle = "rgba(248, 250, 252, 0.35)";
        context.beginPath();
        context.moveTo(x, plot.top);
        context.lineTo(x, plot.bottom);
        context.stroke();

        const cursorIndex = this.findNearestIndex(cursorTime);
        selected.forEach((trace, index) => {
          const axis = getTraceKind(trace) === "current" && rightAxis ? rightAxis : leftAxis;
          const y = plot.bottom - ((trace.values[cursorIndex] - axis.min) / Math.max(1e-9, axis.max - axis.min)) * plot.height;
          context.beginPath();
          context.arc(x, y, getTraceKind(trace) === "current" ? 4 : 4.8, 0, Math.PI * 2);
          context.fillStyle = TRACE_COLORS[index % TRACE_COLORS.length];
          context.fill();
          context.strokeStyle = "rgba(7, 17, 31, 0.95)";
          context.lineWidth = 2;
          context.stroke();
        });
      }
    }
  }

  gui.WaveformViewer = WaveformViewer;
})(window);
