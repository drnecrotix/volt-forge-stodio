(() => {
  "use strict";

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function closeStudioMenus() {
    qsa("[data-menu]").forEach((menu) => { menu.hidden = true; });
    qsa("[data-menu-trigger]").forEach((trigger) => {
      trigger.classList.remove("active");
      trigger.setAttribute("aria-expanded", "false");
    });
  }

  function setStatus(text, tone = "info") {
    const status = qs("#statusChip");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  /* ------------------------------------------------------------------ */
  /* Assets: search across the whole catalog, not only current category. */
  /* ------------------------------------------------------------------ */
  const componentSearch = qs("#componentSearch");
  if (componentSearch) {
    componentSearch.addEventListener("input", () => {
      const query = componentSearch.value.trim();
      if (!query) return;
      const allCategory = qs("#componentCategoryMenu .picker-category-btn");
      if (allCategory && !allCategory.classList.contains("active")) {
        allCategory.click();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tools: make Auto Wire and Manual Route clearly different.          */
  /* ------------------------------------------------------------------ */
  const toolMeta = {
    select: {
      label: "Избор",
      hint: "Избирай, мести и редактирай компоненти или проводници.",
      shortcut: "V",
    },
    wire: {
      label: "Авто проводник",
      hint: "Кликни начален terminal, после краен terminal. Клик в празно поле отменя започнатата връзка.",
      shortcut: "W",
    },
    pencil: {
      label: "Ръчно трасе",
      hint: "Старт от terminal, кликове върху платното добавят чупки, последен terminal завършва. Esc отказва.",
      shortcut: "P",
    },
    pan: {
      label: "Ръка / Pan",
      hint: "Премества изгледа без да мести елементите. Може и със Space + drag.",
      shortcut: "H",
    },
  };

  const toolButtons = {
    select: qs("#toolSelectBtn"),
    wire: qs("#toolWireBtn"),
    pencil: qs("#toolPencilBtn"),
    pan: qs("#toolPanBtn"),
  };

  if (toolButtons.wire) {
    toolButtons.wire.title = "Авто проводник (W) - terminal към terminal";
    toolButtons.wire.setAttribute("aria-label", "Авто проводник - автоматична връзка между два terminal-а");
  }
  if (toolButtons.pencil) {
    toolButtons.pencil.title = "Ръчно трасе (P) - добавяй чупки по маршрута";
    toolButtons.pencil.setAttribute("aria-label", "Ръчно трасе - проводник с междинни точки");
  }

  const toolOptions = qs(".tool-options");
  let toolHint = qs("#studioToolHint");
  if (toolOptions && !toolHint) {
    toolHint = document.createElement("span");
    toolHint.id = "studioToolHint";
    toolHint.className = "tool-mode-hint";
    toolOptions.appendChild(toolHint);
  }

  function getActiveTool() {
    const active = qs("[data-tool].active");
    return active?.dataset.tool || "select";
  }

  function refreshToolHelp() {
    const name = getActiveTool();
    const meta = toolMeta[name] || toolMeta.select;
    const label = qs("#studioToolLabel");
    if (label) label.textContent = meta.label;
    if (toolHint) toolHint.textContent = `${meta.shortcut} · ${meta.hint}`;
    document.body.dataset.activeStudioTool = name;
  }

  Object.entries(toolButtons).forEach(([name, button]) => {
    button?.addEventListener("click", () => {
      refreshToolHelp();
      requestAnimationFrame(refreshToolHelp);
      const meta = toolMeta[name];
      if (meta) setStatus(meta.label, "info");
    });
  });
  refreshToolHelp();

  const toolHost = qs("#toolButtons");
  if (toolHost) {
    new MutationObserver(refreshToolHelp).observe(toolHost, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const shortcuts = { v: "select", w: "wire", p: "pencil", h: "pan" };
    if (shortcuts[key] && toolButtons[shortcuts[key]]) {
      event.preventDefault();
      toolButtons[shortcuts[key]].click();
      refreshToolHelp();
      return;
    }

    if (event.key === "Escape") {
      if (typeof window.clearPendingWire === "function") {
        window.clearPendingWire();
        if (typeof window.rerender === "function") window.rerender();
      }
      toolButtons.select?.click();
      refreshToolHelp();
      setStatus("Текущото действие е отменено", "info");
    }
  });

  /* Auto Wire starts only on a terminal. Clicking empty canvas while a preview
     exists cancels it instead of unexpectedly entering a pan gesture. */
  const workspaceStage = qs("#workspaceStage");
  workspaceStage?.addEventListener("pointerdown", (event) => {
    if (getActiveTool() !== "wire" || !qs(".pending-wire-path")) return;
    if (event.target.closest?.(".terminal-hit, .component, .wire-hit")) return;
    if (typeof window.clearPendingWire === "function") {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.clearPendingWire();
      if (typeof window.rerender === "function") window.rerender();
      setStatus("Авто проводникът е отменен", "info");
    }
  }, true);

  /* ------------------------------------------------------------------ */
  /* Analysis menu: invoke the real workbench functions directly.       */
  /* ------------------------------------------------------------------ */
  const analysisFunctions = {
    spiceBtn: "openSpiceWorkbench",
    waveformsBtn: "openWaveforms",
    analysisBtn: "openTransientWorkbench",
    frequencyBtn: "openFrequencyViewer",
    scanBtn: "openImageScanModal",
  };

  let fallbackWaveformViewer = null;
  let fallbackFrequencyViewer = null;

  function hasOpenAnalysisWindow() {
    return qsa(".analysis-modal").some((modal) => !modal.classList.contains("hidden"));
  }

  function openAnalysisFallback(id, message) {
    const gui = window.VoltForgeWeb?.gui;
    if (id === "waveformsBtn" && gui?.WaveformViewer) {
      fallbackWaveformViewer ||= new gui.WaveformViewer();
      fallbackWaveformViewer.setResult(null, {
        eyebrow: "analysis",
        title: "Transient графики",
        export: "Export CSV",
        reset: "Нулирай изгледа",
        close: "Затвори",
        noData: message || "Transient данните не са налични за текущата схема.",
        placeholder: "Поправи проблемите в схемата или отвори Transient Analysis и опитай отново.",
        cursor: "Курсор",
      });
      fallbackWaveformViewer.open();
      return true;
    }
    if (id === "frequencyBtn" && gui?.FrequencyViewer) {
      fallbackFrequencyViewer ||= new gui.FrequencyViewer();
      fallbackFrequencyViewer.setPayload({
        result: null,
        labels: {
          kicker: "analysis",
          title: "Frequency analysis",
          export: "Export CSV",
          close: "Затвори",
          empty: message || "Няма валидни transient данни за честотен анализ.",
          summary: "Най-силен открит сигнал",
          peak: "Peak voltage",
          placeholder: "Поправи схемата и стартирай transient анализ.",
        },
      });
      fallbackFrequencyViewer.open();
      return true;
    }
    return false;
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest?.("[data-menu='analysis'] [data-proxy-click]");
    if (!item) return;
    const id = item.dataset.proxyClick;
    const functionName = analysisFunctions[id];
    if (!functionName) return;

    const fn = window[functionName];
    if (typeof fn === "function") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeStudioMenus();
      try {
        fn();
        requestAnimationFrame(() => {
          if (hasOpenAnalysisWindow()) return;
          if (id !== "waveformsBtn" && id !== "frequencyBtn") return;
          const message = qs("#statusChip")?.textContent || "Анализът не е наличен за текущата схема.";
          if (openAnalysisFallback(id, message)) {
            setStatus("Анализът е отворен с диагностична информация", "warning");
          }
        });
      } catch (error) {
        console.error(`VoltForge: ${functionName} failed`, error);
        setStatus("Анализът не можа да се отвори", "error");
        openAnalysisFallback(id, error instanceof Error ? error.message : "Анализът не е наличен.");
      }
    }
  }, true);

  /* ------------------------------------------------------------------ */
  /* Help is a standalone dialog instead of an Assets sub-tab.          */
  /* ------------------------------------------------------------------ */
  const guideAssetTab = qs("[data-studio-tab='guide']");
  const guideAssetPanel = qs("[data-studio-panel='guide']");
  guideAssetTab?.remove();
  if (guideAssetPanel) guideAssetPanel.hidden = true;
  const assetSubtitle = qs("#assetPanel .panel-head span");
  if (assetSubtitle) assetSubtitle.textContent = "Компоненти и готови схеми";

  let helpDialog = null;

  function ensureHelpDialog() {
    if (helpDialog) return helpDialog;
    helpDialog = document.createElement("section");
    helpDialog.className = "vf-help-dialog";
    helpDialog.hidden = true;
    helpDialog.innerHTML = `
      <div class="vf-help-backdrop" data-vf-help-close></div>
      <div class="vf-help-window" role="dialog" aria-modal="true" aria-labelledby="vfHelpTitle">
        <header class="vf-help-header">
          <div>
            <span class="vf-dialog-kicker">VoltForge Studio</span>
            <h2 id="vfHelpTitle">Помощ</h2>
          </div>
          <button type="button" class="vf-dialog-close" data-vf-help-close aria-label="Затвори">×</button>
        </header>
        <nav class="vf-help-tabs" aria-label="Помощ">
          <button type="button" data-vf-help-tab="guide">Бърз guide</button>
          <button type="button" data-vf-help-tab="shortcuts">Клавишни комбинации</button>
        </nav>
        <div class="vf-help-content">
          <section data-vf-help-panel="guide"></section>
          <section data-vf-help-panel="shortcuts" hidden>
            <div class="vf-shortcut-grid">
              <div><kbd>V</kbd><span><strong>Избор</strong><small>Избиране и местене на елементи</small></span></div>
              <div><kbd>W</kbd><span><strong>Авто проводник</strong><small>Terminal към terminal</small></span></div>
              <div><kbd>P</kbd><span><strong>Ръчно трасе</strong><small>Проводник с ръчни чупки</small></span></div>
              <div><kbd>H</kbd><span><strong>Pan</strong><small>Преместване на изгледа</small></span></div>
              <div><kbd>Space</kbd><span><strong>Временен Pan</strong><small>Задръж и влачи canvas-а</small></span></div>
              <div><kbd>R</kbd><span><strong>Завърти</strong><small>Завърта избрания компонент</small></span></div>
              <div><kbd>Del</kbd><span><strong>Изтрий</strong><small>Премахва избрания елемент</small></span></div>
              <div><kbd>Esc</kbd><span><strong>Отказ</strong><small>Прекратява текущото трасе/действие</small></span></div>
              <div><kbd>Ctrl+Z</kbd><span><strong>Undo</strong><small>Връща последната промяна</small></span></div>
              <div><kbd>Ctrl+Y</kbd><span><strong>Redo</strong><small>Повтаря върната промяна</small></span></div>
              <div><kbd>Ctrl+N</kbd><span><strong>Нова схема</strong><small>Отваря нов document tab</small></span></div>
              <div><kbd>Ctrl+wheel</kbd><span><strong>Zoom</strong><small>Мащабира около курсора</small></span></div>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(helpDialog);

    helpDialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-vf-help-close]")) {
        helpDialog.hidden = true;
        return;
      }
      const tab = event.target.closest("[data-vf-help-tab]");
      if (tab) activateHelpTab(tab.dataset.vfHelpTab);
    });
    return helpDialog;
  }

  function activateHelpTab(name) {
    const dialog = ensureHelpDialog();
    qsa("[data-vf-help-tab]", dialog).forEach((tab) => tab.classList.toggle("active", tab.dataset.vfHelpTab === name));
    qsa("[data-vf-help-panel]", dialog).forEach((panel) => { panel.hidden = panel.dataset.vfHelpPanel !== name; });
  }

  function showHelp(name) {
    const dialog = ensureHelpDialog();
    const guideHost = qs("[data-vf-help-panel='guide']", dialog);
    const sourceGuide = qs("#quickGuide");
    if (guideHost && sourceGuide) guideHost.innerHTML = sourceGuide.innerHTML;
    activateHelpTab(name);
    dialog.hidden = false;
    closeStudioMenus();
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-menu-action='guide'], [data-menu-action='shortcuts']");
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showHelp(action.dataset.menuAction === "shortcuts" ? "shortcuts" : "guide");
  }, true);

  /* ------------------------------------------------------------------ */
  /* Diagnostics dashboard: summary, filters and copy action.           */
  /* ------------------------------------------------------------------ */
  const diagnostics = qs("#diagnostics");
  let diagnosticsDashboard = null;
  let activeDiagnosticFilter = "all";
  let diagnosticsTimer = 0;

  function ensureDiagnosticsDashboard() {
    if (!diagnostics || diagnosticsDashboard) return diagnosticsDashboard;
    diagnosticsDashboard = document.createElement("div");
    diagnosticsDashboard.className = "vf-diagnostics-dashboard";
    diagnosticsDashboard.innerHTML = `
      <div class="vf-diag-summary">
        <div data-vf-diag-count="error"><span>0</span><small>Критични</small></div>
        <div data-vf-diag-count="warning"><span>0</span><small>Предупреждения</small></div>
        <div data-vf-diag-count="success"><span>0</span><small>Успешни</small></div>
        <div data-vf-diag-count="event"><span>0</span><small>Събития</small></div>
      </div>
      <div class="vf-diag-health"><span class="vf-diag-health-dot"></span><div><strong>Диагностика</strong><small data-vf-diag-latest>Няма данни</small></div></div>
      <div class="vf-diag-toolbar">
        <div class="vf-diag-filters">
          <button type="button" data-vf-diag-filter="all" class="active">Всички</button>
          <button type="button" data-vf-diag-filter="error">Грешки</button>
          <button type="button" data-vf-diag-filter="warning">Предупреждения</button>
          <button type="button" data-vf-diag-filter="success">OK</button>
        </div>
        <button type="button" class="vf-run-diagnostics" title="Стартирай симулация и обнови диагностиката">Провери</button>
        <button type="button" class="vf-copy-diagnostics" title="Копирай диагностиката">Копирай</button>
      </div>
    `;
    diagnostics.parentElement?.insertBefore(diagnosticsDashboard, diagnostics);
    diagnosticsDashboard.addEventListener("click", async (event) => {
      const filter = event.target.closest("[data-vf-diag-filter]");
      if (filter) {
        activeDiagnosticFilter = filter.dataset.vfDiagFilter;
        qsa("[data-vf-diag-filter]", diagnosticsDashboard).forEach((button) => button.classList.toggle("active", button === filter));
        refreshDiagnosticsDashboard();
        return;
      }
      if (event.target.closest(".vf-run-diagnostics")) {
        qs("#simulateBtn")?.click();
        setStatus("Диагностиката е обновена", "success");
        return;
      }
      if (event.target.closest(".vf-copy-diagnostics")) {
        const text = qsa(".diagnostic-console-line", diagnostics).map((line) => line.textContent).join("\n");
        try {
          await navigator.clipboard.writeText(text);
          setStatus("Диагностиката е копирана", "success");
        } catch {
          setStatus("Копирането не е разрешено", "warning");
        }
      }
    });
    return diagnosticsDashboard;
  }

  function classifyDiagnostic(line) {
    if (line.classList.contains("error")) return "error";
    if (line.classList.contains("warning")) return "warning";
    if (line.classList.contains("success")) return "success";
    return "event";
  }

  function refreshDiagnosticsDashboard() {
    if (!diagnostics) return;
    const dashboard = ensureDiagnosticsDashboard();
    const lines = qsa(".diagnostic-console-line", diagnostics);
    const counts = { error: 0, warning: 0, success: 0, event: 0 };
    lines.forEach((line) => {
      const type = classifyDiagnostic(line);
      counts[type] += 1;
      line.hidden = activeDiagnosticFilter !== "all" && type !== activeDiagnosticFilter;
    });

    Object.entries(counts).forEach(([type, count]) => {
      const value = qs(`[data-vf-diag-count='${type}'] span`, dashboard);
      if (value) value.textContent = String(count);
    });

    const health = qs(".vf-diag-health", dashboard);
    const healthTitle = qs(".vf-diag-health strong", dashboard);
    const latest = qs("[data-vf-diag-latest]", dashboard);
    const latestLine = lines.at(-1);
    if (latest) latest.textContent = latestLine?.textContent || "Няма диагностични събития";
    if (healthTitle) {
      healthTitle.textContent = counts.error > 0
        ? `${counts.error} критични проблема`
        : counts.warning > 0
          ? `${counts.warning} предупреждения`
          : counts.success > 0
            ? "Веригата е проверена"
            : "Диагностика";
    }
    health?.classList.toggle("has-error", counts.error > 0);
    health?.classList.toggle("has-warning", counts.error === 0 && counts.warning > 0);
    health?.classList.toggle("is-healthy", counts.error === 0 && counts.warning === 0 && counts.success > 0);
  }

  if (diagnostics) {
    ensureDiagnosticsDashboard();
    refreshDiagnosticsDashboard();
    new MutationObserver(() => {
      clearTimeout(diagnosticsTimer);
      diagnosticsTimer = window.setTimeout(refreshDiagnosticsDashboard, 20);
    }).observe(diagnostics, { childList: true, subtree: true, characterData: true });
  }

  /* ------------------------------------------------------------------ */
  /* Component editor: stronger layout and safer field interactions.    */
  /* ------------------------------------------------------------------ */
  function enhanceEditor(modal) {
    const shell = qs(".analysis-shell", modal);
    const body = qs("[data-editor-body]", modal);
    if (!shell || !body) return;
    shell.classList.add("vf-component-editor-window");

    const editorBody = body.parentElement;
    if (editorBody && !qs(".vf-editor-context", editorBody)) {
      const context = document.createElement("div");
      context.className = "vf-editor-context";
      context.innerHTML = `<div><strong>Редактор на свойства</strong><small>Промените се прилагат веднага към избрания елемент.</small></div><span class="vf-editor-selection"></span>`;
      editorBody.prepend(context);
    }
    const selection = qs(".vf-editor-selection", editorBody || modal);
    if (selection) selection.textContent = qs("#selectionSummary")?.textContent || "Избран елемент";

    qsa("input[type='number']", body).forEach((input) => {
      if (input.dataset.vfSafeNumber) return;
      input.dataset.vfSafeNumber = "true";
      input.addEventListener("wheel", (event) => {
        event.preventDefault();
        input.blur();
      }, { passive: false });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
      });
    });
    qsa("input, select", body).forEach((input) => { input.autocomplete = "off"; });
  }

  const modalObserver = new MutationObserver(() => {
    qsa(".analysis-modal").forEach((modal) => {
      if (qs("[data-editor-body]", modal)) enhanceEditor(modal);
    });
  });
  modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  qsa(".analysis-modal").forEach((modal) => { if (qs("[data-editor-body]", modal)) enhanceEditor(modal); });

  /* ------------------------------------------------------------------ */
  /* Document tabs: compact + tab and useful titles.                    */
  /* ------------------------------------------------------------------ */
  function enhanceDocumentTabs() {
    qsa(".document-tab[data-document-id]").forEach((tab) => {
      const title = tab.querySelector("span:nth-child(2)")?.textContent?.trim();
      if (title) tab.title = title;
    });
    const add = qs(".document-add-tab");
    if (add) {
      add.title = "Нова схема (Ctrl+N)";
      add.setAttribute("aria-label", "Създай нова схема");
    }
  }
  const tabsHost = qs(".canvas-document-tabs");
  if (tabsHost) {
    enhanceDocumentTabs();
    new MutationObserver(enhanceDocumentTabs).observe(tabsHost, { childList: true, subtree: true });
  }
})();