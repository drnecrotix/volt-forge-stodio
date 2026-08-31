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
    } catch {
      // Chrome may still be starting.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the headless Chrome page target.");
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
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

const geometryExpression = (label) => `(() => {
  const wrap = document.querySelector('#workspaceWrap');
  const stage = document.querySelector('#workspaceStage');
  const svg = document.querySelector('#workspace');
  const layer = document.querySelector('#componentLayer');
  const components = [...layer.querySelectorAll('.component')];
  const selected = layer.querySelector('.component.selected') || components[0] || null;
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const wrapRect = rect(wrap);
  const componentRect = rect(selected);
  const visible = Boolean(componentRect && wrapRect &&
    componentRect.right >= wrapRect.left && componentRect.left <= wrapRect.right &&
    componentRect.bottom >= wrapRect.top && componentRect.top <= wrapRect.bottom);
  return {
    label: ${JSON.stringify(label)},
    ready: document.readyState,
    components: components.length,
    selectedTransform: selected?.getAttribute('transform') || null,
    wrap: {
      clientWidth: wrap.clientWidth,
      clientHeight: wrap.clientHeight,
      scrollWidth: wrap.scrollWidth,
      scrollHeight: wrap.scrollHeight,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
      rect: wrapRect,
    },
    stage: {
      styleWidth: stage.style.width,
      styleHeight: stage.style.height,
      clientWidth: stage.clientWidth,
      clientHeight: stage.clientHeight,
      scrollWidth: stage.scrollWidth,
      scrollHeight: stage.scrollHeight,
    },
    svg: {
      styleWidth: svg.style.width,
      styleHeight: svg.style.height,
      clientWidth: svg.clientWidth,
      clientHeight: svg.clientHeight,
      viewBox: svg.getAttribute('viewBox'),
      rect: rect(svg),
    },
    componentRect,
    componentVisible: visible,
    studioReady: document.querySelector('#studioShell')?.dataset.studioReady || null,
    status: document.querySelector('#statusChip')?.textContent || null,
  };
})()`;

async function waitForReady(client) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const ready = await client.evaluate("document.readyState");
    const shell = await client.evaluate("document.querySelector('#studioShell')?.dataset.studioReady || null");
    if (ready === "complete" && shell === "true") return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for VoltForge Studio to initialize.");
}

async function waitForComponents(client, minimum) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const count = await client.evaluate("document.querySelectorAll('#componentLayer .component').length");
    if (count >= minimum) return count;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${minimum} rendered components.`);
}

const target = await waitForTarget();
const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send("Runtime.enable");
await client.send("Page.enable");

try {
  await client.send("Page.navigate", { url: APP_URL });
  await waitForReady(client);
  await waitForComponents(client, 4);
  await sleep(400);

  const initial = await client.evaluate(geometryExpression("initial-working-led"));
  console.log("CANVAS_DIAGNOSTIC", JSON.stringify(initial, null, 2));

  await client.evaluate(`(() => {
    document.querySelector('[data-studio-tab="samples"]')?.click();
    document.querySelector('.sample-btn[data-sample="openSwitch"]')?.click();
  })()`);
  await waitForComponents(client, 4);
  await sleep(400);
  const sample = await client.evaluate(geometryExpression("after-example-click"));
  console.log("CANVAS_DIAGNOSTIC", JSON.stringify(sample, null, 2));

  await client.evaluate(`(() => {
    document.querySelector('[data-studio-tab="components"]')?.click();
    document.querySelector('.palette-card')?.click();
  })()`);
  await waitForComponents(client, 5);
  await sleep(400);
  const added = await client.evaluate(geometryExpression("after-component-add"));
  console.log("CANVAS_DIAGNOSTIC", JSON.stringify(added, null, 2));

  const failures = [initial, sample, added].filter((snapshot) => !snapshot.componentVisible);
  if (failures.length) {
    throw new Error(`Rendered components are outside the visible canvas in: ${failures.map((item) => item.label).join(", ")}`);
  }
} finally {
  client.close();
}
