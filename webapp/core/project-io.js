(function initVoltForgeProjectIo(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const core = root.core || (root.core = {});

  const DEFAULT_ANALYSIS_SETTINGS = Object.freeze({
    step: "1ms",
    stop: "100ms",
  });

  function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseEngineeringValue(input) {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    const text = String(input || "").trim().toLowerCase();
    const match = text.match(/^([+-]?\d*\.?\d+)\s*(meg|k|m|u|n|p)?$/);
    if (!match) return Number(text) || 0;
    const value = Number(match[1]);
    const scale = {
      meg: 1e6,
      k: 1e3,
      m: 1e-3,
      u: 1e-6,
      n: 1e-9,
      p: 1e-12,
    }[match[2] || ""] || 1;
    return value * scale;
  }

  function pinIndexForType(type, pinName) {
    const normalized = String(pinName || "").toLowerCase();
    const pinMap = {
      voltage_source: { positive: 0, negative: 1 },
      source: { positive: 0, negative: 1 },
      resistor: { a: 0, b: 1 },
      capacitor: { a: 0, b: 1 },
      inductor: { a: 0, b: 1 },
      lamp: { a: 0, b: 1 },
      switch: { "1": 0, "2": 1, a: 0, b: 1 },
      diode: { a: 0, k: 1 },
      led: { a: 0, k: 1 },
      ground: { gnd: 0 },
    };
    return pinMap[type] && pinMap[type][normalized] !== undefined ? pinMap[type][normalized] : 0;
  }

  function normalizeAnalysisSettings(analysis) {
    const source = analysis || {};
    return {
      step: typeof source.step === "string" && source.step.trim() ? source.step.trim() : DEFAULT_ANALYSIS_SETTINGS.step,
      stop: typeof source.stop === "string" && source.stop.trim() ? source.stop.trim() : DEFAULT_ANALYSIS_SETTINGS.stop,
    };
  }

  function convertDesktopProject(data) {
    const typeMap = {
      voltage_source: "source",
      resistor: "resistor",
      capacitor: "capacitor",
      inductor: "inductor",
      diode: "diode",
      led: "led",
      switch: "switch",
      ground: "ground",
    };

    const components = (data.components || []).map((component) => {
      const type = typeMap[component.type] || component.type;
      const properties = {
        label: component.name || component.id,
      };

      if (type === "source") properties.voltage = parseEngineeringValue(component.value || 5);
      if (type === "resistor" || type === "lamp") properties.resistance = parseEngineeringValue(component.value || 1000);
      if (type === "capacitor") properties.capacitance = parseEngineeringValue(component.value || 1e-6);
      if (type === "inductor") {
        properties.inductance = parseEngineeringValue(component.value || 1e-3);
        properties.seriesResistance = 0.08;
      }
      if (type === "diode") {
        properties.forwardVoltage = 0.7;
        properties.onResistance = 0.08;
      }
      if (type === "led") {
        properties.forwardVoltage = 2.1;
        properties.resistance = 120;
        properties.color = "#fb923c";
      }
      if (type === "switch") properties.closed = true;

      return {
        id: component.id,
        type,
        catalogId: type,
        x: component.x,
        y: component.y,
        rotation: 0,
        properties,
      };
    });

    const wires = (data.wires || []).map((wire) => {
      const fromComponent = (data.components || []).find((component) => component.id === wire.start.component_id);
      const toComponent = (data.components || []).find((component) => component.id === wire.end.component_id);
      return {
        id: wire.id,
        from: {
          componentId: wire.start.component_id,
          terminalIndex: pinIndexForType(fromComponent && fromComponent.type, wire.start.pin),
        },
        to: {
          componentId: wire.end.component_id,
          terminalIndex: pinIndexForType(toComponent && toComponent.type, wire.end.pin),
        },
      };
    });

    return {
      version: 3,
      app: "VoltForge Studio",
      language: typeof data.language === "string" ? data.language : "bg",
      zoom: 1,
      analysis: normalizeAnalysisSettings(data.analysis),
      components,
      wires,
    };
  }

  function serializeWebProject(state) {
    return {
      version: 3,
      app: "VoltForge Studio",
      language: state.language || "bg",
      zoom: state.zoom,
      analysis: normalizeAnalysisSettings(state.analysis),
      components: cloneDeep(state.components),
      wires: cloneDeep(state.wires),
    };
  }

  function deserializeWebProject(data) {
    if (!data || !Array.isArray(data.components) || !Array.isArray(data.wires)) {
      throw new Error("Invalid circuit JSON format.");
    }

    const looksLikeDesktopProject = data.components.some((component) => component && (component.type === "voltage_source" || Array.isArray(component.pins)));
    if (looksLikeDesktopProject) {
      return convertDesktopProject(data);
    }

    return {
      version: Number(data.version) || 1,
      app: typeof data.app === "string" ? data.app : "VoltForge Studio",
      language: typeof data.language === "string" ? data.language : "bg",
      zoom: Number.isFinite(Number(data.zoom)) ? Number(data.zoom) : 1,
      analysis: normalizeAnalysisSettings(data.analysis),
      components: cloneDeep(data.components),
      wires: cloneDeep(data.wires),
    };
  }

  core.DEFAULT_ANALYSIS_SETTINGS = DEFAULT_ANALYSIS_SETTINGS;
  core.cloneDeep = cloneDeep;
  core.normalizeAnalysisSettings = normalizeAnalysisSettings;
  core.serializeWebProject = serializeWebProject;
  core.deserializeWebProject = deserializeWebProject;
})(window);
