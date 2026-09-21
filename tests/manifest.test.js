import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("manifesto usa V3 e somente as permissões previstas", async () => {
  const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.instagram.com/*"]);
});

test("todos os arquivos declarados no manifesto existem", async () => {
  const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])])
  ];

  await Promise.all(paths.map((path) => access(resolve(projectRoot, path))));
});
