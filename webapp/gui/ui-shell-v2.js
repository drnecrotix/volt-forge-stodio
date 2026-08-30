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
    const className = `${kind}-collapsed`;
    shell.classList.toggle(className, collapsed);
    if (persist) localStorage.setItem(STORAGE[kind], String(collapsed));

    const panel = kind === "library" ? libraryPanel : contextPanel;
    if (panel) panel.setAttribute("aria-hidden", String(collapsed));
  }

  const narrowViewport = window.matchMedia("(max-width: 1040px)").matches;
  setCollapsed("library", readBoolean(STORAGE.library, true), false);
  setCollapsed("context", readBoolean(STORAGE.context, narrowViewport), false);

  function togglePanel(kind) {
    const collapsed = shell.classList.contains(`${kind}-collapsed`);
    setCollapsed(kind, !collapsed);
  }

  libraryToggleBtn?.addEventListener("click", () => togglePanel("library"));
  statusLibraryBtn?.addEventListener("click", () => togglePanel("library"));
  libraryCloseBtn?.addEventListener("click", () => setCollapsed("library", true));
  contextToggleBtn?.addEventListener("click", () => togglePanel("context"));
  contextCloseBtn?.addEventListener("click", () => setCollapsed("context", true));

  function activateTab(kind, name, persist = true) {
    const tabSelector = `[data-${kind}-tab]`;
    const panelSelector = `[data-${kind}-panel]`;
    const tabs = [...document.querySelectorAll(tabSelector)];
    const panels = [...document.querySelectorAll(panelSelector)];

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
  if (palette) {
    new MutationObserver(filterPalette).observe(palette, { childList: true, subtree: true });
  }

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

  const headingIds = ["componentsHeading", "samplesHeading", "guideHeading", "inspectorHeading", "diagnosticsHeading", "voltagesHeading"];
  headingIds.forEach((id) => {
    const node = document.getElementById(id);
    if (node) new MutationObserver(syncDockLabels).observe(node, { childList: true, characterData: true, subtree: true });
  });

  function bindExampleButtons() {
    document.querySelectorAll(".sample-btn[data-sample]").forEach((button) => {
      if (button.dataset.v2ExampleBound === "true") return;
      button.dataset.v2ExampleBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const sampleName = button.dataset.sample;
        if (!sampleName || typeof window.loadSample !== "function") return;

        window.loadSample(sampleName);
        document.querySelectorAll(".sample-btn[data-sample]").forEach((sampleButton) => {
          const active = sampleButton === button;
          sampleButton.classList.toggle("active", active);
          sampleButton.setAttribute("aria-pressed", String(active));
        });

        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
          if (window.matchMedia("(max-width: 1500px)").matches) {
            setCollapsed("library", true);
          }
        });
      }, true);
    });
  }

  bindExampleButtons();

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      togglePanel("library");
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
      if (wasEmpty && !isEmpty && !shell.classList.contains("context-collapsed")) {
        activateTab("context", "inspector");
      }
      wasEmpty = isEmpty;
    }).observe(inspector, { attributes: true, childList: true, subtree: true, attributeFilter: ["class"] });
  }

  shell.dataset.uiReady = "true";
})();
