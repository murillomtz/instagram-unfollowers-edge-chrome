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
