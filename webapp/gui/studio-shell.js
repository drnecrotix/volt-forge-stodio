(() => {
  "use strict";

  const STORAGE = {
    assetTab: "voltforge.studio.assetTab",
    propertyTab: "voltforge.studio.propertyTab",
  };

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

  function activateAssetTab(name, persist = true) {
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
    activateGroup(
      "[data-property-tab]",
      "[data-property-panel]",
      "propertyTab",
      "propertyPanel",
      name,
      persist ? STORAGE.propertyTab : null,
    );
  }

  document.querySelectorAll("[data-studio-tab]").forEach((tab) => {
    tab.addEventListener("click", () => activateAssetTab(tab.dataset.studioTab));
  });

  document.querySelectorAll("[data-property-tab]").forEach((tab) => {
    tab.addEventListener("click", () => activatePropertyTab(tab.dataset.propertyTab));
  });

  activateAssetTab(localStorage.getItem(STORAGE.assetTab) || "components", false);
  activatePropertyTab(localStorage.getItem(STORAGE.propertyTab) || "inspector", false);

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
    if (!source) return;
    new MutationObserver(syncTabLabels).observe(source, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  document.querySelectorAll(".sample-btn[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".sample-btn[data-sample]").forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
      });
    });
  });

  const inspector = document.getElementById("inspector");
  if (inspector) {
    new MutationObserver(() => {
      if (!inspector.classList.contains("empty-state")) activatePropertyTab("inspector", false);
    }).observe(inspector, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
})();
