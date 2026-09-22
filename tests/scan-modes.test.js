import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const popupHtml = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "src/popup/popup.js"), "utf8");
const scanner = fs.readFileSync(path.join(root, "src/content/instagram-scanner.js"), "utf8");

test("popup oferece os dois modos como ações independentes", () => {
  assert.match(popupHtml, /id="scanUnfollowers"/);
  assert.match(popupHtml, /id="scanNonFollowers"/);
  assert.match(popupJs, /startScan\("unfollowers"\)/);
  assert.match(popupJs, /startScan\("nonFollowers"\)/);
});

test("não seguidores não aciona o fallback visual de seguidores", () => {
  assert.match(scanner, /if \(mode === "nonFollowers"\) throw error;/);
  assert.match(scanner, /if \(mode === "nonFollowers"\) \{\s*throw new Error\("Não foi possível acessar as listas/);
});

test("progresso é reportado por lista, sem somar seguidores e seguindo", () => {
  assert.doesNotMatch(scanner, /combinedExpected/);
  assert.match(scanner, /count,\s*expected,\s*account/);
});

test("contas seguidas aceitam divergência final pequena", () => {
  assert.match(scanner, /Math\.max\(2, Math\.ceil\(expected \* 0\.01\)\)/);
});
