const DEBUG_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:8000/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(`${DEBUG_URL}/json`);
      const targets = await response.json();
      const target = targets.find((entry) => entry.type === "page");
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools target");
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.socket.addEventListener("open", resolve, { once: true });
        this.socket.addEventListener("error", reject, { once: true });
      });
    }
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "ok" });
    console.log(`PASS ${name}`, detail ?? "");
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(client, expression, message, attempts = 100) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

const target = await waitForTarget();
const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send("Runtime.enable");
await client.send("Page.enable");
await client.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    window.__vfRuntimeErrors = [];
    window.addEventListener('error', (event) => window.__vfRuntimeErrors.push(String(event.error?.stack || event.message || 'window error')));
    window.addEventListener('unhandledrejection', (event) => window.__vfRuntimeErrors.push(String(event.reason?.stack || event.reason || 'unhandled rejection')));
  })();`,
});

try {
  await client.send("Page.navigate", { url: APP_URL });
  await waitFor(client, "document.readyState === 'complete' && document.querySelector('#studioShell')?.dataset.studioReady === 'true'", "Studio did not initialize");
  await sleep(300);

  await check("boot without runtime errors", async () => {
    const errors = await client.evaluate("window.__vfRuntimeErrors");
    assert(Array.isArray(errors) && errors.length === 0, `runtime errors: ${JSON.stringify(errors)}`);
  });

  await check("canvas stays inside viewport", async () => {
    const geometry = await client.evaluate(`(() => {
      const wrap = document.querySelector('#workspaceWrap');
      const rect = wrap.getBoundingClientRect();
      return { innerHeight: innerHeight, top: rect.top, bottom: rect.bottom, height: rect.height, scrollHeight: wrap.scrollHeight };
    })()`);
    assert(geometry.height > 250, `canvas too short: ${geometry.height}`);
    assert(geometry.bottom <= geometry.innerHeight + 2, `canvas escapes viewport: ${JSON.stringify(geometry)}`);
    return geometry;
  });

  await check("samples load and remain visible", async () => {
    await client.evaluate(`(() => {
      document.querySelector('[data-studio-tab="samples"]')?.click();
      document.querySelector('.sample-btn[data-sample="workingLed"]')?.click();
    })()`);
    await waitFor(client, "document.querySelectorAll('#componentLayer .component').length >= 4", "sample did not render components");
    await sleep(250);
    const state = await client.evaluate(`(() => {
      const wrap = document.querySelector('#workspaceWrap').getBoundingClientRect();
      const comps = [...document.querySelectorAll('#componentLayer .component')];
      return { count: comps.length, visible: comps.some((node) => { const r=node.getBoundingClientRect(); return r.right>=wrap.left && r.left<=wrap.right && r.bottom>=wrap.top && r.top<=wrap.bottom; }) };
    })()`);
    assert(state.visible, "sample components are outside the visible canvas");
    return state;
  });

  await check("component search filters library", async () => {
    const value = await client.evaluate(`(() => {
      document.querySelector('[data-studio-tab="components"]')?.click();
      const input = document.querySelector('#componentSearch');
      const before = [...document.querySelectorAll('#palette .palette-card')].filter(x => !x.hidden).length;
      input.value = 'резистор';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const after = [...document.querySelectorAll('#palette .palette-card')].filter(x => !x.hidden && getComputedStyle(x).display !== 'none').length;
      return { before, after };
    })()`);
    assert(value.before > value.after && value.after > 0, `search did not filter palette: ${JSON.stringify(value)}`);
    await client.evaluate(`(() => { const i=document.querySelector('#componentSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    return value;
  });

  await check("palette adds a selected component", async () => {
    const before = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    await client.evaluate("document.querySelector('#palette .palette-card')?.click()");
    await waitFor(client, `document.querySelectorAll('#componentLayer .component').length > ${before}`, "palette click did not add component");
    const selected = await client.evaluate("Boolean(document.querySelector('#componentLayer .component.selected'))");
    assert(selected, "new component is not selected");
    return { before, after: before + 1 };
  });

  await check("select and rotate manipulate the schematic", async () => {
    const result = await client.evaluate(`(() => {
      document.querySelector('#toolSelectBtn')?.click();
      const node = document.querySelector('#componentLayer .component');
      if (!node) return { ok:false, reason:'no component' };
      const terminal = node.querySelector('.terminal-hit');
      const r = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:51}));
      const before = node.getAttribute('transform');
      document.querySelector('#rotateBtn')?.click();
      const after = node.getAttribute('transform');
      return { ok:true, before, after, selected:node.classList.contains('selected'), terminal:Boolean(terminal) };
    })()`);
    assert(result.ok && result.selected, `component selection failed: ${JSON.stringify(result)}`);
    assert(result.before !== result.after, `rotate did not change transform: ${JSON.stringify(result)}`);
    return result;
  });

  await check("tool shortcuts select distinct modes", async () => {
    const modes = {};
    for (const key of ['v','w','p','h']) {
      modes[key] = await client.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true})); return document.body.dataset.activeStudioTool; })()`);
    }
    assert(modes.v === 'select' && modes.w === 'wire' && modes.p === 'pencil' && modes.h === 'pan', `wrong modes: ${JSON.stringify(modes)}`);
    return modes;
  });

  await check("wire and manual route have distinct guidance", async () => {
    const values = await client.evaluate(`(() => {
      document.querySelector('#toolWireBtn')?.click();
      const wire = { label:document.querySelector('#studioToolLabel')?.textContent, hint:document.querySelector('#studioToolHint')?.textContent };
      document.querySelector('#toolPencilBtn')?.click();
      const pencil = { label:document.querySelector('#studioToolLabel')?.textContent, hint:document.querySelector('#studioToolHint')?.textContent };
      return { wire, pencil };
    })()`);
    assert(values.wire.label !== values.pencil.label, `tool labels are indistinguishable: ${JSON.stringify(values)}`);
    assert(values.wire.hint !== values.pencil.hint, "tool hints are indistinguishable");
    return values;
  });

  await check("zoom controls change and reset scale", async () => {
    const values = await client.evaluate(`(() => {
      const read=()=>document.querySelector('#zoomResetBtn')?.textContent;
      const before=read();
      document.querySelector('#zoomInBtn')?.click();
      const afterIn=read();
      document.querySelector('#zoomOutBtn')?.click();
      document.querySelector('#zoomResetBtn')?.click();
      return { before, afterIn, reset:read() };
    })()`);
    assert(values.afterIn !== values.before, `zoom-in had no effect: ${JSON.stringify(values)}`);
    assert(values.reset === '100%', `zoom reset is not 100%: ${JSON.stringify(values)}`);
    return values;
  });

  await check("Fit keeps at least one component visible", async () => {
    await client.evaluate("document.querySelector('#fitCanvasBtn')?.click()");
    await sleep(250);
    const visible = await client.evaluate(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); return [...document.querySelectorAll('#componentLayer .component')].some(n=>{const r=n.getBoundingClientRect();return r.right>=w.left&&r.left<=w.right&&r.bottom>=w.top&&r.top<=w.bottom;}); })()`);
    assert(visible, "Fit left all components outside the canvas");
  });

  await check("document tabs create, switch and preserve schematics", async () => {
    const before = await client.evaluate("document.querySelectorAll('.document-tab:not(.document-add-tab)').length");
    const firstCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    await client.evaluate("document.querySelector('.document-add-tab')?.click()");
    await sleep(150);
    const after = await client.evaluate("document.querySelectorAll('.document-tab:not(.document-add-tab)').length");
    const newCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    assert(after === before + 1, `new document tab missing: ${before} -> ${after}`);
    const restored = await client.evaluate(`(() => { document.querySelector('.document-tab[data-document-id="1"]')?.click(); return true; })()`);
    await sleep(200);
    const restoredCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    assert(restored && restoredCount === firstCount, `document snapshot not restored: ${firstCount} vs ${restoredCount}; new=${newCount}`);
    return { before, after, firstCount, newCount, restoredCount };
  });

  await check("document add tab is compact", async () => {
    const size = await client.evaluate(`(() => { const r=document.querySelector('.document-add-tab')?.getBoundingClientRect(); return r?{width:r.width,height:r.height}:null; })()`);
    assert(size && size.width <= 64, `new-document tab is too wide: ${JSON.stringify(size)}`);
    return size;
  });

  await check("help opens standalone guide and shortcuts", async () => {
    const state = await client.evaluate(`(() => {
      document.querySelector('[data-menu-trigger="help"]')?.click();
      document.querySelector('[data-menu="help"] [data-menu-action="shortcuts"]')?.click();
      const dialog=document.querySelector('.vf-help-dialog');
      const shortcuts=dialog?.querySelector('[data-vf-help-panel="shortcuts"]');
      return { exists:Boolean(dialog), hidden:dialog?.hidden, shortcutsHidden:shortcuts?.hidden, guideAsset:Boolean(document.querySelector('[data-studio-tab="guide"]')) };
    })()`);
    assert(state.exists && state.hidden === false && state.shortcutsHidden === false, `shortcuts dialog failed: ${JSON.stringify(state)}`);
    assert(!state.guideAsset, "Guide still exists as an Assets tab");
    await client.evaluate("document.querySelector('.vf-help-dialog [data-vf-help-close]')?.click()");
    return state;
  });

  const analysisCases = [
    ['spiceBtn', /SPICE Workbench/i],
    ['analysisBtn', /Transient Analysis/i],
    ['waveformsBtn', /Waveform/i],
    ['frequencyBtn', /Frequency/i],
  ];
  for (const [id, titlePattern] of analysisCases) {
    await check(`analysis action ${id} opens its workbench`, async () => {
      const info = await client.evaluate(`(() => {
        document.querySelector('[data-menu-trigger="analysis"]')?.click();
        document.querySelector('[data-menu="analysis"] [data-proxy-click="${id}"]')?.click();
        const open=[...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden'));
        return { count:open.length, titles:open.map(x=>x.querySelector('h2,h3,[data-title]')?.textContent||'') };
      })()`);
      assert(info.count > 0, `${id} did not open a modal`);
      assert(info.titles.some((t)=>${titlePattern}.test(t)), `${id} opened unexpected modal: ${JSON.stringify(info)}`);
      await client.evaluate(`(() => { document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click()); document.querySelectorAll('.analysis-modal:not(.hidden) [data-close]').forEach(x=>x.click()); })()`);
      return info;
    });
  }

  await check("image scan analysis opens", async () => {
    const info = await client.evaluate(`(() => {
      document.querySelector('[data-menu-trigger="analysis"]')?.click();
      document.querySelector('[data-menu="analysis"] [data-proxy-click="scanBtn"]')?.click();
      const open=[...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden'));
      return { count:open.length, text:open.map(x=>x.textContent).join(' ') };
    })()`);
    assert(info.count > 0 && /scan|image|сним|изображ/i.test(info.text), `scan modal not found: ${JSON.stringify(info)}`);
    await client.evaluate(`document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())`);
    return info;
  });

  await check("diagnostics dashboard renders and filters", async () => {
    await client.evaluate(`(() => { document.querySelector('[data-property-tab="diagnostics"]')?.click(); document.querySelector('#simulateBtn')?.click(); })()`);
    await sleep(250);
    const info = await client.evaluate(`(() => ({
      dashboard:Boolean(document.querySelector('.vf-diagnostics-dashboard')),
      lines:document.querySelectorAll('#diagnostics .diagnostic-console-line').length,
      counters:[...document.querySelectorAll('.vf-diag-summary [data-vf-diag-count] span')].map(x=>Number(x.textContent)||0),
      filters:document.querySelectorAll('[data-vf-diag-filter]').length
    }))()`);
    assert(info.dashboard && info.filters >= 4, `diagnostics dashboard incomplete: ${JSON.stringify(info)}`);
    assert(info.counters.reduce((a,b)=>a+b,0) === info.lines, `diagnostic counters do not match lines: ${JSON.stringify(info)}`);
    return info;
  });

  await check("component editor opens above the Studio chrome", async () => {
    await client.evaluate(`(() => {
      document.querySelector('[data-property-tab="inspector"]')?.click();
      document.querySelector('#componentLayer .component')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:71,clientX:700,clientY:400}));
      document.querySelector('#inspector button')?.click();
    })()`);
    await sleep(100);
    const info = await client.evaluate(`(() => {
      const modal=[...document.querySelectorAll('.analysis-modal')].find(x=>!x.classList.contains('hidden') && x.querySelector('[data-editor-body]'));
      if(!modal) return null;
      const shell=modal.querySelector('.analysis-shell');
      return { z:getComputedStyle(modal).zIndex, width:shell?.getBoundingClientRect().width, fields:modal.querySelectorAll('.property-field').length };
    })()`);
    assert(info && info.fields > 0, `component editor did not open: ${JSON.stringify(info)}`);
    assert(Number(info.z || 0) >= 2000, `editor z-index too low: ${JSON.stringify(info)}`);
    return info;
  });

  await check("panel toggles collapse and restore", async () => {
    const result = await client.evaluate(`(() => {
      const shell=document.querySelector('#studioShell');
      const a=document.querySelector('#assetsToggleBtn');
      const p=document.querySelector('#propertiesToggleBtn');
      a.click(); const a1=shell.classList.contains('assets-collapsed'); a.click(); const a2=shell.classList.contains('assets-collapsed');
      p.click(); const p1=shell.classList.contains('properties-collapsed'); p.click(); const p2=shell.classList.contains('properties-collapsed');
      return {a1,a2,p1,p2};
    })()`);
    assert(result.a1 && !result.a2 && result.p1 && !result.p2, `panel toggles failed: ${JSON.stringify(result)}`);
    return result;
  });

  await check("language switch updates active locale", async () => {
    const state = await client.evaluate(`(() => { document.querySelector('#langEnBtn')?.click(); const en=document.querySelector('#langEnBtn')?.classList.contains('active'); document.querySelector('#langBgBtn')?.click(); const bg=document.querySelector('#langBgBtn')?.classList.contains('active'); return {en,bg}; })()`);
    assert(state.en && state.bg, `language switch failed: ${JSON.stringify(state)}`);
    return state;
  });

  await check("final runtime has no uncaught errors", async () => {
    const errors = await client.evaluate("window.__vfRuntimeErrors");
    assert(Array.isArray(errors) && errors.length === 0, `runtime errors after interactions: ${JSON.stringify(errors)}`);
  });
} finally {
  client.close();
}

console.log("\nSTUDIO FUNCTIONAL AUDIT SUMMARY");
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail)}`);
const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.error(`Failed checks: ${failed.map((row) => row.name).join(', ')}`);
  process.exitCode = 1;
}
