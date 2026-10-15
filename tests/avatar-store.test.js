import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarStore } from "../src/core/avatar-store.js";

test("limita bytes/quantidade com gravações concorrentes e após reiniciar", async (t) => {
  const original = globalThis.caches;
  t.after(() => { globalThis.caches = original; });
  const entries = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  globalThis.caches = { async open() { return {
    async match(request) { return entries.get(key(request))?.clone(); },
    async put(request, response) { entries.set(key(request), response.clone()); },
    async delete(request) { return entries.delete(key(request)); },
    async keys() { return [...entries.keys()].map((url) => new Request(url)); }
  }; } };
  const url = (index) => `https://scontent.cdninstagram.com/${index}.jpg`;
  const store = createAvatarStore({ maxBytes: 6, maxEntries: 2 });
  await Promise.all([0, 1, 2].map((index) => store.put(url(index), new Uint8Array(3), "image/jpeg")));
  assert.equal(await store.get(url(0)), undefined);
  assert.equal(entries.size, 2);
  const restarted = createAvatarStore({ maxBytes: 6, maxEntries: 2 });
  await restarted.put(url(3), new Uint8Array(4), "image/jpeg");
  assert.equal(entries.size, 1, "a soma dos bytes deve continuar limitada após reinício");
  assert.ok(await restarted.get(url(3)));
  await restarted.put(url(4), new Uint8Array(7), "image/jpeg");
  assert.equal(entries.size, 1, "imagem acima do orçamento não remove as fotos válidas");
  await restarted.put(url(5), new Uint8Array(0), "image/jpeg");
  await restarted.put(url(6), new Uint8Array(0), "image/jpeg");
  assert.equal(entries.size, 2, "o limite de quantidade vale mesmo para respostas pequenas");
});
