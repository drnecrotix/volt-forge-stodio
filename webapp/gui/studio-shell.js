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
  const workspaceStage = document.getElementById("workspaceStage");
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
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");

  if (!workspaceWrap || !workspaceStage || !workspaceSvg || !componentLayer) return;

  const initialViewBox = workspaceSvg.viewBox.baseVal;
  const WORLD = {
    width: initialViewBox.width || 16000,
    height: initialViewBox.height || 12000,
  };

  const camera = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    zoom: 1,
  };

  let applyingCamera = false;
  let pendingFocusMode = null;
  let lastComponentCount = componentLayer.querySelectorAll(".component").length;
  let spaceHeld = false;
  let panSession = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    requestAnimationFrame(applyCamera);
  }

  function setPanelCollapsed(kind, collapsed, persist = true) {
    const isAssets = kind === "assets";
    shell.classList.toggle(isAssets ? "assets-collapsed" : "properties-collapsed", collapsed);
    const panel = isAssets ? assetPanel : propertiesPanel;
    const toggle = isAssets ? assetsToggleBtn : propertiesToggleBtn;
    panel?.setAttribute("aria-hidden", String(collapsed));
    toggle?.classList.toggle("active", !collapsed);
    if (persist) {
      localStorage.setItem(isAssets ? STORAGE.assetsCollapsed : STORAGE.propertiesCollapsed, String(collapsed));
    }
    requestAnimationFrame(applyCamera);
  }

  function togglePanel(kind) {
    const className = kind === "assets" ? "assets-collapsed" : "properties-collapsed";
    setPanelCollapsed(kind, !shell.classList.contains(className));
  }

  function activateAssetTab(name, persist = true) {
    setPanelCollapsed("assets", false);
    activateGroup(
      "[data-studio-tab]",
      "[data-studio-panel]",
      "studioTab",
      "studioPanel",
      name,
      persist ? STORAGE.assetTab : null,
    );
  }

  function activatePropertyTab(name, persist = true) {
    setPanelCollapsed("properties", false);
    activateGroup(
      "[data-property-tab]",
      "[data-property-panel]",
      "propertyTab",
      "propertyPanel",
      name,
      persist ? STORAGE.propertyTab : null,
    );
  }

  setPanelCollapsed("assets", storedBoolean(STORAGE.assetsCollapsed, false), false);
  setPanelCollapsed("properties", storedBoolean(STORAGE.propertiesCollapsed, false), false);

  document.querySelectorAll("[data-studio-tab]").forEach((tab) => {
    tab.addEventListener("click", () => activateAssetTab(tab.dataset.studioTab));
  });
  document.querySelectorAll("[data-property-tab]").forEach((tab) => {
    tab.addEventListener("click", () => activatePropertyTab(tab.dataset.propertyTab));
  });

  activateGroup(
    "[data-studio-tab]",
    "[data-studio-panel]",
    "studioTab",
    "studioPanel",
    localStorage.getItem(STORAGE.assetTab) || "components",
    null,
  );
  activateGroup(
    "[data-property-tab]",
    "[data-property-panel]",
    "propertyTab",
    "propertyPanel",
    localStorage.getItem(STORAGE.propertyTab) || "inspector",
    null,
  );

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
    if (source) {
      new MutationObserver(syncTabLabels).observe(source, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
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

  const hasOpenMenu = () => menuPopovers.some((menu) => !menu.hidden);

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
    else if (action === "fit") fitCircuit();
    else if (action === "rotate") proxyClick("rotateBtn");
    else if (action === "delete") {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    }
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

  function filterPalette() {
    if (!componentSearch || !palette) return;
    const query = componentSearch.value.trim().toLocaleLowerCase();
    palette.querySelectorAll(".palette-card").forEach((card) => {
      card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase().includes(query);
    });
  }

  componentSearch?.addEventListener("input", filterPalette);
  if (palette) {
    new MutationObserver(filterPalette).observe(palette, { childList: true, subtree: true });
  }

  const TOOL_ICONS = { select: "↖", wire: "⌁", pencil: "✎", pan: "✋" };

  function syncActiveTool() {
    const active = document.querySelector("[data-tool].active");
    if (!active) return;
    if (studioToolLabel) studioToolLabel.textContent = active.textContent.trim() || active.title || "Tool";
    if (studioToolIcon) studioToolIcon.textContent = TOOL_ICONS[active.dataset.tool] || "•";
  }

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => requestAnimationFrame(syncActiveTool));
    new MutationObserver(syncActiveTool).observe(button, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  syncActiveTool();

  function syncSelectionMirror() {
    if (studioSelectionMirror && selectionSummary) {
      studioSelectionMirror.textContent = selectionSummary.textContent.trim();
    }
  }

  syncSelectionMirror();
  if (selectionSummary) {
    new MutationObserver(syncSelectionMirror).observe(selectionSummary, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function cameraViewport() {
    const width = Math.max(1, workspaceWrap.clientWidth);
    const height = Math.max(1, workspaceWrap.clientHeight);
    return {
      width: width / camera.zoom,
      height: height / camera.zoom,
    };
  }

  function clampCamera() {
    const view = cameraViewport();
    const halfW = Math.min(WORLD.width / 2, view.width / 2);
    const halfH = Math.min(WORLD.height / 2, view.height / 2);
    camera.x = clamp(camera.x, halfW, Math.max(halfW, WORLD.width - halfW));
    camera.y = clamp(camera.y, halfH, Math.max(halfH, WORLD.height - halfH));
  }

  function updateZoomReadout() {
    if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  function applyCamera() {
    if (applyingCamera || !workspaceWrap.clientWidth || !workspaceWrap.clientHeight) return;
    applyingCamera = true;
    clampCamera();
    const view = cameraViewport();
    const x = camera.x - view.width / 2;
    const y = camera.y - view.height / 2;

    workspaceWrap.style.overflow = "hidden";
    workspaceStage.style.width = "100%";
    workspaceStage.style.height = "100%";
    workspaceStage.style.minWidth = "0";
    workspaceStage.style.minHeight = "0";
    workspaceSvg.style.width = "100%";
    workspaceSvg.style.height = "100%";
    workspaceSvg.style.maxWidth = "none";
    workspaceSvg.setAttribute("viewBox", `${x} ${y} ${view.width} ${view.height}`);
    workspaceWrap.scrollLeft = 0;
    workspaceWrap.scrollTop = 0;
    updateZoomReadout();
    applyingCamera = false;
  }

  function componentPoint(component) {
    const transform = component?.getAttribute("transform") || "";
    const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*[ ,]\s*(-?\d+(?:\.\d+)?)/i);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }

  function getCircuitBounds() {
    const points = [...componentLayer.querySelectorAll(".component")]
      .map(componentPoint)
      .filter(Boolean);
    if (!points.length) return null;

    const padding = 150;
    const minX = Math.min(...points.map((point) => point.x)) - padding;
    const maxX = Math.max(...points.map((point) => point.x)) + padding;
    const minY = Math.min(...points.map((point) => point.y)) - padding;
    const maxY = Math.max(...points.map((point) => point.y)) + padding;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(260, maxX - minX),
      height: Math.max(220, maxY - minY),
    };
  }

  function fitCircuit() {
    const bounds = getCircuitBounds();
    if (!bounds) {
      camera.x = WORLD.width / 2;
      camera.y = WORLD.height / 2;
      camera.zoom = 1;
      applyCamera();
      return;
    }

    const availableWidth = Math.max(1, workspaceWrap.clientWidth - 80);
    const availableHeight = Math.max(1, workspaceWrap.clientHeight - 80);
    camera.x = (bounds.minX + bounds.maxX) / 2;
    camera.y = (bounds.minY + bounds.maxY) / 2;
    camera.zoom = clamp(
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
      0.2,
      2.5,
    );
    applyCamera();
  }

  function focusSelectedComponent() {
    const selected = componentLayer.querySelector(".component.selected") || componentLayer.querySelector(".component");
    const point = componentPoint(selected);
    if (!point) {
      fitCircuit();
      return;
    }
    camera.x = point.x;
    camera.y = point.y;
    camera.zoom = clamp(Math.max(camera.zoom, 1), 0.2, 2.5);
    applyCamera();
  }

  function zoomAt(clientX, clientY, multiplier) {
    const rect = workspaceWrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const before = cameraViewport();
    const left = camera.x - before.width / 2;
    const top = camera.y - before.height / 2;
    const rx = clamp((clientX - rect.left) / rect.width, 0, 1);
    const ry = clamp((clientY - rect.top) / rect.height, 0, 1);
    const anchorX = left + before.width * rx;
    const anchorY = top + before.height * ry;

    camera.zoom = clamp(camera.zoom * multiplier, 0.2, 4);
    const after = cameraViewport();
    camera.x = anchorX - (rx - 0.5) * after.width;
    camera.y = anchorY - (ry - 0.5) * after.height;
    applyCamera();
  }

  fitCanvasBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    fitCircuit();
  });

  [
    [zoomOutBtn, 1 / 1.15],
    [zoomInBtn, 1.15],
  ].forEach(([button, multiplier]) => {
    button?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = workspaceWrap.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, multiplier);
    }, true);
  });

  zoomResetBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    camera.zoom = 1;
    applyCamera();
  }, true);

  workspaceWrap.addEventListener("wheel", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { capture: true, passive: false });

  function panToolActive() {
    return Boolean(document.querySelector("[data-tool='pan'].active"));
  }

  workspaceWrap.addEventListener("pointerdown", (event) => {
    if (!(panToolActive() || spaceHeld) || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panSession = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    workspaceWrap.classList.add("panning");
    workspaceWrap.setPointerCapture?.(event.pointerId);
  }, true);

  window.addEventListener("pointermove", (event) => {
    if (!panSession || event.pointerId !== panSession.pointerId) return;
    const dx = event.clientX - panSession.clientX;
    const dy = event.clientY - panSession.clientY;
    camera.x = panSession.cameraX - dx / camera.zoom;
    camera.y = panSession.cameraY - dy / camera.zoom;
    applyCamera();
  }, true);

  function finishPan(event) {
    if (!panSession || (event.pointerId !== undefined && event.pointerId !== panSession.pointerId)) return;
    workspaceWrap.releasePointerCapture?.(panSession.pointerId);
    panSession = null;
    workspaceWrap.classList.remove("panning");
  }

  window.addEventListener("pointerup", finishPan, true);
  window.addEventListener("pointercancel", finishPan, true);

  function scheduleFocus(mode) {
    pendingFocusMode = mode;
    const run = () => {
      if (!pendingFocusMode) return;
      const requested = pendingFocusMode;
      pendingFocusMode = null;
      if (requested === "selected") focusSelectedComponent();
      else fitCircuit();
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    window.setTimeout(run, 80);
    window.setTimeout(run, 180);
  }

  // Capture intent before app.js performs its synchronous state/render update.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".sample-btn[data-sample]")) {
      pendingFocusMode = "circuit";
      return;
    }
    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      pendingFocusMode = "selected";
    }
  }, true);

  document.addEventListener("click", (event) => {
    const sampleButton = event.target.closest?.(".sample-btn[data-sample]");
    if (sampleButton) {
      document.querySelectorAll(".sample-btn[data-sample]").forEach((candidate) => {
        candidate.classList.toggle("active", candidate === sampleButton);
      });
      scheduleFocus("circuit");
      return;
    }
    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      scheduleFocus("selected");
    }
  });

  new MutationObserver(() => {
    const count = componentLayer.querySelectorAll(".component").length;
    if (pendingFocusMode) {
      scheduleFocus(pendingFocusMode);
    } else if (count !== lastComponentCount) {
      lastComponentCount = count;
      if (count === 0) {
        camera.x = WORLD.width / 2;
        camera.y = WORLD.height / 2;
        camera.zoom = 1;
        applyCamera();
      }
    }
    lastComponentCount = count;
  }).observe(componentLayer, { childList: true, subtree: true });

  const inspector = document.getElementById("inspector");
  if (inspector) {
    new MutationObserver(() => {
      if (!inspector.classList.contains("empty-state")) activatePropertyTab("inspector", false);
    }).observe(inspector, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (event.code === "Space" && !typing) {
      spaceHeld = true;
      workspaceWrap.classList.add("pan-mode");
    }

    if (event.key === "Escape") {
      closeMenus();
      return;
    }
    if (typing) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      togglePanel("assets");
      return;
    }

    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      fitCircuit();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    spaceHeld = false;
    if (!panToolActive()) workspaceWrap.classList.remove("pan-mode");
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => requestAnimationFrame(applyCamera));
  });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (componentLayer.querySelector(".component")) fitCircuit();
      else applyCamera();
    });
  });

  shell.dataset.studioReady = "true";
  shell.dataset.visualTestReady = "true";
})();
