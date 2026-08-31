const DEBUG_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:8000/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
]);

async function waitForTarget() {
  for (let i = 0; i < 150; i += 1) {
    try {
      const targets = await (await fetch(`${DEBUG_URL}/json`)).json();
      const target = targets.find((entry) => entry.type === "page");
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome DevTools target not available");
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
  }
  async connect() {
    if (this.ws.readyState !== WebSocket.OPEN) {
      await withTimeout(new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      }), 5000, "CDP connect");
    }
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return withTimeout(new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    }), 5000, method);
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }
  close() { this.ws.close(); }
}

const rows = [];
function assert(value, message) { if (!value) throw new Error(message); }
async function check(name, fn) {
  try {
    const detail = await withTimeout(fn(), 9000, name);
    rows.push({ name, ok: true, detail });
    console.log(`PASS | ${name}`, detail ?? "");
  } catch (error) {
    rows.push({ name, ok: false, detail: error.message });
    console.error(`FAIL | ${name} | ${error.message}`);
  }
}
async function waitFor(cdp, expression, message, count = 100) {
  for (let i = 0; i < count; i += 1) {
    if (await cdp.eval(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

const target = await waitForTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    window.__vfErrors = [];
    addEventListener('error', e => __vfErrors.push(String(e.error?.stack || e.message || 'error')));
    addEventListener('unhandledrejection', e => __vfErrors.push(String(e.reason?.stack || e.reason || 'rejection')));
  })();`,
});

const simpleCircuit = `({
  components: [
    { id:'source-a', type:'source', x:610, y:350, rotation:0, properties:{label:'V1', voltage:9} },
    { id:'resistor-b', type:'resistor', x:880, y:260, rotation:0, properties:{label:'R1', resistance:330} },
    { id:'ground-c', type:'ground', x:610, y:500, rotation:0, properties:{label:'GND'} }
  ],
  wires: []
})`;

try {
  await cdp.send("Page.navigate", { url: APP_URL });
  await waitFor(cdp, "document.readyState==='complete' && document.querySelector('#studioShell')?.dataset.studioReady==='true'", "Studio failed to initialize");
  await sleep(300);

  await check("boot/runtime", async () => {
    const errors = await cdp.eval("window.__vfErrors");
    assert(errors.length === 0, JSON.stringify(errors));
    return "no uncaught errors";
  });

  await check("canvas viewport", async () => {
    const g = await cdp.eval(`(() => { const r=document.querySelector('#workspaceWrap').getBoundingClientRect(); return {height:r.height,bottom:r.bottom,innerHeight}; })()`);
    assert(g.height > 300 && g.bottom <= g.innerHeight + 2, JSON.stringify(g));
    return g;
  });

  await check("example load", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-studio-tab="samples"]')?.click(); document.querySelector('[data-sample="workingLed"]')?.click(); })()`);
    await waitFor(cdp, "document.querySelectorAll('#componentLayer .component').length===4", "example did not render");
    const visible = await cdp.eval(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); return [...document.querySelectorAll('#componentLayer .component')].some(n=>{const r=n.getBoundingClientRect();return r.right>w.left&&r.left<w.right&&r.bottom>w.top&&r.top<w.bottom;}); })()`);
    assert(visible, "example is outside viewport");
    return "4 components visible";
  });

  await check("global Assets search", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-studio-tab="components"]')?.click(); const i=document.querySelector('#componentSearch'); i.value='резистор'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(250);
    const info = await cdp.eval(`(() => { const cards=[...document.querySelectorAll('#palette .palette-card')]; return {all:cards.length,visible:cards.filter(x=>!x.hidden && getComputedStyle(x).display!=='none').length,text:cards.filter(x=>!x.hidden && getComputedStyle(x).display!=='none').slice(0,4).map(x=>x.textContent)}; })()`);
    assert(info.visible > 0 && info.visible < info.all, JSON.stringify(info));
    assert(info.text.every(x => x.toLocaleLowerCase().includes('резистор')), JSON.stringify(info));
    await cdp.eval(`(() => { const i=document.querySelector('#componentSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    return info;
  });

  await check("quick add/select/rotate", async () => {
    const before = await cdp.eval("document.querySelectorAll('#componentLayer .component').length");
    await cdp.eval("document.querySelector('#palette .palette-card')?.click()");
    await waitFor(cdp, `document.querySelectorAll('#componentLayer .component').length>${before}`, "quick add failed");
    const info = await cdp.eval(`(() => { const n=document.querySelector('#componentLayer .component.selected'); if(!n)return null; const id=n.dataset.componentId; const a=n.getAttribute('transform'); document.querySelector('#rotateBtn').click(); const b=document.querySelector('#componentLayer .component[data-component-id="'+id+'"]').getAttribute('transform'); return {id,before:a,after:b}; })()`);
    assert(info && info.before !== info.after, JSON.stringify(info));
    return info;
  });

  await check("tool shortcuts and guidance", async () => {
    const modes={};
    for (const key of ['v','w','p','h']) {
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}))`);
      await sleep(30);
      modes[key]=await cdp.eval("document.body.dataset.activeStudioTool");
    }
    assert(modes.v==='select'&&modes.w==='wire'&&modes.p==='pencil'&&modes.h==='pan', JSON.stringify(modes));
    const hints=await cdp.eval(`(() => { document.querySelector('#toolWireBtn').click(); const w=document.querySelector('#studioToolHint').textContent; document.querySelector('#toolPencilBtn').click(); const p=document.querySelector('#studioToolHint').textContent; return {w,p}; })()`);
    assert(hints.w !== hints.p, JSON.stringify(hints));
    return {modes,hints};
  });

  await check("Auto Wire terminal-to-terminal", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'auto-wire-audit',{recordHistory:false})`);
    await sleep(120);
    const info=await cdp.eval(`(() => {
      document.querySelector('#toolWireBtn').click();
      const a=document.querySelector('#componentLayer .component[data-component-id="source-a"] .terminal-anchor[data-terminal-index="0"] .terminal-hit-area');
      const b=document.querySelector('#componentLayer .component[data-component-id="resistor-b"] .terminal-anchor[data-terminal-index="0"] .terminal-hit-area');
      if(!a||!b)return {missing:true};
      [a,b].forEach((t,i)=>{const r=t.getBoundingClientRect();t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:90+i,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));});
      const d=serializeCircuit(); return {missing:false,wires:d.wires.length,points:d.wires.at(-1)?.points?.length||0};
    })()`);
    assert(!info.missing && info.wires===1, JSON.stringify(info));
    return info;
  });

  await check("Manual Route with bend", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'manual-wire-audit',{recordHistory:false})`);
    await sleep(120);
    const info=await cdp.eval(`(() => {
      document.querySelector('#toolPencilBtn').click();
      const a=document.querySelector('#componentLayer .component[data-component-id="source-a"] .terminal-anchor[data-terminal-index="0"] .terminal-hit-area');
      const b=document.querySelector('#componentLayer .component[data-component-id="resistor-b"] .terminal-anchor[data-terminal-index="0"] .terminal-hit-area');
      if(!a||!b)return {missing:true};
      let r=a.getBoundingClientRect(); a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:101,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      const s=document.querySelector('#workspaceStage'); const wr=document.querySelector('#workspaceWrap').getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:102,clientX:wr.left+wr.width*.5,clientY:wr.top+wr.height*.32}));
      r=b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:103,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      const d=serializeCircuit(); return {missing:false,wires:d.wires.length,points:d.wires.at(-1)?.points?.length||0};
    })()`);
    assert(!info.missing && info.wires===1 && info.points>=1, JSON.stringify(info));
    return info;
  });

  await check("drag + Undo", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'drag-audit',{recordHistory:true})`); await sleep(100);
    const info=await cdp.eval(`(() => { document.querySelector('#toolSelectBtn').click(); const n=document.querySelector('#componentLayer .component[data-component-id="resistor-b"]'); const before=serializeCircuit().components.find(x=>x.id==='resistor-b'); const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2; n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:111,clientX:x,clientY:y})); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:111,clientX:x+80,clientY:y+40})); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:111,clientX:x+80,clientY:y+40})); const after=serializeCircuit().components.find(x=>x.id==='resistor-b'); document.querySelector('#undoBtn').click(); const undone=serializeCircuit().components.find(x=>x.id==='resistor-b'); return {before:[before.x,before.y],after:[after.x,after.y],undone:[undone.x,undone.y]}; })()`);
    assert(String(info.before)!==String(info.after) && String(info.before)===String(info.undone), JSON.stringify(info));
    return info;
  });

  await check("Pan / Zoom / Fit", async () => {
    const info=await cdp.eval(`(() => { const w=document.querySelector('#workspaceWrap'); document.querySelector('#toolPanBtn').click(); const before=[w.scrollLeft,w.scrollTop]; const r=w.getBoundingClientRect(),x=r.left+r.width*.3,y=r.top+r.height*.3; document.querySelector('#workspaceStage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:121,clientX:x,clientY:y})); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:121,clientX:x-70,clientY:y-50})); window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:121,clientX:x-70,clientY:y-50})); const after=[w.scrollLeft,w.scrollTop]; const z=()=>document.querySelector('#zoomResetBtn').textContent; const z0=z(); document.querySelector('#zoomInBtn').click(); const z1=z(); document.querySelector('#zoomResetBtn').click(); document.querySelector('#fitCanvasBtn').click(); return {before,after,z0,z1,z2:z()}; })()`);
    assert(String(info.before)!==String(info.after) && info.z1!==info.z0 && info.z2==='100%', JSON.stringify(info));
    return info;
  });

  await check("multi-document tabs", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'tabs-audit',{recordHistory:false})`); await sleep(80);
    const before=await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-add-tab').click()"); await sleep(100);
    const blank=await cdp.eval("serializeCircuit().components.length");
    const after=await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-tab[data-document-id=\"1\"]')?.click()"); await sleep(100);
    const restored=await cdp.eval("serializeCircuit().components.length");
    const addWidth=await cdp.eval("document.querySelector('.document-add-tab').getBoundingClientRect().width");
    assert(after===before+1 && blank===0 && restored===3 && addWidth<=64, JSON.stringify({before,after,blank,restored,addWidth}));
    return {before,after,blank,restored,addWidth};
  });

  await check("Help standalone", async () => {
    const info=await cdp.eval(`(() => { document.querySelector('[data-menu-trigger="help"]').click(); document.querySelector('[data-menu="help"] [data-menu-action="shortcuts"]').click(); const d=document.querySelector('.vf-help-dialog'); return {open:Boolean(d&&!d.hidden),shortcuts:Boolean(d?.querySelector('[data-vf-help-panel="shortcuts"]:not([hidden])')),assetGuide:Boolean(document.querySelector('[data-studio-tab="guide"]'))}; })()`);
    assert(info.open && info.shortcuts && !info.assetGuide, JSON.stringify(info));
    await cdp.eval("document.querySelector('.vf-help-dialog [data-vf-help-close]')?.click()");
    return info;
  });

  const analysisCases = [
    ['spiceBtn', /SPICE/i],
    ['analysisBtn', /Transient Analysis|Transient анализ/i],
    ['waveformsBtn', /Transient графики|Waveform/i],
    ['frequencyBtn', /Frequency|Честот/i],
    ['scanBtn', /Сканиране|Scan/i],
  ];
  for (const [id, pattern] of analysisCases) {
    await check(`Analysis ${id}`, async () => {
      await cdp.eval(`(() => { document.querySelector('[data-menu-trigger="analysis"]').click(); document.querySelector('[data-menu="analysis"] [data-proxy-click="${id}"]').click(); })()`);
      await sleep(150);
      const titles=await cdp.eval(`(() => [...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden')).map(x=>x.querySelector('[data-title],h2,h3')?.textContent||''))()`);
      assert(titles.some((title)=>pattern.test(title)), JSON.stringify(titles));
      await cdp.eval(`document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())`);
      await sleep(50);
      return titles;
    });
  }

  await check("Diagnostics dashboard", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-property-tab="diagnostics"]').click(); document.querySelector('.vf-run-diagnostics')?.click(); })()`); await sleep(180);
    const info=await cdp.eval(`(() => ({dashboard:Boolean(document.querySelector('.vf-diagnostics-dashboard')),lines:document.querySelectorAll('#diagnostics .diagnostic-console-line').length,counters:[...document.querySelectorAll('.vf-diag-summary [data-vf-diag-count] span')].map(x=>+x.textContent||0),filters:document.querySelectorAll('[data-vf-diag-filter]').length}))()`);
    assert(info.dashboard && info.filters>=4 && info.counters.reduce((a,b)=>a+b,0)===info.lines, JSON.stringify(info));
    return info;
  });

  await check("Component editor opens", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'editor-audit',{recordHistory:false})`); await sleep(100);
    await cdp.eval(`(() => { document.querySelector('[data-property-tab="inspector"]')?.click(); document.querySelector('#toolSelectBtn').click(); const n=document.querySelector('#componentLayer .component[data-component-id="source-a"]'); const r=n.getBoundingClientRect(); n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:131,clientX:r.left+r.width/2,clientY:r.top+r.height/2})); })()`); await sleep(80);
    await cdp.eval(`document.querySelector('#inspector .inspector-summary-actions button')?.click()`); await sleep(100);
    const info=await cdp.eval(`(() => { const m=[...document.querySelectorAll('.analysis-modal')].find(x=>!x.classList.contains('hidden')&&x.querySelector('[data-editor-body]')); return m?{open:true,fields:m.querySelectorAll('.property-field').length,numbers:m.querySelectorAll('input[type="number"]').length}:null; })()`);
    assert(info?.open && info.fields>0, JSON.stringify(info));
    await cdp.eval(`document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn]').forEach(x=>x.click())`);
    return info;
  });

  await check("panel toggles + language", async () => {
    const info=await cdp.eval(`(() => { const s=document.querySelector('#studioShell'); const a=document.querySelector('#assetsToggleBtn'),p=document.querySelector('#propertiesToggleBtn'); a.click(); const a1=s.classList.contains('assets-collapsed'); a.click(); p.click(); const p1=s.classList.contains('properties-collapsed'); p.click(); document.querySelector('#langEnBtn').click(); const en=document.querySelector('#langEnBtn').classList.contains('active'); document.querySelector('#langBgBtn').click(); const bg=document.querySelector('#langBgBtn').classList.contains('active'); return {a1,p1,en,bg}; })()`);
    assert(info.a1&&info.p1&&info.en&&info.bg, JSON.stringify(info));
    return info;
  });

  await check("final runtime errors", async () => {
    const errors=await cdp.eval("window.__vfErrors");
    assert(errors.length===0, JSON.stringify(errors));
    return "clean";
  });
} finally {
  cdp.close();
}

console.log("\nSTUDIO FUNCTIONAL AUDIT");
for (const row of rows) console.log(`${row.ok?'PASS':'FAIL'} | ${row.name} | ${typeof row.detail==='string'?row.detail:JSON.stringify(row.detail??{})}`);
const failed=rows.filter((row)=>!row.ok);
console.log(`\n${rows.length-failed.length}/${rows.length} checks passed.`);
if (failed.length) {
  console.error(`Failed checks: ${failed.map((row)=>row.name).join(', ')}`);
  process.exit(1);
}
