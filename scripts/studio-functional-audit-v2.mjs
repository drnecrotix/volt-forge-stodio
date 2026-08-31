const DEBUG_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:8000/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let i = 0; i < 200; i += 1) {
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
      await new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      });
    }
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (!msg.id) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const out = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text || "Runtime error");
    return out.result?.value;
  }
  close() { this.ws.close(); }
}

const rows = [];
function assert(value, message) { if (!value) throw new Error(message); }
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
async function waitFor(cdp, expression, message, count = 120) {
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
    addEventListener('error', e => __vfErrors.push(String(e.error?.stack || e.message)));
    addEventListener('unhandledrejection', e => __vfErrors.push(String(e.reason?.stack || e.reason)));
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

  await check("boot has no runtime errors", async () => {
    const errors = await cdp.eval("window.__vfErrors");
    assert(errors.length === 0, JSON.stringify(errors));
  });

  await check("canvas stays inside physical application viewport", async () => {
    const g = await cdp.eval(`(() => { const r=document.querySelector('#workspaceWrap').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,innerHeight}; })()`);
    assert(g.height > 300 && g.bottom <= g.innerHeight + 2, JSON.stringify(g));
    return g;
  });

  await check("example circuit loads and is visible", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-studio-tab="samples"]')?.click(); document.querySelector('[data-sample="workingLed"]')?.click(); })()`);
    await waitFor(cdp, "document.querySelectorAll('#componentLayer .component').length===4", "working LED example did not render");
    await sleep(200);
    const info = await cdp.eval(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); const c=[...document.querySelectorAll('#componentLayer .component')]; return {count:c.length,visible:c.some(n=>{const r=n.getBoundingClientRect();return r.right>w.left&&r.left<w.right&&r.bottom>w.top&&r.top<w.bottom;})}; })()`);
    assert(info.visible, JSON.stringify(info));
    return info;
  });

  await check("Assets search is global across catalog categories", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-studio-tab="components"]')?.click(); const i=document.querySelector('#componentSearch'); i.value='резистор'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor(cdp, "Number(document.querySelector('#componentSearch')?.dataset.matches || 0) > 0", "global search did not settle");
    await sleep(50);
    const info = await cdp.eval(`(() => { const cards=[...document.querySelectorAll('#palette .palette-card')]; return {all:cards.length,visible:cards.filter(x=>!x.hidden).length,matches:Number(document.querySelector('#componentSearch').dataset.matches||0)}; })()`);
    assert(info.visible > 0 && info.visible < info.all && info.matches === info.visible, JSON.stringify(info));
    await cdp.eval(`(() => { const i=document.querySelector('#componentSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    return info;
  });

  await check("palette quick-add creates a selected component", async () => {
    const before = await cdp.eval("document.querySelectorAll('#componentLayer .component').length");
    await cdp.eval("document.querySelector('#palette .palette-card')?.click()");
    await waitFor(cdp, `document.querySelectorAll('#componentLayer .component').length>${before}`, "quick add failed");
    const info = await cdp.eval(`(() => ({count:document.querySelectorAll('#componentLayer .component').length,selected:Boolean(document.querySelector('#componentLayer .component.selected'))}))()`);
    assert(info.selected, JSON.stringify(info));
    return info;
  });

  await check("Select + Rotate changes the selected component", async () => {
    const info = await cdp.eval(`(() => {
      document.querySelector('#toolSelectBtn')?.click();
      const selected=document.querySelector('#componentLayer .component.selected') || document.querySelector('#componentLayer .component');
      const id=selected.dataset.componentId;
      const before=selected.getAttribute('transform');
      document.querySelector('#rotateBtn')?.click();
      const refreshed=document.querySelector('#componentLayer .component[data-component-id="'+id+'"]');
      return {id,before,after:refreshed?.getAttribute('transform'),selected:refreshed?.classList.contains('selected')};
    })()`);
    assert(info.selected && info.before !== info.after, JSON.stringify(info));
    return info;
  });

  await check("tool keyboard shortcuts V/W/P/H select correct modes", async () => {
    const out = {};
    for (const key of ['v','w','p','h']) {
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}))`);
      await sleep(30);
      out[key] = await cdp.eval("document.body.dataset.activeStudioTool");
    }
    assert(out.v==='select'&&out.w==='wire'&&out.p==='pencil'&&out.h==='pan', JSON.stringify(out));
    return out;
  });

  await check("Auto Wire and Manual Route have distinct UI guidance", async () => {
    const info = await cdp.eval(`(() => { document.querySelector('#toolWireBtn').click(); const wire={label:document.querySelector('#studioToolLabel').textContent,hint:document.querySelector('#studioToolHint').textContent}; document.querySelector('#toolPencilBtn').click(); const pencil={label:document.querySelector('#studioToolLabel').textContent,hint:document.querySelector('#studioToolHint').textContent}; return {wire,pencil}; })()`);
    assert(info.wire.label !== info.pencil.label && info.wire.hint !== info.pencil.hint, JSON.stringify(info));
    return info;
  });

  await check("Auto Wire creates a direct terminal-to-terminal wire", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'audit auto wire',{recordHistory:false})`);
    await sleep(100);
    const info = await cdp.eval(`(() => {
      document.querySelector('#toolWireBtn').click();
      const groups=[...document.querySelectorAll('#componentLayer .component')];
      const a=groups.find(x=>x.dataset.componentId==='source-a').querySelectorAll('.terminal-hit')[0];
      const b=groups.find(x=>x.dataset.componentId==='resistor-b').querySelectorAll('.terminal-hit')[0];
      for (const t of [a,b]) { const r=t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:91,clientX:r.left+r.width/2,clientY:r.top+r.height/2})); }
      const data=serializeCircuit();
      return {wireCount:data.wires.length,points:data.wires.at(-1)?.points?.length ?? 0};
    })()`);
    assert(info.wireCount === 1 && info.points === 0, JSON.stringify(info));
    return info;
  });

  await check("Manual Route creates a wire with an intermediate bend", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'audit manual route',{recordHistory:false})`);
    await sleep(100);
    const info = await cdp.eval(`(() => {
      document.querySelector('#toolPencilBtn').click();
      const source=document.querySelector('#componentLayer .component[data-component-id="source-a"] .terminal-hit');
      const target=document.querySelector('#componentLayer .component[data-component-id="resistor-b"] .terminal-hit');
      const sr=source.getBoundingClientRect(); source.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:92,clientX:sr.left+sr.width/2,clientY:sr.top+sr.height/2}));
      const wrap=document.querySelector('#workspaceWrap').getBoundingClientRect();
      document.querySelector('#workspaceStage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:93,clientX:wrap.left+wrap.width*.52,clientY:wrap.top+wrap.height*.35}));
      const tr=target.getBoundingClientRect(); target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:94,clientX:tr.left+tr.width/2,clientY:tr.top+tr.height/2}));
      const data=serializeCircuit();
      return {wireCount:data.wires.length,points:data.wires.at(-1)?.points?.length ?? 0};
    })()`);
    assert(info.wireCount === 1 && info.points >= 1, JSON.stringify(info));
    return info;
  });

  await check("component drag changes world coordinates and Undo restores them", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'audit drag',{recordHistory:true})`);
    await sleep(100);
    const info = await cdp.eval(`(() => {
      document.querySelector('#toolSelectBtn').click();
      const node=document.querySelector('#componentLayer .component[data-component-id="resistor-b"]');
      const before=serializeCircuit().components.find(x=>x.id==='resistor-b');
      const r=node.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2;
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:101,clientX:x,clientY:y}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,button:0,pointerId:101,clientX:x+100,clientY:y+60}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:101,clientX:x+100,clientY:y+60}));
      const after=serializeCircuit().components.find(x=>x.id==='resistor-b');
      document.querySelector('#undoBtn').click();
      const undone=serializeCircuit().components.find(x=>x.id==='resistor-b');
      return {before:{x:before.x,y:before.y},after:{x:after.x,y:after.y},undone:{x:undone.x,y:undone.y}};
    })()`);
    assert(info.before.x !== info.after.x || info.before.y !== info.after.y, JSON.stringify(info));
    assert(info.before.x === info.undone.x && info.before.y === info.undone.y, `Undo failed: ${JSON.stringify(info)}`);
    return info;
  });

  await check("Pan tool changes canvas scroll position", async () => {
    const info = await cdp.eval(`(() => {
      document.querySelector('#toolPanBtn').click(); const w=document.querySelector('#workspaceWrap');
      const before={left:w.scrollLeft,top:w.scrollTop}; const r=w.getBoundingClientRect(); const x=r.left+r.width*.25,y=r.top+r.height*.25;
      document.querySelector('#workspaceStage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:111,clientX:x,clientY:y}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,button:0,pointerId:111,clientX:x-80,clientY:y-60}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:111,clientX:x-80,clientY:y-60}));
      return {before,after:{left:w.scrollLeft,top:w.scrollTop}};
    })()`);
    assert(info.before.left !== info.after.left || info.before.top !== info.after.top, JSON.stringify(info));
    return info;
  });

  await check("zoom +/-/reset and Fit stay functional", async () => {
    const info = await cdp.eval(`(() => { const z=()=>document.querySelector('#zoomResetBtn').textContent; const before=z(); document.querySelector('#zoomInBtn').click(); const plus=z(); document.querySelector('#zoomOutBtn').click(); document.querySelector('#zoomResetBtn').click(); document.querySelector('#fitCanvasBtn').click(); return {before,plus,reset:z()}; })()`);
    assert(info.plus !== info.before && info.reset === '100%', JSON.stringify(info));
    await sleep(150);
    const visible = await cdp.eval(`(() => { const w=document.querySelector('#workspaceWrap').getBoundingClientRect(); return [...document.querySelectorAll('#componentLayer .component')].some(n=>{const r=n.getBoundingClientRect();return r.right>w.left&&r.left<w.right&&r.bottom>w.top&&r.top<w.bottom;}); })()`);
    assert(visible, "Fit lost the schematic");
    return info;
  });

  await check("multi-document tabs create and restore independent content", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'audit tabs',{recordHistory:false})`); await sleep(80);
    const before = await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-add-tab').click()"); await sleep(80);
    const blank = await cdp.eval("serializeCircuit().components.length");
    const after = await cdp.eval("document.querySelectorAll('.document-tab[data-document-id]').length");
    await cdp.eval("document.querySelector('.document-tab[data-document-id=\"1\"]')?.click()"); await sleep(120);
    const restored = await cdp.eval("serializeCircuit().components.length");
    assert(after===before+1 && blank===0 && restored===3, JSON.stringify({before,after,blank,restored}));
    return {before,after,blank,restored};
  });

  await check("new schematic tab is compact", async () => {
    const size=await cdp.eval(`(() => {const r=document.querySelector('.document-add-tab').getBoundingClientRect();return {width:r.width,height:r.height}})()`);
    assert(size.width <= 64, JSON.stringify(size));
    return size;
  });

  await check("Help opens standalone shortcuts and Guide is absent from Assets", async () => {
    const info=await cdp.eval(`(() => { document.querySelector('[data-menu-trigger="help"]').click(); document.querySelector('[data-menu="help"] [data-menu-action="shortcuts"]').click(); const d=document.querySelector('.vf-help-dialog'); return {open:Boolean(d&&!d.hidden),shortcuts:!d?.querySelector('[data-vf-help-panel="shortcuts"]')?.hidden,guideAsset:Boolean(document.querySelector('[data-studio-tab="guide"]'))}; })()`);
    assert(info.open && info.shortcuts && !info.guideAsset, JSON.stringify(info));
    await cdp.eval("document.querySelector('.vf-help-dialog [data-vf-help-close]').click()");
    return info;
  });

  const analysisCases=[['spiceBtn','SPICE'],['analysisBtn','Transient'],['waveformsBtn','Waveform'],['frequencyBtn','Frequency'],['scanBtn','scan']];
  for (const [id,expected] of analysisCases) {
    await check(`Analysis ${id} always opens a visible window`, async () => {
      await cdp.eval(`(() => { document.querySelector('[data-menu-trigger="analysis"]').click(); document.querySelector('[data-menu="analysis"] [data-proxy-click="${id}"]').click(); })()`);
      await waitFor(cdp, "[...document.querySelectorAll('.analysis-modal')].some(x=>!x.classList.contains('hidden'))", `${id} opened no window`);
      const info=await cdp.eval(`(() => {const open=[...document.querySelectorAll('.analysis-modal')].filter(x=>!x.classList.contains('hidden'));return {titles:open.map(x=>x.querySelector('h2,h3,[data-title]')?.textContent||x.textContent.slice(0,80))}})()`);
      assert(info.titles.some(x=>x.toLowerCase().includes('${expected.toLowerCase()}')), JSON.stringify(info));
      await cdp.eval(`document.querySelectorAll('.analysis-modal:not(.hidden) [data-close-btn], .analysis-modal:not(.hidden) [data-close]').forEach(x=>x.click())`);
      return info;
    });
  }

  await check("diagnostics summary, filters and rerun action work", async () => {
    await cdp.eval(`(() => { document.querySelector('[data-property-tab="diagnostics"]').click(); document.querySelector('.vf-run-diagnostics')?.click(); })()`); await sleep(180);
    const info=await cdp.eval(`(() => ({dashboard:Boolean(document.querySelector('.vf-diagnostics-dashboard')),lines:document.querySelectorAll('#diagnostics .diagnostic-console-line').length,counters:[...document.querySelectorAll('.vf-diag-summary [data-vf-diag-count] span')].map(x=>+x.textContent||0),filters:document.querySelectorAll('[data-vf-diag-filter]').length,health:document.querySelector('.vf-diag-health strong')?.textContent}))()`);
    assert(info.dashboard && info.filters>=4 && info.counters.reduce((a,b)=>a+b,0)===info.lines, JSON.stringify(info));
    await cdp.eval("document.querySelector('[data-vf-diag-filter=\"warning\"]')?.click()");
    const filtered=await cdp.eval("[...document.querySelectorAll('#diagnostics .diagnostic-console-line')].filter(x=>!x.hidden).every(x=>x.classList.contains('warning'))");
    assert(filtered, "diagnostic warning filter leaked other entries");
    return info;
  });

  await check("component editor opens and numeric wheel does not change a value", async () => {
    await cdp.eval(`loadCircuitData(${simpleCircuit},'audit editor',{recordHistory:false})`); await sleep(100);
    await cdp.eval(`(() => { const n=document.querySelector('#componentLayer .component[data-component-id="source-a"]'); const r=n.getBoundingClientRect(); document.querySelector('#toolSelectBtn').click(); n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:131,clientX:r.left+r.width/2,clientY:r.top+r.height/2})); document.querySelector('#inspector .inspector-summary-actions button')?.click(); })()`); await sleep(100);
    const info=await cdp.eval(`(() => { const m=[...document.querySelectorAll('.analysis-modal')].find(x=>!x.classList.contains('hidden')&&x.querySelector('[data-editor-body]')); if(!m)return null; const input=m.querySelector('input[type="number"]'); const before=input?.value; input?.focus(); input?.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100})); return {exists:true,fields:m.querySelectorAll('.property-field').length,before,after:input?.value,activeTag:document.activeElement?.tagName}; })()`);
    assert(info?.exists && info.fields>0 && info.before===info.after, JSON.stringify(info));
    return info;
  });

  await check("Assets/Properties panel toggles collapse and restore", async () => {
    const info=await cdp.eval(`(() => {const s=document.querySelector('#studioShell'),a=document.querySelector('#assetsToggleBtn'),p=document.querySelector('#propertiesToggleBtn');a.click();const a1=s.classList.contains('assets-collapsed');a.click();const a2=s.classList.contains('assets-collapsed');p.click();const p1=s.classList.contains('properties-collapsed');p.click();const p2=s.classList.contains('properties-collapsed');return {a1,a2,p1,p2}})()`);
    assert(info.a1&&!info.a2&&info.p1&&!info.p2, JSON.stringify(info));
    return info;
  });

  await check("language switch BG/EN round-trips", async () => {
    const info=await cdp.eval(`(() => {document.querySelector('#langEnBtn').click();const en=document.querySelector('#langEnBtn').classList.contains('active');document.querySelector('#langBgBtn').click();const bg=document.querySelector('#langBgBtn').classList.contains('active');return {en,bg}})()`);
    assert(info.en&&info.bg, JSON.stringify(info));
    return info;
  });

  await check("final session has no uncaught runtime errors", async () => {
    const errors=await cdp.eval("window.__vfErrors");
    assert(errors.length===0, JSON.stringify(errors));
  });
} finally {
  cdp.close();
}

console.log("\nSTUDIO FULL FUNCTIONAL AUDIT V2");
for (const row of rows) console.log(`${row.ok?'PASS':'FAIL'} | ${row.name} | ${typeof row.detail==='string'?row.detail:JSON.stringify(row.detail)}`);
const failed=rows.filter(x=>!x.ok);
console.log(`\n${rows.length-failed.length}/${rows.length} checks passed.`);
if (failed.length) {
  console.error(`Failed: ${failed.map(x=>x.name).join(', ')}`);
  process.exitCode=1;
}
