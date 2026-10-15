import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "src/background/service-worker.js",
  "src/content/instagram-scanner.js",
  "src/core/avatar-policy.js",
  "src/core/avatar-store.js",
  "src/core/follower-comparator.js",
  "src/dashboard/dashboard.js",
  "src/popup/popup.js"
];

const source = sourceFiles
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");

test("não contém mecanismos de execução ou envio proibidos", () => {
  const forbidden = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bWebSocket\s*\(/,
    /\bsendBeacon\s*\(/,
    /\bchrome\.cookies\b/,
    /\blocalStorage\b/,
    /\bindexedDB\b/
  ];

  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, `padrão proibido encontrado: ${pattern}`);
  }
});

test("não referencia hosts de aplicação externos", () => {
  const urls = [...source.matchAll(/https:\/\/([^/"'`]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(urls)].sort(), ["www.instagram.com"]);
});
