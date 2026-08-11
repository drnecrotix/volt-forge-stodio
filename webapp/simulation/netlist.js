(function initVoltForgeNetlist(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const simulation = root.simulation || (root.simulation = {});
  const buildCircuitTopology = simulation.buildCircuitTopology;

  function formatNumericValue(value) {
    if (!Number.isFinite(value)) return "0";
    const absolute = Math.abs(value);
    if (absolute >= 1000000) return `${trimTrailingZeros((value / 1000000).toFixed(3))}meg`;
    if (absolute >= 1000) return `${trimTrailingZeros((value / 1000).toFixed(3))}k`;
    if (absolute >= 1) return trimTrailingZeros(value.toFixed(6));
    if (absolute >= 1e-3) return `${trimTrailingZeros((value * 1e3).toFixed(3))}m`;
    if (absolute >= 1e-6) return `${trimTrailingZeros((value * 1e6).toFixed(3))}u`;
    if (absolute >= 1e-9) return `${trimTrailingZeros((value * 1e9).toFixed(3))}n`;
    return value.toExponential(6);
  }

  function trimTrailingZeros(text) {
    return text.replace(/\.?0+$/, "");
  }

  function makeElementNames() {
    const counters = new Map();
    return (prefix) => {
      const next = (counters.get(prefix) || 0) + 1;
      counters.set(prefix, next);
      return `${prefix}${next}`;
    };
  }

  function generateSpiceNetlist(circuit, options = {}) {
    const analysis = options.analysis || circuit.analysis || { step: "1ms", stop: "100ms" };
    const topology = buildCircuitTopology(circuit);
    const nextElementName = makeElementNames();
    const lines = ["* VoltForge Studio Web Export"];
    const comments = [];
    const models = new Set();

    circuit.components.forEach((component) => {
      if (component.type === "ground") return;

      const nodeA = topology.nodeNameForTerminal(component.id, 0);
      const nodeB = topology.nodeNameForTerminal(component.id, 1);
      const props = component.properties || {};

      switch (component.type) {
        case "source":
          if (props.waveform === "sine") {
            lines.push(
              `${nextElementName("V")} ${nodeA} ${nodeB} SIN(${formatNumericValue(Number(props.offset) || 0)} ${formatNumericValue(Number(props.amplitude) || Number(props.voltage) || 0)} ${formatNumericValue(Number(props.frequency) || 50)})`,
            );
          } else {
            lines.push(`${nextElementName("V")} ${nodeA} ${nodeB} DC ${formatNumericValue(Number(props.voltage))}`);
          }
          break;
        case "resistor":
          lines.push(`${nextElementName("R")} ${nodeA} ${nodeB} ${formatNumericValue(Number(props.resistance))}`);
          break;
        case "lamp":
          lines.push(`${nextElementName("R")} ${nodeA} ${nodeB} ${formatNumericValue(Number(props.resistance))}`);
          comments.push(`* ${props.label || component.id}: lamp exported as a resistive load`);
          break;
        case "switch":
          lines.push(`${nextElementName("R")} ${nodeA} ${nodeB} ${props.closed ? "0.02" : "1e12"}`);
          comments.push(`* ${props.label || component.id}: switch exported as ${props.closed ? "closed" : "open"} resistor`);
          break;
        case "capacitor":
          lines.push(`${nextElementName("C")} ${nodeA} ${nodeB} ${formatNumericValue(Number(props.capacitance))}`);
          break;
        case "inductor":
          lines.push(`${nextElementName("L")} ${nodeA} ${nodeB} ${formatNumericValue(Number(props.inductance))}`);
          break;
        case "diode":
          lines.push(`${nextElementName("D")} ${nodeA} ${nodeB} DGEN`);
          models.add(".model DGEN D (IS=1e-14 N=1 RS=0.08)");
          break;
        case "led":
          lines.push(`${nextElementName("D")} ${nodeA} ${nodeB} LEDGEN`);
          models.add(".model LEDGEN D (IS=1e-16 N=2 RS=0.12)");
          comments.push(`* ${props.label || component.id}: LED series resistance is approximated in the web export`);
          break;
        default:
          comments.push(`* skipped unsupported component: ${component.type} (${props.label || component.id})`);
          break;
      }
    });

    if (comments.length) lines.push(...comments);
    if (models.size) lines.push(...models);
    lines.push(`.tran ${analysis.step} ${analysis.stop}`);
    lines.push(".end");

    return {
      text: lines.join("\n"),
      topology,
      comments,
    };
  }

  simulation.generateSpiceNetlist = generateSpiceNetlist;
})(window);
