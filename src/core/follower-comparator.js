export function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export function toFollowerMap(followers) {
  const map = Object.create(null);

  for (const follower of followers ?? []) {
    const username = normalizeUsername(follower?.username);
    if (!username) continue;

    map[username] = {
      username,
      name: String(follower.name ?? "").trim(),
      avatarUrl: String(follower.avatarUrl ?? "").trim(),
      profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`
    };
  }

  return map;
}

export function compareFollowers(previous = {}, current = {}) {
  const removed = [];

  for (const [username, follower] of Object.entries(previous)) {
    if (!Object.hasOwn(current, username)) {
      removed.push(follower);
    }
  }

  return removed.sort((a, b) => a.username.localeCompare(b.username, "pt-BR"));
}
