const DEBUG_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:8000/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timed = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
]);

async function findPage() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const targets = await (await fetch(`${DEBUG_URL}/json`)).json();
      const page = targets.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome DevTools page not found");
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect() {
    if (this.ws.readyState !== WebSocket.OPEN) {
      await timed(new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      }), 5000, "CDP connect");
    }
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return timed(new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    }), 6000, method);
  }
  async eval(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime error");
    }
    return response.result?.value;
  }
  close() { this.ws.close(); }
}

const rows = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function check(name, fn) {
  try {
    const detail = await timed(fn(), 10000, name);
    rows.push({ name, ok: true, detail });
    console.log(`PASS | ${name}`, detail ?? "");
  } catch (error) {
    rows.push({ name, ok: false, detail: error.message });
    console.error(`FAIL | ${name} | ${error.message}`);
  }
}
async function waitFor(cdp, expression, message) {
  for (let i = 0; i < 100; i += 1) {
    if (await cdp.eval(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

const circuit = `({
  components: [
    {id:'source-a',type:'source',x:610,y:350,rotation:0,properties:{label:'V1',voltage:9}},
    {id:'resistor-b',type:'resistor',x:880,y:260,rotation:0,properties:{label:'R1',resistance:330}},
    {id:'ground-c',type:'ground',x:610,y:500,rotation:0,properties:{label:'GND'}}
  ],
  wires: []
})`;

const page = await findPage();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__vfErrors=[];
    addEventListener('error',e=>__vfErrors.push(String(e.error?.stack||e.message||'error')));
    addEventListener('unhandledrejection',e=>__vfErrors.push(String(e.reason?.stack||e.reason||'rejection')));`,
});

async function boot() {
  await cdp.send("Page.navigate", { url: APP_URL });
  await waitFor(cdp,
    "document.readyState==='complete' && document.querySelector('#studioShell')?.dataset.studioReady==='true'",
    "Studio failed to initialize");
  await sleep(220);
}

async function clickTerminal(componentId, terminalIndex, pointerId) {
  await cdp.eval(`(() => {
    const t=document.querySelector('#componentLayer .component[data-component-id="${componentId}"] .terminal-anchor[data-terminal-index="${terminalIndex}"] .terminal-hit-area');
    if(!t) throw new Error('terminal missing: ${componentId}/${terminalIndex}');
    const r=t.getBoundingClientRect();
    t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:${pointerId},clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  })()`);
  await sleep(45);
}

try {
  await boot();

  await check("boot and canvas viewport", async () => {
    const info = await cdp.eval(`(() => {
      const r=document.querySelector('#workspaceWrap').getBoundingClientRect();
      return {errors:__vfErrors,height:r.height,bottom:r.bottom,innerHeight};
    })()`);
    assert(info.errors.length === 0, JSON.stringify(info.errors));
    assert(info.height > 300 && info.bottom <= info.innerHeight + 2, JSON.stringify(info));
    return info;
  });

  await check("examples and global component search", async () => {
    await cdp.eval(`(() => {
      document.querySelector('[data-studio-tab="samples"]')?.click();
      document.querySelector('[data-sample="workingLed"]')?.click();
    })()`);
    await waitFor(cdp, "document.querySelectorAll('#componentLayer .component').length===4", "example did not render");
    await cdp.eval(`(() => {
      document.querySelector('[data-studio-tab="components"]')?.click();
      const input=document.querySelector('#componentSearch');
      input.value='резистор';
      input.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await sleep(220);
    const info = await cdp.eval(`(() => {
      const cards=[...document.querySelectorAll('#palette .palette-card')];
      const visible=cards.filter(x=>!x.hidden&&getComputedStyle(x).display!=='none');
      return {all:cards.length,visible:visible.length,valid:visible.every(x=>x.textContent.toLocaleLowerCase().includes('резистор'))};
    })()`);
    assert(info.visible > 0 && info.visible < info.all && info.valid, JSON.stringify(info));
    await cdp.eval(`(() => { const input=document.querySelector('#componentSearch'); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    return info;
  });

  await check("selection rotation and tool shortcuts", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'tool-audit',{recordHistory:false})`);
    await sleep(80);
    const rotation = await cdp.eval(`(() => {
      document.querySelector('#toolSelectBtn').click();
      const n=document.querySelector('#componentLayer .component[data-component-id="resistor-b"]');
      const r=n.getBoundingClientRect();
      n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      const before=n.getAttribute('transform');
      document.querySelector('#rotateBtn').click();
      const after=document.querySelector('#componentLayer .component[data-component-id="resistor-b"]').getAttribute('transform');
      return {before,after};
    })()`);
    assert(rotation.before !== rotation.after, JSON.stringify(rotation));
    const modes = {};
    for (const key of ["v", "w", "p", "h"]) {
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}))`);
      await sleep(25);
      modes[key] = await cdp.eval("document.body.dataset.activeStudioTool");
    }
    assert(modes.v === "select" && modes.w === "wire" && modes.p === "pencil" && modes.h === "pan", JSON.stringify(modes));
    return { rotation, modes };
  });

  await check("Auto Wire", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'auto-wire-audit',{recordHistory:false})`);
    await sleep(70);
    await cdp.eval("document.querySelector('#toolWireBtn').click()");
    await clickTerminal("source-a", 0, 11);
    assert(await cdp.eval("Boolean(document.querySelector('.pending-wire-path'))"), "pending wire preview missing");
    await clickTerminal("resistor-b", 0, 12);
    const info = await cdp.eval(`(() => { const d=serializeCircuit(); return {wires:d.wires.length,points:d.wires.at(-1)?.points?.length||0}; })()`);
    assert(info.wires === 1 && info.points === 0, JSON.stringify(info));
    return info;
  });

  await check("Manual Route", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'manual-route-audit',{recordHistory:false})`);
    await sleep(70);
    await cdp.eval("document.querySelector('#toolPencilBtn').click()");
    await clickTerminal("source-a", 0, 21);
    await cdp.eval(`(() => {
      const r=document.querySelector('#workspaceWrap').getBoundingClientRect();
      document.querySelector('#workspaceStage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:22,clientX:r.left+r.width*.52,clientY:r.top+r.height*.32}));
    })()`);
    await sleep(40);
    await clickTerminal("resistor-b", 0, 23);
    const info = await cdp.eval(`(() => { const d=serializeCircuit(); return {wires:d.wires.length,points:d.wires.at(-1)?.points?.length||0}; })()`);
    assert(info.wires === 1 && info.points >= 1, JSON.stringify(info));
    return info;
  });

  await check("drag Undo Pan Zoom Fit", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'navigation-audit',{recordHistory:true})`);
    await sleep(70);
    const drag = await cdp.eval(`(() => {
      document.querySelector('#toolSelectBtn').click();
      const n=document.querySelector('#componentLayer .component[data-component-id="resistor-b"]');
      const b=serializeCircuit().components.find(x=>x.id==='resistor-b');
      const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:31,clientX:x,clientY:y}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:31,clientX:x+80,clientY:y+40}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:31,clientX:x+80,clientY:y+40}));
      const a=serializeCircuit().components.find(x=>x.id==='resistor-b');
      document.querySelector('#undoBtn').click();
      const u=serializeCircuit().components.find(x=>x.id==='resistor-b');
      return {before:[b.x,b.y],after:[a.x,a.y],undo:[u.x,u.y]};
    })()`);
    assert(String(drag.before) !== String(drag.after) && String(drag.before) === String(drag.undo), JSON.stringify(drag));
    const nav = await cdp.eval(`(() => {
      const w=document.querySelector('#workspaceWrap'); document.querySelector('#toolPanBtn').click();
      const before=[w.scrollLeft,w.scrollTop],r=w.getBoundingClientRect(),x=r.left+200,y=r.top+180;
      document.querySelector('#workspaceStage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:32,clientX:x,clientY:y}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:32,clientX:x-60,clientY:y-40}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:32,clientX:x-60,clientY:y-40}));
      const after=[w.scrollLeft,w.scrollTop],z0=document.querySelector('#zoomResetBtn').textContent;
      document.querySelector('#zoomInBtn').click(); const z1=document.querySelector('#zoomResetBtn').textContent;
      document.querySelector('#zoomResetBtn').click(); document.querySelector('#fitCanvasBtn').click();
      return {before,after,z0,z1,z2:document.querySelector('#zoomResetBtn').textContent};
    })()`);
    assert(String(nav.before) !== String(nav.after) && nav.z1 !== nav.z0 && nav.z2 === "100%", JSON.stringify(nav));
    return { drag, nav };
  });

  await check("multi-document tabs", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'tabs-audit',{recordHistory:false})`);
    await sleep(70);
    const before = await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-add-tab').click()");
    await sleep(80);
    const blank = await cdp.eval("serializeCircuit().components.length");
    const after = await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-tab[data-document-id=\"1\"]')?.click()");
    await sleep(80);
    const restored = await cdp.eval("serializeCircuit().components.length");
    const width = await cdp.eval("document.querySelector('.document-add-tab').getBoundingClientRect().width");
    assert(after === before + 1 && blank === 0 && restored === 3 && width <= 64, JSON.stringify({before,after,blank,restored,width}));
    return { before, after, blank, restored, width };
  });

  await check("Help and Analysis windows", async () => {
    const help = await cdp.eval(`(() => {
      document.querySelector('[data-menu-trigger="help"]').click();
      document.querySelector('[data-menu="help"] [data-menu-action="shortcuts"]').click();
      const d=document.querySelector('.vf-help-dialog');
      return Boolean(d&&!d.hidden&&d.querySelector('[data-vf-help-panel="shortcuts"]:not([hidden])')&&!document.querySelector('[data-studio-tab="guide"]'));
    })()`);
    assert(help, "standalone Help failed");
    await cdp.eval("document.querySelector('.vf-help-dialog [data-vf-help-close]')?.click()");

    const cases = [
      ["spiceBtn", "spice"],
      ["analysisBtn", "transient"],
      ["waveformsBtn", "графики"],
      ["frequencyBtn", "frequency"],
      ["scanBtn", "сканиране"],
    ];
    const seen = {};
    for (const [id, expected] of cases) {
      await cdp.eval(`(() => { document.querySelector('[data-menu-trigger="analysis"]').click(); document.querySelector('[data-menu="analysis"] [data-proxy-click="${id}"]').click(); })()`);
      await sleep(120);
      const titles = await cdp.eval(`(() => [...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden')).map(x=>(x.querySelector('[data-title],h2,h3')?.textContent||'').toLocaleLowerCase()))()`);
      seen[id] = titles;
      assert(titles.some((title) => title.includes(expected)), `${id}: ${JSON.stringify(titles)}`);
      await cdp.eval("document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())");
      await sleep(35);
    }
    return seen;
  });

  await check("Diagnostics dashboard", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-property-tab="diagnostics"]').click(); document.querySelector('.vf-run-diagnostics')?.click(); })()`);
    await sleep(150);
    const info = await cdp.eval(`(() => ({
      dashboard:Boolean(document.querySelector('.vf-diagnostics-dashboard')),
      lines:document.querySelectorAll('#diagnostics .diagnostic-console-line').length,
      counters:[...document.querySelectorAll('.vf-diag-summary [data-vf-diag-count] span')].map(x=>+x.textContent||0),
      filters:document.querySelectorAll('[data-vf-diag-filter]').length
    }))()`);
    assert(info.dashboard && info.filters >= 4 && info.counters.reduce((a,b)=>a+b,0) === info.lines, JSON.stringify(info));
    return info;
  });

  await check("Component editor", async () => {
    await cdp.eval(`loadCircuitData(${circuit},'editor-audit',{recordHistory:false})`);
    await sleep(70);
    await cdp.eval(`(() => {
      document.querySelector('[data-property-tab="inspector"]')?.click();
      document.querySelector('#toolSelectBtn').click();
      const n=document.querySelector('#componentLayer .component[data-component-id="source-a"]'),r=n.getBoundingClientRect();
      n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:41,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
    })()`);
    await sleep(60);
    await cdp.eval("document.querySelector('#inspector .inspector-summary-actions button')?.click()");
    await sleep(90);
    const info = await cdp.eval(`(() => {
      const m=[...document.querySelectorAll('.analysis-modal')].find(x=>!x.classList.contains('hidden')&&x.querySelector('[data-editor-body]'));
      if(!m)return null;
      const input=m.querySelector('input[type="number"]');
      const before=input?.value;
      input?.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100}));
      return {open:true,fields:m.querySelectorAll('.property-field').length,numbers:m.querySelectorAll('input[type="number"]').length,before,after:input?.value};
    })()`);
    assert(info?.open && info.fields > 0 && info.before === info.after, JSON.stringify(info));
    await cdp.eval("document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())");
    return info;
  });

  await check("panels language and final runtime", async () => {
    const info = await cdp.eval(`(() => {
      const s=document.querySelector('#studioShell'),a=document.querySelector('#assetsToggleBtn'),p=document.querySelector('#propertiesToggleBtn');
      a.click(); const assets=s.classList.contains('assets-collapsed'); a.click();
      p.click(); const properties=s.classList.contains('properties-collapsed'); p.click();
      document.querySelector('#langEnBtn').click(); const en=document.querySelector('#langEnBtn').classList.contains('active');
      document.querySelector('#langBgBtn').click(); const bg=document.querySelector('#langBgBtn').classList.contains('active');
      return {assets,properties,en,bg,errors:__vfErrors};
    })()`);
    assert(info.assets && info.properties && info.en && info.bg && info.errors.length === 0, JSON.stringify(info));
    return info;
  });
} finally {
  cdp.close();
}

console.log("\nSTUDIO REGRESSION AUDIT");
for (const row of rows) {
  console.log(`${row.ok ? "PASS" : "FAIL"} | ${row.name} | ${typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail ?? {})}`);
}
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed.`);
if (failed.length) {
  console.error(`Failed checks: ${failed.map((row) => row.name).join(", ")}`);
  process.exit(1);
}
