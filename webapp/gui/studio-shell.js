(() => {
  "use strict";

  const shell = document.getElementById("studioShell");
  if (!shell) return;

  const STORAGE = {
    assetTab: "voltforge.studio.assetTab",
    propertyTab: "voltforge.studio.propertyTab",
    assetsCollapsed: "voltforge.studio.assetsCollapsed",
    propertiesCollapsed: "voltforge.studio.propertiesCollapsed",
  };

  const workspaceWrap = document.getElementById("workspaceWrap");
  const workspaceSvg = document.getElementById("workspace");
  const componentLayer = document.getElementById("componentLayer");
  const assetPanel = document.getElementById("assetPanel");
  const propertiesPanel = document.getElementById("propertiesPanel");
  const assetsToggleBtn = document.getElementById("assetsToggleBtn");
  const propertiesToggleBtn = document.getElementById("propertiesToggleBtn");
  const fitCanvasBtn = document.getElementById("fitCanvasBtn");
  const componentSearch = document.getElementById("componentSearch");
  const palette = document.getElementById("palette");
  const selectionSummary = document.getElementById("selectionSummary");
  const studioSelectionMirror = document.getElementById("studioSelectionMirror");
  const studioToolLabel = document.getElementById("studioToolLabel");
  const studioToolIcon = document.getElementById("studioToolIcon");

  function storedBoolean(key, fallback = false) {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  }

  function activateGroup(tabSelector, panelSelector, dataKey, panelKey, name, storageKey) {
    const tabs = [...document.querySelectorAll(tabSelector)];
    const panels = [...document.querySelectorAll(panelSelector)];
    if (!tabs.some((tab) => tab.dataset[dataKey] === name)) return;
    tabs.forEach((tab) => {
      const active = tab.dataset[dataKey] === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.dataset[panelKey] === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    if (storageKey) localStorage.setItem(storageKey, name);
  }

  function setPanelCollapsed(kind, collapsed, persist = true) {
    const isAssets = kind === "assets";
    shell.classList.toggle(isAssets ? "assets-collapsed" : "properties-collapsed", collapsed);
    const panel = isAssets ? assetPanel : propertiesPanel;
    const toggle = isAssets ? assetsToggleBtn : propertiesToggleBtn;
    panel?.setAttribute("aria-hidden", String(collapsed));
    toggle?.classList.toggle("active", !collapsed);
    if (persist) localStorage.setItem(isAssets ? STORAGE.assetsCollapsed : STORAGE.propertiesCollapsed, String(collapsed));
  }

  function togglePanel(kind) {
    const className = kind === "assets" ? "assets-collapsed" : "properties-collapsed";
    setPanelCollapsed(kind, !shell.classList.contains(className));
  }

  function activateAssetTab(name, persist = true) {
    setPanelCollapsed("assets", false);
    activateGroup("[data-studio-tab]", "[data-studio-panel]", "studioTab", "studioPanel", name, persist ? STORAGE.assetTab : null);
  }

  function activatePropertyTab(name, persist = true) {
    setPanelCollapsed("properties", false);
    activateGroup("[data-property-tab]", "[data-property-panel]", "propertyTab", "propertyPanel", name, persist ? STORAGE.propertyTab : null);
  }

  setPanelCollapsed("assets", storedBoolean(STORAGE.assetsCollapsed, false), false);
  setPanelCollapsed("properties", storedBoolean(STORAGE.propertiesCollapsed, false), false);

  document.querySelectorAll("[data-studio-tab]").forEach((tab) => tab.addEventListener("click", () => activateAssetTab(tab.dataset.studioTab)));
  document.querySelectorAll("[data-property-tab]").forEach((tab) => tab.addEventListener("click", () => activatePropertyTab(tab.dataset.propertyTab)));
  activateGroup("[data-studio-tab]", "[data-studio-panel]", "studioTab", "studioPanel", localStorage.getItem(STORAGE.assetTab) || "components", null);
  activateGroup("[data-property-tab]", "[data-property-panel]", "propertyTab", "propertyPanel", localStorage.getItem(STORAGE.propertyTab) || "inspector", null);

  const headingBindings = [
    ["componentsHeading", "[data-studio-tab='components']"],
    ["samplesHeading", "[data-studio-tab='samples']"],
    ["guideHeading", "[data-studio-tab='guide']"],
    ["inspectorHeading", "[data-property-tab='inspector']"],
    ["diagnosticsHeading", "[data-property-tab='diagnostics']"],
    ["voltagesHeading", "[data-property-tab='voltages']"],
  ];

  function syncTabLabels() {
    headingBindings.forEach(([sourceId, targetSelector]) => {
      const source = document.getElementById(sourceId);
      const target = document.querySelector(targetSelector);
      if (source && target && source.textContent.trim()) target.textContent = source.textContent.trim();
    });
  }
  syncTabLabels();
  headingBindings.forEach(([sourceId]) => {
    const source = document.getElementById(sourceId);
    if (source) new MutationObserver(syncTabLabels).observe(source, { childList: true, characterData: true, subtree: true });
  });

  const menuTriggers = [...document.querySelectorAll("[data-menu-trigger]")];
  const menuPopovers = [...document.querySelectorAll("[data-menu]")];

  function closeMenus() {
    menuTriggers.forEach((trigger) => {
      trigger.classList.remove("active");
      trigger.setAttribute("aria-expanded", "false");
    });
    menuPopovers.forEach((menu) => { menu.hidden = true; });
  }

  function openMenu(name) {
    closeMenus();
    const trigger = document.querySelector(`[data-menu-trigger='${name}']`);
    const menu = document.querySelector(`[data-menu='${name}']`);
    if (!trigger || !menu) return;
    trigger.classList.add("active");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
  }

  function hasOpenMenu() {
    return menuPopovers.some((menu) => !menu.hidden);
  }

  menuTriggers.forEach((trigger) => {
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const name = trigger.dataset.menuTrigger;
      const menu = document.querySelector(`[data-menu='${name}']`);
      if (menu && !menu.hidden) closeMenus(); else openMenu(name);
    });
    trigger.addEventListener("pointerenter", () => {
      if (hasOpenMenu()) openMenu(trigger.dataset.menuTrigger);
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".menu-root")) closeMenus();
  });

  function proxyClick(id) {
    const target = document.getElementById(id);
    if (!target) return false;
    target.click();
    return true;
  }

  document.addEventListener("click", (event) => {
    const proxy = event.target.closest?.("[data-proxy-click]");
    if (!proxy) return;
    event.preventDefault();
    proxyClick(proxy.dataset.proxyClick);
    closeMenus();
  });

  function runMenuAction(action) {
    if (action === "toggle-assets") togglePanel("assets");
    else if (action === "toggle-properties") togglePanel("properties");
    else if (action === "guide" || action === "shortcuts") activateAssetTab("guide");
    else if (action === "fit") focusCircuit();
    else if (action === "rotate") proxyClick("rotateBtn");
    else if (action === "delete") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest?.("[data-menu-action]");
    if (!actionTarget) return;
    event.preventDefault();
    runMenuAction(actionTarget.dataset.menuAction);
    closeMenus();
  });

  assetsToggleBtn?.addEventListener("click", () => togglePanel("assets"));
  propertiesToggleBtn?.addEventListener("click", () => togglePanel("properties"));
  fitCanvasBtn?.addEventListener("click", focusCircuit);

  function filterPalette() {
    if (!componentSearch || !palette) return;
    const query = componentSearch.value.trim().toLocaleLowerCase();
    palette.querySelectorAll(".palette-card").forEach((card) => {
      card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase().includes(query);
    });
  }
  componentSearch?.addEventListener("input", filterPalette);
  if (palette) new MutationObserver(filterPalette).observe(palette, { childList: true, subtree: true });

  const TOOL_ICONS = { select: "↖", wire: "⌁", pencil: "✎", pan: "✋" };
  function syncActiveTool() {
    const active = document.querySelector("[data-tool].active");
    if (!active) return;
    if (studioToolLabel) studioToolLabel.textContent = active.textContent.trim() || active.title || "Tool";
    if (studioToolIcon) studioToolIcon.textContent = TOOL_ICONS[active.dataset.tool] || "•";
  }
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => requestAnimationFrame(syncActiveTool));
    new MutationObserver(syncActiveTool).observe(button, { attributes: true, attributeFilter: ["class"] });
  });
  syncActiveTool();

  function syncSelectionMirror() {
    if (studioSelectionMirror && selectionSummary) studioSelectionMirror.textContent = selectionSummary.textContent.trim();
  }
  syncSelectionMirror();
  if (selectionSummary) new MutationObserver(syncSelectionMirror).observe(selectionSummary, { childList: true, characterData: true, subtree: true });

  function parseComponentPosition(component) {
    const transform = component?.getAttribute("transform") || "";
    const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*[ ,]\s*(-?\d+(?:\.\d+)?)/i);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }

  function nativeFocus(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !workspaceWrap) return false;
    if (typeof window.focusViewportOnPoint === "function") {
      window.focusViewportOnPoint(x, y);
      return true;
    }
    if (!workspaceSvg) return false;
    const viewBox = workspaceSvg.viewBox?.baseVal;
    const renderedWidth = parseFloat(workspaceSvg.style.width) || workspaceSvg.clientWidth;
    const renderedHeight = parseFloat(workspaceSvg.style.height) || workspaceSvg.clientHeight;
    if (!viewBox?.width || !viewBox?.height || !renderedWidth || !renderedHeight) return false;
    workspaceWrap.scrollLeft = Math.max(0, x * (renderedWidth / viewBox.width) - workspaceWrap.clientWidth / 2);
    workspaceWrap.scrollTop = Math.max(0, y * (renderedHeight / viewBox.height) - workspaceWrap.clientHeight / 2);
    return true;
  }

  function focusSelectedComponent() {
    const selected = componentLayer?.querySelector(".component.selected") || componentLayer?.querySelector(".component");
    const point = parseComponentPosition(selected);
    if (point) nativeFocus(point.x, point.y);
  }

  function focusCircuit() {
    const points = [...(componentLayer?.querySelectorAll(".component") || [])].map(parseComponentPosition).filter(Boolean);
    if (!points.length) {
      nativeFocus((workspaceSvg?.viewBox?.baseVal?.width || 16000) / 2, (workspaceSvg?.viewBox?.baseVal?.height || 12000) / 2);
      return;
    }
    nativeFocus(
      (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
      (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2,
    );
  }

  let pendingFocusMode = null;
  let focusTimer = 0;
  function scheduleCanvasFocus(mode) {
    pendingFocusMode = mode;
    window.clearTimeout(focusTimer);
    const run = () => pendingFocusMode === "selected" ? focusSelectedComponent() : focusCircuit();
    requestAnimationFrame(() => requestAnimationFrame(run));
    focusTimer = window.setTimeout(run, 90);
    window.setTimeout(() => {
      run();
      pendingFocusMode = null;
    }, 220);
  }

  document.addEventListener("click", (event) => {
    const sampleButton = event.target.closest?.(".sample-btn[data-sample]");
    if (sampleButton) {
      document.querySelectorAll(".sample-btn[data-sample]").forEach((candidate) => candidate.classList.toggle("active", candidate === sampleButton));
      scheduleCanvasFocus("circuit");
      return;
    }
    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) scheduleCanvasFocus("selected");
  });

  if (componentLayer) new MutationObserver(() => { if (pendingFocusMode) scheduleCanvasFocus(pendingFocusMode); }).observe(componentLayer, { childList: true, subtree: true });

  const inspector = document.getElementById("inspector");
  if (inspector) new MutationObserver(() => {
    if (!inspector.classList.contains("empty-state")) activatePropertyTab("inspector", false);
  }).observe(inspector, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === "Escape") { closeMenus(); return; }
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      togglePanel("assets");
      return;
    }
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      focusCircuit();
    }
  });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;
  shell.dataset.studioReady = "true";
})();
