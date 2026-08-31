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
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const clearBtn = document.getElementById("clearBtn");
  const documentTabsHost = document.querySelector(".canvas-document-tabs");

  if (!workspaceWrap || !workspaceSvg || !componentLayer) return;

  function afterLayout(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  }

  function storedBoolean(key, fallback = false) {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  }

  /* Panels */
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
    if (persist) {
      localStorage.setItem(isAssets ? STORAGE.assetsCollapsed : STORAGE.propertiesCollapsed, String(collapsed));
    }
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

  assetsToggleBtn?.addEventListener("click", () => togglePanel("assets"));
  propertiesToggleBtn?.addEventListener("click", () => togglePanel("properties"));

  /* Translation mirrors */
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

  /* Menus */
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
      if (menu && !menu.hidden) closeMenus();
      else openMenu(name);
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

  /* Native canvas fallback - app.js remains the only owner of viewBox/zoom/pan. */
  function parseComponentPosition(component) {
    const transform = component?.getAttribute("transform") || "";
    const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*[ ,]\s*(-?\d+(?:\.\d+)?)/i);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }

  function centerNativeViewportOnPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const viewBox = workspaceSvg.viewBox?.baseVal;
    const renderedWidth = parseFloat(workspaceSvg.style.width) || workspaceSvg.clientWidth || workspaceSvg.getBoundingClientRect().width;
    const renderedHeight = parseFloat(workspaceSvg.style.height) || workspaceSvg.clientHeight || workspaceSvg.getBoundingClientRect().height;
    if (!viewBox?.width || !viewBox?.height || !renderedWidth || !renderedHeight) return false;

    const scaleX = renderedWidth / viewBox.width;
    const scaleY = renderedHeight / viewBox.height;
    const contentX = (x - viewBox.x) * scaleX;
    const contentY = (y - viewBox.y) * scaleY;
    const maxLeft = Math.max(0, workspaceWrap.scrollWidth - workspaceWrap.clientWidth);
    const maxTop = Math.max(0, workspaceWrap.scrollHeight - workspaceWrap.clientHeight);

    workspaceWrap.scrollLeft = Math.max(0, Math.min(maxLeft, contentX - workspaceWrap.clientWidth / 2));
    workspaceWrap.scrollTop = Math.max(0, Math.min(maxTop, contentY - workspaceWrap.clientHeight / 2));
    return true;
  }

  function centerNativeViewportOnCircuit() {
    const points = [...componentLayer.querySelectorAll(".component")]
      .map(parseComponentPosition)
      .filter(Boolean);

    if (!points.length) {
      const viewBox = workspaceSvg.viewBox?.baseVal;
      if (viewBox?.width && viewBox?.height) {
        centerNativeViewportOnPoint(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2);
      }
      return;
    }

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    centerNativeViewportOnPoint((minX + maxX) / 2, (minY + maxY) / 2);
  }

  function centerNativeViewportOnSelected() {
    const selected = componentLayer.querySelector(".component.selected") || componentLayer.querySelector(".component");
    const point = parseComponentPosition(selected);
    if (point) centerNativeViewportOnPoint(point.x, point.y);
    else centerNativeViewportOnCircuit();
  }

  function scheduleNativeCenter(mode = "circuit") {
    const run = () => {
      if (mode === "selected") centerNativeViewportOnSelected();
      else centerNativeViewportOnCircuit();
    };
    afterLayout(run);
    window.setTimeout(run, 80);
    window.setTimeout(run, 180);
  }

  fitCanvasBtn?.addEventListener("click", () => {
    zoomResetBtn?.click();
    scheduleNativeCenter("circuit");
  });

  let pendingCenter = null;
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".sample-btn[data-sample]")) {
      pendingCenter = "circuit";
      scheduleNativeCenter("circuit");
      return;
    }
    if (event.target.closest?.(".palette-card") || event.target.closest?.("#addComponentBtn")) {
      pendingCenter = "selected";
      scheduleNativeCenter("selected");
    }
  });

  new MutationObserver(() => {
    if (!pendingCenter) return;
    const mode = pendingCenter;
    pendingCenter = null;
    scheduleNativeCenter(mode);
  }).observe(componentLayer, { childList: true, subtree: true });

  /* Multi-document manager */
  let documentCounter = 1;
  let activeDocumentId = 1;
  const documents = new Map();

  function cloneData(value) {
    if (value == null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function captureCircuit() {
    try {
      if (typeof serializeCircuit === "function") return cloneData(serializeCircuit());
    } catch (error) {
      console.warn("VoltForge Studio: unable to snapshot schematic", error);
    }
    return null;
  }

  function loadCircuitSnapshot(data, reason) {
    if (!data || typeof loadCircuitData !== "function") return false;
    try {
      loadCircuitData(cloneData(data), reason, { recordHistory: false });
      return true;
    } catch (error) {
      console.error("VoltForge Studio: unable to restore schematic tab", error);
      return false;
    }
  }

  function saveActiveDocument() {
    const documentState = documents.get(activeDocumentId);
    if (!documentState) return;
    const snapshot = captureCircuit();
    if (snapshot) documentState.data = snapshot;
    documentState.scrollLeft = workspaceWrap.scrollLeft;
    documentState.scrollTop = workspaceWrap.scrollTop;
  }

  function getTabsInsertionPoint() {
    return documentTabsHost?.querySelector(".canvas-spacer") || null;
  }

  function renderDocumentTabs() {
    if (!documentTabsHost) return;

    documentTabsHost.querySelectorAll(".document-tab").forEach((node) => node.remove());
    const insertionPoint = getTabsInsertionPoint();

    documents.forEach((documentState) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `document-tab ${documentState.id === activeDocumentId ? "active" : ""}`;
      tab.dataset.documentId = String(documentState.id);
      tab.setAttribute("aria-pressed", String(documentState.id === activeDocumentId));
      tab.innerHTML = `
        <span class="document-tab-dot" aria-hidden="true"></span>
        <span>${documentState.title}</span>
        <small class="document-tab-close" aria-label="Затвори ${documentState.title}" title="Затвори">×</small>
      `;
      documentTabsHost.insertBefore(tab, insertionPoint);
    });

    const addTab = document.createElement("button");
    addTab.type = "button";
    addTab.className = "document-tab document-add-tab";
    addTab.title = "Нова схема (Ctrl+N)";
    addTab.setAttribute("aria-label", "Нова схема");
    addTab.innerHTML = `<span aria-hidden="true">+</span>`;
    documentTabsHost.insertBefore(addTab, insertionPoint);
  }

  function restoreDocumentViewport(documentState) {
    afterLayout(() => {
      if (Number.isFinite(documentState.scrollLeft) && Number.isFinite(documentState.scrollTop) &&
          (documentState.scrollLeft > 0 || documentState.scrollTop > 0)) {
        workspaceWrap.scrollLeft = documentState.scrollLeft;
        workspaceWrap.scrollTop = documentState.scrollTop;
      } else {
        centerNativeViewportOnCircuit();
      }
    });
  }

  function switchDocument(documentId) {
    const next = documents.get(documentId);
    if (!next || documentId === activeDocumentId) return;

    saveActiveDocument();
    activeDocumentId = documentId;
    renderDocumentTabs();

    if (next.data) {
      loadCircuitSnapshot(next.data, `Отворена е ${next.title}`);
      restoreDocumentViewport(next);
    }
  }

  function createNewDocument() {
    saveActiveDocument();

    documentCounter += 1;
    const next = {
      id: documentCounter,
      title: `Схема ${documentCounter}`,
      data: null,
      scrollLeft: 0,
      scrollTop: 0,
    };
    documents.set(next.id, next);
    activeDocumentId = next.id;
    renderDocumentTabs();

    clearBtn?.click();

    afterLayout(() => {
      const snapshot = captureCircuit();
      if (snapshot) next.data = snapshot;
      centerNativeViewportOnCircuit();
    });
  }

  function closeDocument(documentId) {
    if (!documents.has(documentId)) return;

    if (documents.size === 1) {
      clearBtn?.click();
      const only = documents.get(documentId);
      only.data = null;
      only.scrollLeft = 0;
      only.scrollTop = 0;
      afterLayout(() => {
        only.data = captureCircuit();
        centerNativeViewportOnCircuit();
      });
      return;
    }

    const ids = [...documents.keys()];
    const closingIndex = ids.indexOf(documentId);
    const wasActive = documentId === activeDocumentId;
    documents.delete(documentId);

    if (wasActive) {
      const remainingIds = [...documents.keys()];
      const nextId = remainingIds[Math.min(closingIndex, remainingIds.length - 1)];
      activeDocumentId = nextId;
      const next = documents.get(nextId);
      renderDocumentTabs();
      if (next?.data) {
        loadCircuitSnapshot(next.data, `Отворена е ${next.title}`);
        restoreDocumentViewport(next);
      }
    } else {
      renderDocumentTabs();
    }
  }

  documents.set(1, {
    id: 1,
    title: "Схема 1",
    data: captureCircuit(),
    scrollLeft: workspaceWrap.scrollLeft,
    scrollTop: workspaceWrap.scrollTop,
  });
  renderDocumentTabs();

  documentTabsHost?.addEventListener("click", (event) => {
    if (event.target.closest?.(".document-add-tab")) {
      createNewDocument();
      return;
    }

    const tab = event.target.closest?.(".document-tab[data-document-id]");
    if (!tab) return;
    const documentId = Number(tab.dataset.documentId);

    if (event.target.closest?.(".document-tab-close")) {
      event.preventDefault();
      event.stopPropagation();
      if (documentId === activeDocumentId) saveActiveDocument();
      closeDocument(documentId);
      return;
    }

    switchDocument(documentId);
  });

  /* Menu actions - special-case New schematic so current document is saved first. */
  document.addEventListener("click", (event) => {
    const proxy = event.target.closest?.("[data-proxy-click]");
    if (!proxy) return;
    event.preventDefault();

    if (proxy.dataset.proxyClick === "clearBtn") createNewDocument();
    else proxyClick(proxy.dataset.proxyClick);
    closeMenus();
  });

  function runMenuAction(action) {
    if (action === "toggle-assets") togglePanel("assets");
    else if (action === "toggle-properties") togglePanel("properties");
    else if (action === "guide" || action === "shortcuts") activateAssetTab("guide");
    else if (action === "fit") {
      zoomResetBtn?.click();
      scheduleNativeCenter("circuit");
    } else if (action === "rotate") proxyClick("rotateBtn");
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

  /* Assets and mirrors */
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

  /* Keyboard */
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (event.key === "Escape") {
      closeMenus();
      return;
    }
    if (typing) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewDocument();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      togglePanel("assets");
      return;
    }

    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      zoomResetBtn?.click();
      scheduleNativeCenter("circuit");
    }
  });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  shell.dataset.studioReady = "true";
})();
