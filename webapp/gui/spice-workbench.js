(function initVoltForgeSpiceWorkbench(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const gui = root.gui || (root.gui = {});

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }

  const ANALYSIS_PRESETS = [
    { key: "cycle-50", label: "1 cycle / 50 Hz", step: "0.25ms", stop: "20ms" },
    { key: "five-cycle-50", label: "5 cycles / 50 Hz", step: "0.25ms", stop: "100ms" },
    { key: "rc-quick", label: "RC quick", step: "100us", stop: "20ms" },
  ];

  class SpiceWorkbench {
    constructor({ onApplyAnalysis, onOpenWaveforms }) {
      this.onApplyAnalysis = onApplyAnalysis;
      this.onOpenWaveforms = onOpenWaveforms;
      this.payload = null;
      this.mode = "spice";

      this.root = createElement("section", "analysis-modal hidden");
      this.root.innerHTML = `
        <div class="analysis-backdrop" data-close></div>
        <div class="analysis-shell analysis-shell-wide">
          <header class="analysis-header">
            <div>
              <p class="eyebrow" data-kicker>web packages</p>
              <h3 data-title>SPICE Workbench</h3>
            </div>
            <div class="analysis-toolbar">
              <button type="button" class="ghost-btn" data-copy>Copy Netlist</button>
              <button type="button" class="ghost-btn" data-waveforms>Waveforms</button>
              <button type="button" class="ghost-btn" data-close-btn>Close</button>
            </div>
          </header>
          <div class="analysis-body analysis-body-stack">
            <div class="analysis-form">
              <label class="analysis-input">
                <span>Tran Step</span>
                <input type="text" data-step placeholder="1ms" />
              </label>
              <label class="analysis-input">
                <span>Tran Stop</span>
                <input type="text" data-stop placeholder="100ms" />
              </label>
              <button type="button" class="ghost-btn" data-apply>Apply Analysis</button>
            </div>
            <div class="analysis-preset-row hidden" data-presets></div>
            <div class="analysis-note hidden" data-note>
              Smaller step values draw smoother curves. Stop controls the total captured time. For AC and sine sources, open Waveforms after applying the transient setup.
            </div>
            <div class="analysis-status" data-status>Netlist is ready.</div>
            <textarea class="netlist-output" data-netlist spellcheck="false"></textarea>
          </div>
        </div>
      `;

      document.body.appendChild(this.root);
      this.stepInput = this.root.querySelector("[data-step]");
      this.stopInput = this.root.querySelector("[data-stop]");
      this.statusHost = this.root.querySelector("[data-status]");
      this.netlistHost = this.root.querySelector("[data-netlist]");
      this.kickerHost = this.root.querySelector("[data-kicker]");
      this.titleHost = this.root.querySelector("[data-title]");
      this.copyButton = this.root.querySelector("[data-copy]");
      this.waveformsButton = this.root.querySelector("[data-waveforms]");
      this.closeButton = this.root.querySelector("[data-close-btn]");
      this.applyButton = this.root.querySelector("[data-apply]");
      this.presetsHost = this.root.querySelector("[data-presets]");
      this.noteHost = this.root.querySelector("[data-note]");

      this.root.querySelector("[data-close]").addEventListener("click", () => this.close());
      this.closeButton.addEventListener("click", () => this.close());
      this.applyButton.addEventListener("click", () => {
        if (this.onApplyAnalysis) {
          this.onApplyAnalysis({
            step: this.stepInput.value.trim(),
            stop: this.stopInput.value.trim(),
          });
        }
      });
      this.copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(this.netlistHost.value);
          this.statusHost.textContent = "Netlist copied to clipboard.";
        } catch (error) {
          this.statusHost.textContent = "Clipboard copy failed in this browser.";
        }
      });
      this.waveformsButton.addEventListener("click", () => {
        if (this.onOpenWaveforms) this.onOpenWaveforms();
      });

      ANALYSIS_PRESETS.forEach((preset) => {
        const button = createElement("button", "ghost-btn analysis-preset-btn", preset.label);
        button.type = "button";
        button.addEventListener("click", () => {
          this.stepInput.value = preset.step;
          this.stopInput.value = preset.stop;
          this.statusHost.textContent = `Preset applied: ${preset.label}. Click Apply Transient to refresh the preview.`;
        });
        this.presetsHost.appendChild(button);
      });
    }

    update(payload) {
      this.payload = payload;
      this.stepInput.value = (payload.analysis && payload.analysis.step) || "";
      this.stopInput.value = (payload.analysis && payload.analysis.stop) || "";
      this.netlistHost.value = payload.netlist || "";
      this.statusHost.textContent = payload.status || "Netlist is ready.";
      this.waveformsButton.disabled = !payload.hasWaveforms;
      this.applyMode(this.mode);
    }

    applyMode(mode) {
      this.mode = mode === "analysis" ? "analysis" : "spice";
      if (this.mode === "analysis") {
        this.kickerHost.textContent = "simulation";
        this.titleHost.textContent = "Transient Analysis";
        this.copyButton.style.display = "none";
        this.netlistHost.style.display = "none";
        this.waveformsButton.style.display = "";
        this.applyButton.textContent = "Apply Transient";
        this.presetsHost.classList.remove("hidden");
        this.noteHost.classList.remove("hidden");
      } else {
        this.kickerHost.textContent = "web packages";
        this.titleHost.textContent = "SPICE Workbench";
        this.copyButton.style.display = "";
        this.netlistHost.style.display = "";
        this.waveformsButton.style.display = "";
        this.applyButton.textContent = "Apply Analysis";
        this.presetsHost.classList.add("hidden");
        this.noteHost.classList.add("hidden");
      }
    }

    openNetlist(payload = this.payload) {
      if (payload) this.update(payload);
      this.applyMode("spice");
      this.root.classList.remove("hidden");
    }

    openAnalysis(payload = this.payload) {
      if (payload) this.update(payload);
      this.applyMode("analysis");
      this.root.classList.remove("hidden");
    }

    open(payload = this.payload) {
      this.openNetlist(payload);
    }

    close() {
      this.root.classList.add("hidden");
    }
  }

  gui.SpiceWorkbench = SpiceWorkbench;
})(window);

/* Load the optional Studio functional UX layer without coupling it to index.html. */
(function bootstrapVoltForgeStudioEnhancements() {
  const cssHref = "webapp/gui/studio-enhancements.css";
  const scriptSrc = "webapp/gui/studio-enhancements.js";

  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector(`script[src="${scriptSrc}"]`)) return;
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.defer = true;
    document.body.appendChild(script);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadScript, { once: true });
  } else {
    loadScript();
  }
})();
