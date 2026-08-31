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

const rows = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(name, fn) {
  try {
    const detail = await fn();
    rows.push({ name, ok: true, detail: detail ?? "ok" });
    console.log(`PASS | ${name}`, detail ?? "");
  } catch (error) {
    rows.push({ name, ok: false, detail: error.message });
    console.error(`FAIL | ${name} | ${error.message}`);
  }
}
async function waitFor(client, expression, message, attempts = 120) {
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
    addEventListener('error', e => window.__vfRuntimeErrors.push(String(e.error?.stack || e.message || 'window error')));
    addEventListener('unhandledrejection', e => window.__vfRuntimeErrors.push(String(e.reason?.stack || e.reason || 'unhandled rejection')));
  })();`,
});

try {
  await client.send("Page.navigate", { url: APP_URL });
  await waitFor(client, "document.readyState === 'complete' && document.querySelector('#studioShell')?.dataset.studioReady === 'true'", "Studio did not initialize");
  await sleep(350);

  await check("boot has no uncaught runtime errors", async () => {
    const errors = await client.evaluate("window.__vfRuntimeErrors");
    assert(errors.length === 0, JSON.stringify(errors));
  });

  await check("canvas viewport is physically bounded", async () => {
    const g = await client.evaluate(`(() => { const w=document.querySelector('#workspaceWrap'); const r=w.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,innerHeight,scrollHeight:w.scrollHeight}; })()`);
    assert(g.height > 250, `canvas too short: ${JSON.stringify(g)}`);
    assert(g.bottom <= g.innerHeight + 2, `canvas exceeds window: ${JSON.stringify(g)}`);
    return g;
  });

  await check("sample loading renders a visible circuit", async () => {
    await client.evaluate(`(() => { document.querySelector('[data-studio-tab="samples"]')?.click(); document.querySelector('.sample-btn[data-sample="workingLed"]')?.click(); })()`);
    await waitFor(client, "document.querySelectorAll('#componentLayer .component').length >= 4", "sample components not rendered");
    await sleep(250);
    const info = await client.evaluate(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); const c=[...document.querySelectorAll('#componentLayer .component')]; return {count:c.length,visible:c.some(n=>{const r=n.getBoundingClientRect();return r.right>=w.left&&r.left<=w.right&&r.bottom>=w.top&&r.top<=w.bottom;})}; })()`);
    assert(info.visible, `sample not visible: ${JSON.stringify(info)}`);
    return info;
  });

  await check("Assets component search filters results", async () => {
    const info = await client.evaluate(`(() => { document.querySelector('[data-studio-tab="components"]')?.click(); const i=document.querySelector('#componentSearch'); const before=[...document.querySelectorAll('#palette .palette-card')].filter(x=>getComputedStyle(x).display!=='none').length; i.value='резистор'; i.dispatchEvent(new Event('input',{bubbles:true})); const after=[...document.querySelectorAll('#palette .palette-card')].filter(x=>getComputedStyle(x).display!=='none').length; return {before,after}; })()`);
    assert(info.after > 0 && info.after < info.before, `search filter ineffective: ${JSON.stringify(info)}`);
    await client.evaluate(`(() => { const i=document.querySelector('#componentSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    return info;
  });

  await check("palette click adds and selects a component", async () => {
    const before = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    await client.evaluate("document.querySelector('#palette .palette-card')?.click()");
    await waitFor(client, `document.querySelectorAll('#componentLayer .component').length > ${before}`, "palette click did not add component");
    const after = await client.evaluate(`(() => ({count:document.querySelectorAll('#componentLayer .component').length,selected:Boolean(document.querySelector('#componentLayer .component.selected'))}))()`);
    assert(after.selected, `new component not selected: ${JSON.stringify(after)}`);
    return after;
  });

  await check("Select and Rotate change selected component", async () => {
    const info = await client.evaluate(`(() => {
      document.querySelector('#toolSelectBtn')?.click();
      const node=document.querySelector('#componentLayer .component');
      const r=node?.getBoundingClientRect();
      if(!node||!r) return null;
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:41,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:41,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      const selected=document.querySelector('#componentLayer .component.selected') || node;
      const before=selected.getAttribute('transform');
      document.querySelector('#rotateBtn')?.click();
      const after=selected.getAttribute('transform');
      return {selected:selected.classList.contains('selected'),before,after};
    })()`);
    assert(info?.selected, `selection failed: ${JSON.stringify(info)}`);
    assert(info.before !== info.after, `rotation had no effect: ${JSON.stringify(info)}`);
    return info;
  });

  await check("tool keyboard shortcuts choose distinct modes", async () => {
    const modes = {};
    for (const key of ['v','w','p','h']) {
      modes[key] = await client.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true})); return document.body.dataset.activeStudioTool; })()`);
    }
    assert(modes.v==='select'&&modes.w==='wire'&&modes.p==='pencil'&&modes.h==='pan', JSON.stringify(modes));
    return modes;
  });

  await check("Auto Wire and Manual Route communicate different behavior", async () => {
    const info = await client.evaluate(`(() => { document.querySelector('#toolWireBtn')?.click(); const wire={label:document.querySelector('#studioToolLabel')?.textContent,hint:document.querySelector('#studioToolHint')?.textContent}; document.querySelector('#toolPencilBtn')?.click(); const pencil={label:document.querySelector('#studioToolLabel')?.textContent,hint:document.querySelector('#studioToolHint')?.textContent}; return {wire,pencil}; })()`);
    assert(info.wire.label !== info.pencil.label && info.wire.hint !== info.pencil.hint, JSON.stringify(info));
    return info;
  });

  await check("zoom in/out/reset controls are functional", async () => {
    const info = await client.evaluate(`(() => { const read=()=>document.querySelector('#zoomResetBtn')?.textContent; const before=read(); document.querySelector('#zoomInBtn')?.click(); const plus=read(); document.querySelector('#zoomOutBtn')?.click(); document.querySelector('#zoomResetBtn')?.click(); return {before,plus,reset:read()}; })()`);
    assert(info.plus !== info.before, JSON.stringify(info));
    assert(info.reset === '100%', JSON.stringify(info));
    return info;
  });

  await check("Fit keeps schematic visible", async () => {
    await client.evaluate("document.querySelector('#fitCanvasBtn')?.click()");
    await sleep(250);
    const visible = await client.evaluate(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); return [...document.querySelectorAll('#componentLayer .component')].some(n=>{const r=n.getBoundingClientRect();return r.right>=w.left&&r.left<=w.right&&r.bottom>=w.top&&r.top<=w.bottom;}); })()`);
    assert(visible, "Fit left circuit outside viewport");
  });

  await check("document tabs create and preserve independent schematic", async () => {
    const beforeTabs = await client.evaluate("document.querySelectorAll('.document-tab:not(.document-add-tab)').length");
    const firstCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    await client.evaluate("document.querySelector('.document-add-tab')?.click()");
    await sleep(160);
    const afterTabs = await client.evaluate("document.querySelectorAll('.document-tab:not(.document-add-tab)').length");
    const secondCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    assert(afterTabs === beforeTabs + 1, `tab not created: ${beforeTabs}->${afterTabs}`);
    await client.evaluate("document.querySelector('.document-tab[data-document-id=\"1\"]')?.click()");
    await sleep(180);
    const restoredCount = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    assert(restoredCount === firstCount, `first document not restored: ${firstCount} vs ${restoredCount}; second=${secondCount}`);
    return {beforeTabs,afterTabs,firstCount,secondCount,restoredCount};
  });

  await check("new-document tab is compact", async () => {
    const size = await client.evaluate(`(() => { const r=document.querySelector('.document-add-tab')?.getBoundingClientRect(); return r&&{width:r.width,height:r.height}; })()`);
    assert(size && size.width <= 64, JSON.stringify(size));
    return size;
  });

  await check("standalone Help opens shortcuts and Assets has no Guide tab", async () => {
    const info = await client.evaluate(`(() => { document.querySelector('[data-menu-trigger="help"]')?.click(); document.querySelector('[data-menu="help"] [data-menu-action="shortcuts"]')?.click(); const d=document.querySelector('.vf-help-dialog'); const p=d?.querySelector('[data-vf-help-panel="shortcuts"]'); return {dialog:Boolean(d),dialogHidden:d?.hidden,shortcutsHidden:p?.hidden,guideAsset:Boolean(document.querySelector('[data-studio-tab="guide"]'))}; })()`);
    assert(info.dialog && info.dialogHidden===false && info.shortcutsHidden===false, JSON.stringify(info));
    assert(!info.guideAsset, "Guide remains inside Assets");
    await client.evaluate("document.querySelector('.vf-help-dialog [data-vf-help-close]')?.click()");
    return info;
  });

  const analysisCases = [
    ['spiceBtn', /SPICE Workbench/i],
    ['analysisBtn', /Transient Analysis/i],
    ['waveformsBtn', /Waveform/i],
    ['frequencyBtn', /Frequency/i],
  ];
  for (const [id, pattern] of analysisCases) {
    await check(`Analysis ${id} opens correct window`, async () => {
      const info = await client.evaluate(`(() => { document.querySelector('[data-menu-trigger="analysis"]')?.click(); document.querySelector('[data-menu="analysis"] [data-proxy-click="${id}"]')?.click(); const open=[...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden')); return {count:open.length,titles:open.map(x=>x.querySelector('h2,h3,[data-title]')?.textContent||'')}; })()`);
      assert(info.count > 0, `${id} opened nothing`);
      assert(info.titles.some((title) => pattern.test(title)), `${id}: ${JSON.stringify(info)}`);
      await client.evaluate(`(() => { document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click()); document.querySelectorAll('.analysis-modal:not(.hidden) [data-close]').forEach(x=>x.click()); })()`);
      return info;
    });
  }

  await check("Analysis image scan opens", async () => {
    const info = await client.evaluate(`(() => { document.querySelector('[data-menu-trigger="analysis"]')?.click(); document.querySelector('[data-menu="analysis"] [data-proxy-click="scanBtn"]')?.click(); const open=[...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden')); return {count:open.length,text:open.map(x=>x.textContent).join(' ')}; })()`);
    assert(info.count > 0 && /scan|image|изображ|сним/i.test(info.text), JSON.stringify(info));
    await client.evaluate("document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())");
    return {count:info.count};
  });

  await check("diagnostics dashboard summarizes current log", async () => {
    await client.evaluate(`(() => { document.querySelector('[data-property-tab="diagnostics"]')?.click(); document.querySelector('#simulateBtn')?.click(); })()`);
    await sleep(250);
    const info = await client.evaluate(`(() => ({dashboard:Boolean(document.querySelector('.vf-diagnostics-dashboard')),lines:document.querySelectorAll('#diagnostics .diagnostic-console-line').length,counters:[...document.querySelectorAll('.vf-diag-summary [data-vf-diag-count] span')].map(x=>Number(x.textContent)||0),filters:document.querySelectorAll('[data-vf-diag-filter]').length}))()`);
    assert(info.dashboard && info.filters >= 4, JSON.stringify(info));
    assert(info.counters.reduce((a,b)=>a+b,0) === info.lines, JSON.stringify(info));
    return info;
  });

  await check("Properties panel has editor action for selected component", async () => {
    await client.evaluate("document.querySelector('[data-property-tab=\"inspector\"]')?.click()");
    const info = await client.evaluate(`(() => { const buttons=[...document.querySelectorAll('#inspector button')]; return {buttons:buttons.map(x=>x.textContent.trim()),fields:document.querySelectorAll('#inspector .property-field').length}; })()`);
    assert(info.buttons.length > 0, JSON.stringify(info));
    return info;
  });

  await check("Assets and Properties panel toggles round-trip", async () => {
    const info = await client.evaluate(`(() => { const s=document.querySelector('#studioShell'); const a=document.querySelector('#assetsToggleBtn'); const p=document.querySelector('#propertiesToggleBtn'); a.click(); const a1=s.classList.contains('assets-collapsed'); a.click(); const a2=s.classList.contains('assets-collapsed'); p.click(); const p1=s.classList.contains('properties-collapsed'); p.click(); const p2=s.classList.contains('properties-collapsed'); return {a1,a2,p1,p2}; })()`);
    assert(info.a1&&!info.a2&&info.p1&&!info.p2, JSON.stringify(info));
    return info;
  });

  await check("language switch activates EN then BG", async () => {
    const info = await client.evaluate(`(() => { document.querySelector('#langEnBtn')?.click(); const en=document.querySelector('#langEnBtn')?.classList.contains('active'); document.querySelector('#langBgBtn')?.click(); const bg=document.querySelector('#langBgBtn')?.classList.contains('active'); return {en,bg}; })()`);
    assert(info.en && info.bg, JSON.stringify(info));
    return info;
  });

  await check("final interaction pass has no uncaught runtime errors", async () => {
    const errors = await client.evaluate("window.__vfRuntimeErrors");
    assert(errors.length === 0, JSON.stringify(errors));
  });
} finally {
  client.close();
}

console.log("\nSTUDIO FUNCTIONAL AUDIT SUMMARY");
for (const row of rows) console.log(`${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail)}`);
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed.`);
if (failed.length) {
  console.error(`Failed checks: ${failed.map((row) => row.name).join(', ')}`);
  process.exitCode = 1;
}
