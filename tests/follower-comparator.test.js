import test from "node:test";
import assert from "node:assert/strict";
import { compareFollowers, normalizeUsername, toFollowerMap } from "../src/core/follower-comparator.js";

test("normaliza @ e caixa do username", () => {
  assert.equal(normalizeUsername(" @Murillo.MTZ "), "murillo.mtz");
});

test("indexa seguidores pelo username", () => {
  const map = toFollowerMap([
    { username: "Pessoa_1", name: "Pessoa Um", avatarUrl: "https://img/1" },
    { username: "@pessoa_2", name: "Pessoa Dois" }
  ]);
  assert.deepEqual(Object.keys(map), ["pessoa_1", "pessoa_2"]);
  assert.equal(map.pessoa_1.profileUrl, "https://www.instagram.com/pessoa_1/");
});

test("retorna somente quem existia antes e sumiu", () => {
  const previous = toFollowerMap([
    { username: "ana", name: "Ana" },
    { username: "bruno", name: "Bruno" }
  ]);
  const current = toFollowerMap([
    { username: "bruno", name: "Bruno" },
    { username: "carla", name: "Carla" }
  ]);

  assert.deepEqual(compareFollowers(previous, current).map((item) => item.username), ["ana"]);
});

test("não altera os mapas recebidos", () => {
  const previous = toFollowerMap([{ username: "ana" }]);
  const current = toFollowerMap([]);
  compareFollowers(previous, current);
  assert.ok(previous.ana);
  assert.deepEqual(Object.keys(current), []);
});
