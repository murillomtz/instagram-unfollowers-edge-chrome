import assert from "node:assert/strict";
import test from "node:test";

const avatarUrl = "https://scontent.cdninstagram.com/avatar.jpg?expires=old";
const imageBytes = new Uint8Array([255, 216, 255, 217]);

function createCacheStorage() {
  const entries = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  const cache = {
    async match(request) { return entries.get(key(request))?.clone(); },
    async put(request, response) { entries.set(key(request), response.clone()); },
    async delete(request) { return entries.delete(key(request)); },
    async keys() { return [...entries.keys()].map((url) => new Request(url)); }
  };
  return { async open() { return cache; } };
}

async function setup(t) {
  const originals = { chrome: globalThis.chrome, fetch: globalThis.fetch, caches: globalThis.caches };
  t.after(() => Object.assign(globalThis, originals));
  const local = {};
  const session = { scanSession: { scanId: "test", status: "scanning", mode: "unfollowers", tabId: 1 } };
  let listener;
  const area = (data) => ({
    async get() { return structuredClone(data); },
    async set(changes) { Object.assign(data, structuredClone(changes)); }
  });
  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(callback) { listener = callback; } },
      getURL: (path) => `chrome-extension://test/${path}`
    },
    storage: { local: area(local), session: area(session) },
    tabs: { async create() {} }
  };
  globalThis.caches = createCacheStorage();
  let requests = 0;
  let expired = false;
  globalThis.fetch = async () => {
    requests += 1;
    return expired
      ? new Response("URL signature expired", { status: 403 })
      : new Response(imageBytes, { headers: { "content-type": "image/jpeg" } });
  };
  const restart = async () => {
    await import(`../src/background/service-worker.js?test=${crypto.randomUUID()}`);
  };
  await restart();
  return {
    local, session, restart,
    expire() { expired = true; },
    requests: () => requests,
    send(message) { return new Promise((resolve) => listener(message, { tab: { id: 1 } }, resolve)); }
  };
}

test("foto continua disponível após reiniciar o worker e a URL expirar", async (t) => {
  const app = await setup(t);
  const first = await app.send({ type: "LOAD_AVATAR", url: avatarUrl });
  assert.equal(first.ok, true);
  app.expire();
  await app.restart();
  const reopened = await app.send({ type: "LOAD_AVATAR", url: avatarUrl });
  assert.equal(reopened.ok, true, "a foto salva deve sobreviver à expiração da URL da CDN");
  assert.equal(reopened.dataUrl, first.dataUrl);
  assert.equal(app.requests(), 1, "reabrir o resultado deve usar os bytes locais");
});

test("salva a foto na lista-base para exibir quem saiu depois da expiração", async (t) => {
  const app = await setup(t);
  const baseline = await app.send({ type: "SCAN_COMPLETE", payload: {
    account: "conta", followers: [{ id: "123", username: "pessoa", avatarUrl }]
  } });
  assert.equal(baseline.ok, true);
  app.expire();
  await app.restart();
  const next = await app.send({ type: "SCAN_COMPLETE", payload: { account: "conta", followers: [] } });
  assert.equal(next.result.removed.length, 1);
  const image = await app.send({ type: "LOAD_AVATAR", url: next.result.removed[0].avatarUrl });
  assert.equal(image.ok, true, "a lista-base precisa preservar a imagem antes do unfollow");
});

test("preserva também as fotos do resultado de não seguidores", async (t) => {
  const app = await setup(t);
  app.session.scanSession.mode = "nonFollowers";
  const scan = await app.send({ type: "SCAN_COMPLETE", payload: {
    account: "conta", followers: [], following: [{ id: "123", username: "pessoa", avatarUrl }]
  } });
  assert.equal(scan.result.nonFollowers.length, 1);
  app.expire();
  await app.restart();
  assert.equal((await app.send({ type: "LOAD_AVATAR", url: avatarUrl })).ok, true);
});

test("falha de armazenamento das fotos não perde o snapshot nem impede a exibição", async (t) => {
  const app = await setup(t);
  globalThis.caches = { async open() { throw new Error("QuotaExceededError"); } };
  const scan = await app.send({ type: "SCAN_COMPLETE", payload: {
    account: "conta", followers: [{ username: "pessoa", avatarUrl }]
  } });
  assert.equal(scan.ok, true);
  assert.equal(app.local["followersSnapshot:conta"].total, 1);
  assert.equal((await app.send({ type: "LOAD_AVATAR", url: avatarUrl })).ok, true);
});

test("não persiste respostas inválidas e permite nova tentativa", async (t) => {
  const app = await setup(t);
  globalThis.fetch = async () => new Response("login", { headers: { "content-type": "text/html" } });
  assert.equal((await app.send({ type: "LOAD_AVATAR", url: avatarUrl })).ok, false);
  globalThis.fetch = async () => new Response(imageBytes, { headers: { "content-type": "image/jpeg" } });
  assert.equal((await app.send({ type: "LOAD_AVATAR", url: avatarUrl })).ok, true);
  assert.equal((await app.send({ type: "LOAD_AVATAR", url: "https://example.com/private" })).ok, false);
});

test("URL renovada é baixada sem reutilizar a foto antiga", async (t) => {
  const app = await setup(t);
  await app.send({ type: "LOAD_AVATAR", url: avatarUrl });
  const updated = await app.send({ type: "LOAD_AVATAR", url: avatarUrl.replace("old", "new") });
  assert.equal(updated.ok, true);
  assert.equal(app.requests(), 2);
});
