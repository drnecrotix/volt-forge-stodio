(() => {
  "use strict";

  const shell = document.getElementById("appShell");
  if (!shell) return;

  const libraryPanel = document.getElementById("libraryPanel");
  const contextPanel = document.getElementById("contextPanel");
  const libraryToggleBtn = document.getElementById("libraryToggleBtn");
  const libraryCloseBtn = document.getElementById("libraryCloseBtn");
  const statusLibraryBtn = document.getElementById("statusLibraryBtn");
  const contextToggleBtn = document.getElementById("contextToggleBtn");
  const contextCloseBtn = document.getElementById("contextCloseBtn");
  const guideToggleBtn = document.getElementById("guideToggleBtn");
  const componentSearch = document.getElementById("componentSearch");
  const palette = document.getElementById("palette");
  const simulateBtn = document.getElementById("simulateBtn");
  const runBtn = document.getElementById("v2RunBtn");
  const workspaceWrap = document.getElementById("workspaceWrap");
  const workspaceStage = document.getElementById("workspaceStage");
  const workspaceSvg = document.getElementById("workspace");
  const componentLayer = document.getElementById("componentLayer");

  const STORAGE = {
    library: "voltforge.v2.libraryCollapsed",
    context: "voltforge.v2.contextCollapsed",
    libraryTab: "voltforge.v2.libraryTab",
    contextTab: "voltforge.v2.contextTab",
  };

  function readBoolean(key, fallback) {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === "true";
  }

  function setCollapsed(kind, collapsed, persist = true) {
    shell.classList.toggle(`${kind}-collapsed`, collapsed);
    if (persist) localStorage.setItem(STORAGE[kind], String(collapsed));
    const panel = kind === "library" ? libraryPanel : contextPanel;
    panel?.setAttribute("aria-hidden", String(collapsed));
  }

  const narrowViewport = window.matchMedia("(max-width: 1040px)").matches;
  setCollapsed("library", readBoolean(STORAGE.library, true), false);
  setCollapsed("context", readBoolean(STORAGE.context, narrowViewport), false);

  function togglePanel(kind) {
    setCollapsed(kind, !shell.classList.contains(`${kind}-collapsed`));
  }

  libraryToggleBtn?.addEventListener("click", () => togglePanel("library"));
  statusLibraryBtn?.addEventListener("click", () => togglePanel("library"));
  libraryCloseBtn?.addEventListener("click", () => setCollapsed("library", true));
  contextToggleBtn?.addEventListener("click", () => togglePanel("context"));
  contextCloseBtn?.addEventListener("click", () => setCollapsed("context", true));

  function activateTab(kind, name, persist = true) {
    const tabs = [...document.querySelectorAll(`[data-${kind}-tab]`)];
    const panels = [...document.querySelectorAll(`[data-${kind}-panel]`)];
    if (!tabs.some((tab) => tab.dataset[`${kind}Tab`] === name)) return;

    tabs.forEach((tab) => {
      const active = tab.dataset[`${kind}Tab`] === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      const active = panel.dataset[`${kind}Panel`] === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });

    if (persist) localStorage.setItem(STORAGE[`${kind}Tab`], name);
  }

  document.querySelectorAll("[data-library-tab]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      setCollapsed("library", false);
      activateTab("library", tab.dataset.libraryTab);
    });
  });

  document.querySelectorAll("[data-context-tab]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      setCollapsed("context", false);
      activateTab("context", tab.dataset.contextTab);
    });
  });

  activateTab("library", localStorage.getItem(STORAGE.libraryTab) || "components", false);
  activateTab("context", localStorage.getItem(STORAGE.contextTab) || "inspector", false);

  guideToggleBtn?.addEventListener("click", () => {
    setCollapsed("library", false);
    activateTab("library", "guide");
  });

  function filterPalette() {
    if (!palette || !componentSearch) return;
    const query = componentSearch.value.trim().toLocaleLowerCase();
    palette.querySelectorAll(".palette-card").forEach((card) => {
      card.hidden = query.length > 0 && !card.textContent.toLocaleLowerCase().includes(query);
    });
  }

  componentSearch?.addEventListener("input", filterPalette);
  if (palette) new MutationObserver(filterPalette).observe(palette, { childList: true, subtree: true });

  runBtn?.addEventListener("click", () => simulateBtn?.click());

  function syncRunLabel() {
    if (!runBtn || !simulateBtn) return;
    const label = runBtn.querySelector("span:last-child");
    if (label) label.textContent = simulateBtn.textContent.trim() || "Run";
  }

  syncRunLabel();
  if (simulateBtn) {
    new MutationObserver(syncRunLabel).observe(simulateBtn, { childList: true, characterData: true, subtree: true });
  }

  const labelBindings = [...document.querySelectorAll("[data-label-source]")];
  function syncDockLabels() {
    labelBindings.forEach((target) => {
      const source = document.getElementById(target.dataset.labelSource);
      if (source?.textContent.trim()) target.textContent = source.textContent.trim();
    });
  }
  syncDockLabels();

  ["componentsHeading", "samplesHeading", "guideHeading", "inspectorHeading", "diagnosticsHeading", "voltagesHeading"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) new MutationObserver(syncDockLabels).observe(node, { childList: true, characterData: true, subtree: true });
  });

  function parseComponentPosition(component) {
    const transform = component?.getAttribute("transform") || "";
    const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*[ ,]\s*(-?\d+(?:\.\d+)?)/i);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  function ensureCanvasExtent() {
    if (!workspaceSvg || !workspaceStage || !workspaceWrap) return;
    const svgWidth = parseFloat(workspaceSvg.style.width) || workspaceSvg.getBoundingClientRect().width;
    const svgHeight = parseFloat(workspaceSvg.style.height) || workspaceSvg.getBoundingClientRect().height;
    if (svgWidth > 0) workspaceStage.style.width = `${Math.max(svgWidth + 600, workspaceWrap.clientWidth)}px`;
    if (svgHeight > 0) workspaceStage.style.height = `${Math.max(svgHeight + 600, workspaceWrap.clientHeight)}px`;
  }

  function focusWorldPoint(x, y) {
    if (!workspaceSvg || !workspaceWrap || !Number.isFinite(x) || !Number.isFinite(y)) return;
    ensureCanvasExtent();
    const viewBox = workspaceSvg.viewBox?.baseVal;
    if (!viewBox?.width || !viewBox?.height) return;

    const svgRect = workspaceSvg.getBoundingClientRect();
    const wrapRect = workspaceWrap.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;

    const scaleX = svgRect.width / viewBox.width;
    const scaleY = svgRect.height / viewBox.height;
    const originX = svgRect.left - wrapRect.left + workspaceWrap.scrollLeft;
    const originY = svgRect.top - wrapRect.top + workspaceWrap.scrollTop;
    const renderedX = originX + (x - viewBox.x) * scaleX;
    const renderedY = originY + (y - viewBox.y) * scaleY;
    const maxLeft = Math.max(0, workspaceWrap.scrollWidth - workspaceWrap.clientWidth);
    const maxTop = Math.max(0, workspaceWrap.scrollHeight - workspaceWrap.clientHeight);

    workspaceWrap.scrollLeft = Math.max(0, Math.min(maxLeft, renderedX - workspaceWrap.clientWidth / 2));
    workspaceWrap.scrollTop = Math.max(0, Math.min(maxTop, renderedY - workspaceWrap.clientHeight / 2));
  }

  function focusSelectedComponent() {
    const selected = componentLayer?.querySelector(".component.selected") || componentLayer?.querySelector(".component");
    const point = parseComponentPosition(selected);
    if (point) focusWorldPoint(point.x, point.y);
  }

  function focusCircuitCenter() {
    const components = [...(componentLayer?.querySelectorAll(".component") || [])];
    const points = components.map(parseComponentPosition).filter(Boolean);
    if (!points.length) return;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    focusWorldPoint((minX + maxX) / 2, (minY + maxY) / 2);
  }

  function afterLayout(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  }

  document.addEventListener("click", (event) => {
    const sampleButton = event.target.closest?.(".sample-btn[data-sample]");
    if (sampleButton) {
      document.querySelectorAll(".sample-btn[data-sample]").forEach((button) => {
        const active = button === sampleButton;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      afterLayout(() => {
        ensureCanvasExtent();
        focusCircuitCenter();
        if (window.matchMedia("(max-width: 1500px)").matches) setCollapsed("library", true);
      });
      return;
    }

    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      afterLayout(() => {
        ensureCanvasExtent();
        focusSelectedComponent();
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      togglePanel("library");
      return;
    }

    if (!typing && event.key.toLowerCase() === "f") {
      event.preventDefault();
      afterLayout(focusCircuitCenter);
      return;
    }

    if (event.key === "Escape" && !typing && window.matchMedia("(max-width: 1040px)").matches) {
      setCollapsed("library", true);
      setCollapsed("context", true);
    }
  });

  const inspector = document.getElementById("inspector");
  if (inspector) {
    let wasEmpty = inspector.classList.contains("empty-state");
    new MutationObserver(() => {
      const isEmpty = inspector.classList.contains("empty-state");
      if (wasEmpty && !isEmpty && !shell.classList.contains("context-collapsed")) activateTab("context", "inspector");
      wasEmpty = isEmpty;
    }).observe(inspector, { attributes: true, childList: true, subtree: true, attributeFilter: ["class"] });
  }

  window.addEventListener("resize", () => afterLayout(ensureCanvasExtent));
  afterLayout(() => {
    ensureCanvasExtent();
    focusCircuitCenter();
  });

  shell.dataset.uiReady = "true";
})();
