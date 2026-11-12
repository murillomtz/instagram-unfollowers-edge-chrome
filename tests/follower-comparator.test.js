import test from "node:test";
import assert from "node:assert/strict";
import { compareFollowers, findDisconnectedUsers, findNonFollowers, normalizeUsername, toFollowerMap } from "../src/core/follower-comparator.js";

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

test("mantém a identidade quando o username muda", () => {
  const previous = toFollowerMap([{ id: "42", username: "nome_antigo" }]);
  const current = toFollowerMap([{ id: "42", username: "nome_novo" }]);
  assert.deepEqual(compareFollowers(previous, current), []);
});

test("não confunde IDs diferentes que reutilizam o mesmo username", () => {
  const previous = toFollowerMap([{ id: "42", username: "mesmo_nome" }]);
  const current = toFollowerMap([{ id: "99", username: "mesmo_nome" }]);
  assert.deepEqual(compareFollowers(previous, current).map((item) => item.id), ["42"]);
  assert.deepEqual(
    findNonFollowers(current, [{ id: "42", username: "mesmo_nome" }]).map((item) => item.id),
    ["42"]
  );
});

test("calcula quem não segue de volta em O(n)", () => {
  const followers = [
    { id: "1", username: "a" },
    { id: "3", username: "c" },
    { id: "5", username: "e" }
  ];
  const following = [
    { id: "1", username: "a" },
    { id: "2", username: "b" },
    { id: "3", username: "c" },
    { id: "4", username: "d" }
  ];
  assert.deepEqual(findNonFollowers(followers, following).map((item) => item.username), ["b", "d"]);
});

test("quem nunca seguiu aparece apenas em não me seguem", () => {
  const previous = toFollowerMap([{ id: "1", username: "ana" }]);
  const current = toFollowerMap([{ id: "1", username: "ana" }]);
  const nonFollowers = findNonFollowers(current, [{ id: "2", username: "bruno" }]);
  assert.deepEqual(compareFollowers(previous, current), []);
  assert.deepEqual(nonFollowers.map((item) => item.username), ["bruno"]);
});

test("pode aparecer em unfollow e não me seguem", () => {
  const previous = toFollowerMap([{ id: "2", username: "bruno" }]);
  const current = toFollowerMap([]);
  const following = toFollowerMap([{ id: "2", username: "bruno" }]);
  assert.deepEqual(compareFollowers(previous, current).map((item) => item.username), ["bruno"]);
  assert.deepEqual(findNonFollowers(current, following).map((item) => item.username), ["bruno"]);
});


test("desaparecimento nos dois sentidos respeita IDs e renomeações", () => {
  const old = toFollowerMap([{ id: "42", username: "antigo" }]);
  const renamed = toFollowerMap([{ id: "42", username: "novo" }]);
  assert.deepEqual(findDisconnectedUsers(old, {}, old, renamed), []);
  assert.deepEqual(findDisconnectedUsers(old, renamed, old, {}), []);
  assert.deepEqual(findDisconnectedUsers(old, {}, old, {}).map((user) => user.id), ["42"]);
  assert.deepEqual(findDisconnectedUsers(old, {}, {}, {}), []);
});

import { findNewUsers, mergeUnfollowHistory } from "../src/core/follower-comparator.js";

test("histórico acumula unfollows e remove quem voltou a seguir", () => {
  const first = mergeUnfollowHistory({}, [{ username: "ana" }, { username: "bia" }], {}, "2026-01-01");
  assert.deepEqual(Object.keys(first).sort(), ["ana", "bia"]);
  const second = mergeUnfollowHistory(first, [{ username: "caio" }], { bia: { username: "bia" } }, "2026-02-01");
  assert.deepEqual(Object.keys(second).sort(), ["ana", "caio"]);
  assert.equal(second.ana.detectedAt, "2026-01-01");
  assert.equal(second.caio.detectedAt, "2026-02-01");
});

test("findNewUsers retorna só quem não estava na lista anterior", () => {
  assert.deepEqual(findNewUsers([{ username: "a" }], [{ username: "a" }, { username: "B" }]), ["b"]);
});
