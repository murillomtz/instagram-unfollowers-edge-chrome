export function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export function normalizeUserId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : "";
}

export function toFollowerMap(followers) {
  const map = Object.create(null);

  for (const follower of followers ?? []) {
    const username = normalizeUsername(follower?.username);
    if (!username) continue;

    map[username] = {
      id: normalizeUserId(follower.id),
      username,
      name: String(follower.name ?? "").trim(),
      avatarUrl: String(follower.avatarUrl ?? "").trim(),
      profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`
    };
  }

  return map;
}

export function compareFollowers(previous = {}, current = {}) {
  const currentIndex = buildIdentityIndex(current);
  const removed = [];

  for (const follower of Object.values(previous)) {
    if (!containsUser(currentIndex, follower)) {
      removed.push(follower);
    }
  }

  return removed.sort((a, b) => a.username.localeCompare(b.username, "pt-BR"));
}

export function findNonFollowers(followers = [], following = []) {
  const followerIndex = buildIdentityIndex(followers);
  const seen = new Set();
  const result = [];

  for (const rawUser of asUsers(following)) {
    const user = normalizeUser(rawUser);
    if (!user.username || containsUser(followerIndex, user)) continue;
    const identity = user.id ? `id:${user.id}` : `username:${user.username}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(user);
  }

  return result.sort((left, right) => left.username.localeCompare(right.username, "pt-BR"));
}

// Only classify accounts that disappeared from both previously observed relationships.
export function findDisconnectedUsers(previousFollowers, currentFollowers, previousFollowing, currentFollowing) {
  const previousIndex = buildIdentityIndex(previousFollowing);
  const currentIndex = buildIdentityIndex(currentFollowing);
  return compareFollowers(previousFollowers, currentFollowers)
    .filter((user) => containsUser(previousIndex, user) && !containsUser(currentIndex, user));
}

function buildIdentityIndex(users) {
  const ids = new Set();
  const usernames = new Set();
  const usernameIds = new Map();

  for (const rawUser of asUsers(users)) {
    const user = normalizeUser(rawUser);
    if (user.id) ids.add(user.id);
    if (user.username) {
      usernames.add(user.username);
      if (user.id) usernameIds.set(user.username, user.id);
    }
  }

  return { ids, usernames, usernameIds };
}

function containsUser(index, rawUser) {
  const user = normalizeUser(rawUser);
  if (user.id && index.ids.has(user.id)) return true;
  if (user.id && user.username && index.usernameIds.has(user.username)) return false;
  return Boolean(user.username && index.usernames.has(user.username));
}

function normalizeUser(user = {}) {
  const username = normalizeUsername(user.username);
  return {
    id: normalizeUserId(user.id),
    username,
    name: String(user.name ?? "").trim(),
    avatarUrl: String(user.avatarUrl ?? "").trim(),
    profileUrl: username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : ""
  };
}

function asUsers(users) {
  if (Array.isArray(users)) return users;
  if (users && typeof users === "object") return Object.values(users);
  return [];
}

// Histórico acumulado de quem deixou de seguir: chave = username.
// Entra quem sumiu agora; sai quem voltou a seguir. Datas anteriores são preservadas.
export function mergeUnfollowHistory(history = {}, removed = [], currentFollowers = {}, detectedAt = new Date().toISOString()) {
  const currentIndex = buildIdentityIndex(currentFollowers);
  const merged = Object.create(null);

  for (const entry of Object.values(history ?? {})) {
    const user = normalizeUser(entry?.user ?? entry);
    if (!user.username || containsUser(currentIndex, user)) continue;
    merged[user.username] = { user, detectedAt: entry?.detectedAt ?? detectedAt };
  }
  for (const rawUser of removed ?? []) {
    const user = normalizeUser(rawUser);
    if (!user.username) continue;
    merged[user.username] = { user, detectedAt: merged[user.username]?.detectedAt ?? detectedAt };
  }
  return merged;
}

// Usuários presentes na lista atual e ausentes da anterior (por username).
export function findNewUsers(previous = [], current = []) {
  const known = new Set(asUsers(previous).map((user) => normalizeUsername(user?.username)));
  return asUsers(current)
    .map((user) => normalizeUsername(user?.username))
    .filter((username) => username && !known.has(username));
}
