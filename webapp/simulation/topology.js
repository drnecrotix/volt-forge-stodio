(function initVoltForgeTopology(global) {
  const root = global.VoltForgeWeb || (global.VoltForgeWeb = {});
  const simulation = root.simulation || (root.simulation = {});

  const TERMINAL_COUNT_BY_TYPE = Object.freeze({
    source: 2,
    resistor: 2,
    capacitor: 2,
    inductor: 2,
    diode: 2,
    led: 2,
    lamp: 2,
    switch: 2,
    ground: 1,
  });

  class UnionFind {
    constructor(items) {
      this.parent = new Map();
      this.rank = new Map();
      items.forEach((item) => {
        this.parent.set(item, item);
        this.rank.set(item, 0);
      });
    }

    find(item) {
      const parent = this.parent.get(item);
      if (parent === item) return item;
      const rootId = this.find(parent);
      this.parent.set(item, rootId);
      return rootId;
    }

    union(left, right) {
      const leftRoot = this.find(left);
      const rightRoot = this.find(right);
      if (leftRoot === rightRoot) return;

      const leftRank = this.rank.get(leftRoot) || 0;
      const rightRank = this.rank.get(rightRoot) || 0;
      if (leftRank < rightRank) {
        this.parent.set(leftRoot, rightRoot);
        return;
      }
      if (rightRank < leftRank) {
        this.parent.set(rightRoot, leftRoot);
        return;
      }
      this.parent.set(rightRoot, leftRoot);
      this.rank.set(leftRoot, leftRank + 1);
    }
  }

  function terminalCountForType(type) {
    return TERMINAL_COUNT_BY_TYPE[type] || 0;
  }

  function makeTerminalKey(componentId, terminalIndex) {
    return `${componentId}:${terminalIndex}`;
  }

  function buildCircuitTopology(circuit) {
    const terminalKeys = [];
    const componentTerminals = new Map();

    circuit.components.forEach((component) => {
      const count = terminalCountForType(component.type);
      const terminals = [];
      for (let index = 0; index < count; index += 1) {
        const key = makeTerminalKey(component.id, index);
        terminals.push(key);
        terminalKeys.push(key);
      }
      componentTerminals.set(component.id, terminals);
    });

    const unionFind = new UnionFind(terminalKeys);
    (circuit.wires || []).forEach((wire) => {
      unionFind.union(
        makeTerminalKey(wire.from.componentId, wire.from.terminalIndex),
        makeTerminalKey(wire.to.componentId, wire.to.terminalIndex),
      );
    });

    const groundKeys = circuit.components
      .filter((component) => component.type === "ground")
      .map((component) => makeTerminalKey(component.id, 0));

    if (groundKeys.length > 1) {
      for (let index = 1; index < groundKeys.length; index += 1) {
        unionFind.union(groundKeys[0], groundKeys[index]);
      }
    }

    const groundRoot = groundKeys.length ? unionFind.find(groundKeys[0]) : null;
    const rootToNodeName = new Map();
    const rootToNodeIndex = new Map();
    let nodeCounter = 1;
    let matrixNodeIndex = 0;

    terminalKeys.forEach((key) => {
      const rootId = unionFind.find(key);
      if (rootToNodeName.has(rootId)) return;
      if (groundRoot && rootId === groundRoot) {
        rootToNodeName.set(rootId, "0");
        return;
      }
      rootToNodeName.set(rootId, `N${nodeCounter++}`);
      rootToNodeIndex.set(rootId, matrixNodeIndex++);
    });

    const terminalToRoot = new Map();
    const terminalToNodeName = new Map();
    terminalKeys.forEach((key) => {
      const rootId = unionFind.find(key);
      terminalToRoot.set(key, rootId);
      terminalToNodeName.set(key, rootToNodeName.get(rootId));
    });

    return {
      componentTerminals,
      groundRoot,
      nodeCount: matrixNodeIndex,
      nodeNameForRoot(rootId) {
        return rootToNodeName.get(rootId) || "0";
      },
      nodeIndexForRoot(rootId) {
        return rootToNodeIndex.has(rootId) ? rootToNodeIndex.get(rootId) : -1;
      },
      nodeNameForTerminal(componentId, terminalIndex) {
        return terminalToNodeName.get(makeTerminalKey(componentId, terminalIndex)) || "0";
      },
      rootForTerminal(componentId, terminalIndex) {
        return terminalToRoot.get(makeTerminalKey(componentId, terminalIndex)) || null;
      },
      roots() {
        return Array.from(rootToNodeName.keys());
      },
    };
  }

  simulation.terminalCountForType = terminalCountForType;
  simulation.makeTerminalKey = makeTerminalKey;
  simulation.buildCircuitTopology = buildCircuitTopology;
})(window);
