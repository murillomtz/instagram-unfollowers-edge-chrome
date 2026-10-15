const CACHE_NAME = "profile-avatars-v1";
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 1000;

// Store image bytes separately so photos cannot exhaust the snapshot JSON quota.
export function createAvatarStore({ maxBytes = MAX_CACHE_BYTES, maxEntries = MAX_CACHE_ENTRIES } = {}) {
  let statePromise;
  let writes = Promise.resolve();

  async function state() {
    if (!statePromise) {
      statePromise = (async () => {
        const cache = await caches.open(CACHE_NAME);
        const entries = new Map();
        let bytes = 0;
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          const size = Number(response?.headers.get("content-length")) || 0;
          entries.set(request.url, size);
          bytes += size;
        }
        return { cache, entries, bytes };
      })().catch((error) => { statePromise = undefined; throw error; });
    }
    return statePromise;
  }

  return {
    async get(url) {
      try {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(url);
      } catch {
        return undefined;
      }
    },
    put(url, buffer, contentType) {
      const write = writes.then(async () => {
        if (buffer.byteLength > maxBytes || maxEntries < 1) return;
        const stored = await state();
        // Serialized writes keep the byte/count limits correct under concurrent loads.
        if (stored.entries.has(url)) return;
        while (stored.entries.size && (stored.bytes + buffer.byteLength > maxBytes || stored.entries.size >= maxEntries)) {
          const [oldest, size] = stored.entries.entries().next().value;
          await stored.cache.delete(oldest);
          stored.entries.delete(oldest);
          stored.bytes -= size;
        }
        await stored.cache.put(url, new Response(buffer, { headers: {
          "content-type": contentType,
          "content-length": String(buffer.byteLength)
        } }));
        stored.entries.set(url, buffer.byteLength);
        stored.bytes += buffer.byteLength;
      });
      // A full/unavailable cache must never discard a valid scan or image response.
      writes = write.catch(() => undefined);
      return writes;
    }
  };
}
