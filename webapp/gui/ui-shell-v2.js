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

  let pendingCanvasFocus = null;

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

  function ensureCanvasExtent() {
    if (!workspaceSvg || !workspaceStage || !workspaceWrap) return;
    const svgWidth = parseFloat(workspaceSvg.style.width) || workspaceSvg.getBoundingClientRect().width;
    const svgHeight = parseFloat(workspaceSvg.style.height) || workspaceSvg.getBoundingClientRect().height;
    if (svgWidth > 0) workspaceStage.style.width = `${Math.max(svgWidth + 600, workspaceWrap.clientWidth)}px`;
    if (svgHeight > 0) workspaceStage.style.height = `${Math.max(svgHeight + 600, workspaceWrap.clientHeight)}px`;
  }

  function afterLayout(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  }

  function revealRenderedComponent(component) {
    if (!component || !workspaceWrap) return false;
    ensureCanvasExtent();

    try {
      component.scrollIntoView({
        behavior: "auto",
        block: "center",
        inline: "center",
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function focusSelectedComponent() {
    const selected = componentLayer?.querySelector(".component.selected") || componentLayer?.querySelector(".component");
    if (revealRenderedComponent(selected)) return;

    const components = [...(componentLayer?.querySelectorAll(".component") || [])];
    if (components.length) revealRenderedComponent(components[0]);
  }

  function focusCircuit() {
    const selected = componentLayer?.querySelector(".component.selected");
    if (revealRenderedComponent(selected)) return;

    const components = [...(componentLayer?.querySelectorAll(".component") || [])];
    if (!components.length) return;

    // Samples are compact, so centering the first rendered component keeps the
    // whole starter circuit inside the viewport at the default 100% zoom.
    revealRenderedComponent(components[0]);
  }

  function requestCanvasFocus(mode) {
    pendingCanvasFocus = mode;
  }

  function flushCanvasFocus() {
    if (!pendingCanvasFocus) return;
    const mode = pendingCanvasFocus;
    pendingCanvasFocus = null;
    afterLayout(() => {
      ensureCanvasExtent();
      if (mode === "selected") focusSelectedComponent();
      else focusCircuit();
    });
  }

  // Capture the intent before app.js handles the click and rebuilds the SVG.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".sample-btn[data-sample]")) {
      requestCanvasFocus("circuit");
      return;
    }
    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      requestCanvasFocus("selected");
    }
  }, true);

  if (componentLayer) {
    new MutationObserver(() => {
      if (pendingCanvasFocus) flushCanvasFocus();
    }).observe(componentLayer, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const sampleButton = event.target.closest?.(".sample-btn[data-sample]");
    if (sampleButton) {
      document.querySelectorAll(".sample-btn[data-sample]").forEach((button) => {
        const active = button === sampleButton;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });

      // Fallback in case the render did not create a mutation in this frame.
      afterLayout(() => {
        if (pendingCanvasFocus) flushCanvasFocus();
        if (window.matchMedia("(max-width: 1500px)").matches) setCollapsed("library", true);
      });
      return;
    }

    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      afterLayout(() => {
        if (pendingCanvasFocus) flushCanvasFocus();
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
      afterLayout(focusCircuit);
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
    focusCircuit();
  });

  shell.dataset.uiReady = "true";
})();
