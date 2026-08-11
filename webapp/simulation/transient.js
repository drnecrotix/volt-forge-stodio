(function initVoltForgeTransient(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const simulation = root.simulation || (root.simulation = {});
  const buildCircuitTopology = simulation.buildCircuitTopology;

  const SUPPORTED_TYPES = new Set(["source", "resistor", "capacitor", "inductor", "ground", "lamp", "switch", "diode", "led"]);

  function parseTimeValue(input) {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    const text = String(input || "").trim().toLowerCase();
    const match = text.match(/^([+-]?\d*\.?\d+)\s*(s|ms|us|ns)?$/);
    if (!match) return NaN;
    const value = Number(match[1]);
    const unit = match[2] || "s";
    const scale = { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9 }[unit];
    return value * scale;
  }

  function formatTraceLabel(kind, component) {
    const label = component.properties && component.properties.label ? component.properties.label : component.id;
    return kind === "voltage" ? `V(${label})` : `I(${label})`;
  }

  function getSourceVoltageAtTime(component, time) {
    const props = component.properties || {};
    if (props.waveform === "sine") {
      const offset = Number(props.offset) || 0;
      const amplitude = Number(props.amplitude) || Number(props.voltage) || 0;
      const frequency = Math.max(0, Number(props.frequency) || 0);
      return offset + amplitude * Math.sin(Math.PI * 2 * frequency * time);
    }
    return Number(props.voltage) || 0;
  }

  function stampConductance(matrix, left, right, conductance) {
    if (left >= 0) matrix[left][left] += conductance;
    if (right >= 0) matrix[right][right] += conductance;
    if (left >= 0 && right >= 0) {
      matrix[left][right] -= conductance;
      matrix[right][left] -= conductance;
    }
  }

  function stampCurrent(vector, left, right, current) {
    if (left >= 0) vector[left] += current;
    if (right >= 0) vector[right] -= current;
  }

  function stampVoltageSource(matrix, vector, left, right, sourceIndex, voltage) {
    if (left >= 0) {
      matrix[left][sourceIndex] += 1;
      matrix[sourceIndex][left] += 1;
    }
    if (right >= 0) {
      matrix[right][sourceIndex] -= 1;
      matrix[sourceIndex][right] -= 1;
    }
    vector[sourceIndex] += voltage;
  }

  function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const system = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

    for (let pivot = 0; pivot < size; pivot += 1) {
      let bestRow = pivot;
      for (let row = pivot + 1; row < size; row += 1) {
        if (Math.abs(system[row][pivot]) > Math.abs(system[bestRow][pivot])) {
          bestRow = row;
        }
      }

      if (Math.abs(system[bestRow][pivot]) < 1e-12) {
        throw new Error("The transient solver found a singular matrix. Check for floating nodes or disconnected parts.");
      }

      if (bestRow !== pivot) {
        [system[pivot], system[bestRow]] = [system[bestRow], system[pivot]];
      }

      const pivotValue = system[pivot][pivot];
      for (let column = pivot; column <= size; column += 1) {
        system[pivot][column] /= pivotValue;
      }

      for (let row = 0; row < size; row += 1) {
        if (row === pivot) continue;
        const factor = system[row][pivot];
        if (factor === 0) continue;
        for (let column = pivot; column <= size; column += 1) {
          system[row][column] -= factor * system[pivot][column];
        }
      }
    }

    return system.map((row) => row[size]);
  }

  function getNodeVoltage(solution, nodeIndex) {
    return nodeIndex >= 0 ? solution[nodeIndex] : 0;
  }

  function isSemiconductor(component) {
    return component && (component.type === "diode" || component.type === "led");
  }

  function getResistiveValue(component, semiconductorStates) {
    const props = component.properties || {};
    switch (component.type) {
      case "resistor":
      case "lamp":
        return Math.max(Number(props.resistance) || 1, 1e-9);
      case "switch":
        return props.closed ? 0.02 : 1e12;
      case "diode":
        return semiconductorStates.get(component.id) ? Math.max(Number(props.onResistance) || 0.08, 1e-6) : 1e12;
      case "led":
        return semiconductorStates.get(component.id) ? Math.max(Number(props.resistance) || 120, 1e-6) : 1e12;
      default:
        return Math.max(Number(props.resistance) || 1, 1e-9);
    }
  }

  function buildStepMatrix({
    circuit,
    topology,
    time,
    dt,
    voltageSourceIndexById,
    matrixSize,
    capacitorVoltages,
    inductorCurrents,
    semiconductorStates,
  }) {
    const matrix = Array.from({ length: matrixSize }, () => Array.from({ length: matrixSize }, () => 0));
    const vector = Array.from({ length: matrixSize }, () => 0);

    circuit.components.forEach((component) => {
      const leftRoot = topology.rootForTerminal(component.id, 0);
      const rightRoot = component.type === "ground" ? null : topology.rootForTerminal(component.id, 1);
      const leftIndex = leftRoot ? topology.nodeIndexForRoot(leftRoot) : -1;
      const rightIndex = rightRoot ? topology.nodeIndexForRoot(rightRoot) : -1;
      const props = component.properties || {};

      switch (component.type) {
        case "resistor":
        case "lamp":
        case "switch":
        case "diode":
        case "led": {
          const resistance = getResistiveValue(component, semiconductorStates);
          stampConductance(matrix, leftIndex, rightIndex, 1 / resistance);
          break;
        }
        case "capacitor": {
          const capacitance = Math.max(Number(props.capacitance) || 0, 1e-12);
          const conductance = capacitance / dt;
          const previousVoltage = capacitorVoltages.get(component.id) || 0;
          stampConductance(matrix, leftIndex, rightIndex, conductance);
          stampCurrent(vector, leftIndex, rightIndex, conductance * previousVoltage);
          break;
        }
        case "inductor": {
          const inductance = Math.max(Number(props.inductance) || 0, 1e-9);
          const seriesResistance = Math.max(Number(props.seriesResistance) || 0.02, 1e-6);
          const alpha = inductance / dt;
          const conductance = 1 / (seriesResistance + alpha);
          const previousCurrent = inductorCurrents.get(component.id) || 0;
          stampConductance(matrix, leftIndex, rightIndex, conductance);
          stampCurrent(vector, leftIndex, rightIndex, conductance * alpha * previousCurrent);
          break;
        }
        case "source": {
          const sourceIndex = voltageSourceIndexById.get(component.id);
          stampVoltageSource(matrix, vector, leftIndex, rightIndex, sourceIndex, getSourceVoltageAtTime(component, time));
          break;
        }
        default:
          break;
      }
    });

    return { matrix, vector };
  }

  function solveStep({
    circuit,
    topology,
    time,
    dt,
    voltageSourceIndexById,
    matrixSize,
    capacitorVoltages,
    inductorCurrents,
    semiconductorStates,
  }) {
    let solution = null;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const { matrix, vector } = buildStepMatrix({
        circuit,
        topology,
        time,
        dt,
        voltageSourceIndexById,
        matrixSize,
        capacitorVoltages,
        inductorCurrents,
        semiconductorStates,
      });
      solution = solveLinearSystem(matrix, vector);

      let changed = false;
      circuit.components.forEach((component) => {
        if (!isSemiconductor(component)) return;
        const leftIndex = topology.nodeIndexForRoot(topology.rootForTerminal(component.id, 0));
        const rightIndex = topology.nodeIndexForRoot(topology.rootForTerminal(component.id, 1));
        const voltageDrop = getNodeVoltage(solution, leftIndex) - getNodeVoltage(solution, rightIndex);
        const isOn = voltageDrop >= Math.max(Number(component.properties?.forwardVoltage) || 0, 0);
        if (semiconductorStates.get(component.id) !== isOn) {
          semiconductorStates.set(component.id, isOn);
          changed = true;
        }
      });

      if (!changed) break;
    }

    return solution;
  }

  function runTransientAnalysis(circuit, analysisInput) {
    if (!circuit || !circuit.components || !circuit.components.length) {
      return { success: false, error: "Transient preview requires at least one component." };
    }

    const unsupported = circuit.components.filter((component) => !SUPPORTED_TYPES.has(component.type));
    if (unsupported.length) {
      return {
        success: false,
        error: `Transient preview currently supports these web components only. Unsupported: ${unsupported.map((item) => (item.properties && item.properties.label) || item.type).join(", ")}`,
      };
    }

    if (!circuit.components.some((component) => component.type === "source")) {
      return { success: false, error: "Transient preview needs at least one voltage source." };
    }
    if (!circuit.components.some((component) => component.type === "ground")) {
      return { success: false, error: "Transient preview needs a ground reference." };
    }

    const topology = buildCircuitTopology(circuit);
    const dt = parseTimeValue(analysisInput && analysisInput.step);
    const stop = parseTimeValue(analysisInput && analysisInput.stop);
    if (!Number.isFinite(dt) || dt <= 0) return { success: false, error: "Invalid transient step value." };
    if (!Number.isFinite(stop) || stop <= 0) return { success: false, error: "Invalid transient stop value." };

    const steps = Math.max(2, Math.ceil(stop / dt) + 1);
    const voltageSources = circuit.components.filter((component) => component.type === "source");
    const matrixSize = topology.nodeCount + voltageSources.length;
    if (matrixSize <= 0) {
      return { success: false, error: "Transient preview could not build a solvable circuit matrix." };
    }

    const voltageSourceIndexById = new Map();
    voltageSources.forEach((component, index) => {
      voltageSourceIndexById.set(component.id, topology.nodeCount + index);
    });

    const capacitorVoltages = new Map(
      circuit.components
        .filter((component) => component.type === "capacitor")
        .map((component) => [component.id, 0]),
    );
    const inductorCurrents = new Map(
      circuit.components
        .filter((component) => component.type === "inductor")
        .map((component) => [component.id, 0]),
    );
    const semiconductorStates = new Map(
      circuit.components
        .filter((component) => isSemiconductor(component))
        .map((component) => [component.id, false]),
    );
    const traces = new Map();
    const timeValues = [];

    const roots = topology.roots().filter((rootId) => topology.nodeIndexForRoot(rootId) >= 0);
    roots.forEach((rootId) => {
      const traceName = `V(${topology.nodeNameForRoot(rootId)})`;
      traces.set(traceName, { id: traceName, label: traceName, kind: "voltage", values: [] });
    });

    circuit.components
      .filter((component) => component.type !== "ground")
      .forEach((component) => {
        const traceName = formatTraceLabel("current", component);
        traces.set(traceName, { id: traceName, label: traceName, kind: "current", values: [] });
      });

    try {
      for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
        const time = Math.min(stop, stepIndex * dt);
        const solution = solveStep({
          circuit,
          topology,
          time,
          dt,
          voltageSourceIndexById,
          matrixSize,
          capacitorVoltages,
          inductorCurrents,
          semiconductorStates,
        });

        timeValues.push(time);

        roots.forEach((rootId) => {
          const traceName = `V(${topology.nodeNameForRoot(rootId)})`;
          traces.get(traceName).values.push(getNodeVoltage(solution, topology.nodeIndexForRoot(rootId)));
        });

        circuit.components.forEach((component) => {
          if (component.type === "ground") return;
          const props = component.properties || {};
          const leftIndex = topology.nodeIndexForRoot(topology.rootForTerminal(component.id, 0));
          const rightIndex = topology.nodeIndexForRoot(topology.rootForTerminal(component.id, 1));
          const leftVoltage = getNodeVoltage(solution, leftIndex);
          const rightVoltage = getNodeVoltage(solution, rightIndex);
          const voltageDrop = leftVoltage - rightVoltage;
          let current = 0;

          switch (component.type) {
            case "resistor":
            case "lamp":
            case "switch":
            case "diode":
            case "led":
              current = voltageDrop / getResistiveValue(component, semiconductorStates);
              if (!semiconductorStates.get(component.id) && isSemiconductor(component)) current = 0;
              break;
            case "capacitor":
              current = Math.max(Number(props.capacitance) || 0, 1e-12) * (voltageDrop - (capacitorVoltages.get(component.id) || 0)) / dt;
              capacitorVoltages.set(component.id, voltageDrop);
              break;
            case "inductor": {
              const inductance = Math.max(Number(props.inductance) || 0, 1e-9);
              const seriesResistance = Math.max(Number(props.seriesResistance) || 0.02, 1e-6);
              const alpha = inductance / dt;
              current = (voltageDrop + alpha * (inductorCurrents.get(component.id) || 0)) / (seriesResistance + alpha);
              inductorCurrents.set(component.id, current);
              break;
            }
            case "source":
              current = -(solution[voltageSourceIndexById.get(component.id)] || 0);
              break;
            default:
              current = 0;
              break;
          }

          traces.get(formatTraceLabel("current", component)).values.push(current);
        });
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Transient preview failed.",
      };
    }

    return {
      success: true,
      analysis: {
        step: analysisInput.step,
        stop: analysisInput.stop,
        stepSeconds: dt,
        stopSeconds: stop,
      },
      scaleName: "time",
      timeValues,
      traces: Array.from(traces.values()),
    };
  }

  simulation.runTransientAnalysis = runTransientAnalysis;
})(window);
