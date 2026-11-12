const RESULT_KEY = "lastScanResult";
const result = (await chrome.storage.local.get(RESULT_KEY))[RESULT_KEY];
const avatarCache = new Map();
const avatarQueue = [];
const MAX_AVATAR_REQUESTS = 4;
let activeAvatarRequests = 0;
const HISTORY_PREFIX = "unfollowHistory:";
let activeTab = "unfollowers";
let history = {};

const elements = {
  subtitle: document.querySelector("#subtitle"),
  tabs: document.querySelector("#tabs"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  unfollowersPanel: document.querySelector("#unfollowersPanel"),
  nonFollowersPanel: document.querySelector("#nonFollowersPanel"),
  removedTotal: document.querySelector("#removedTotal"),
  currentTotal: document.querySelector("#currentTotal"),
  previousTotal: document.querySelector("#previousTotal"),
  unfollowersUnavailable: document.querySelector("#unfollowersUnavailable"),
  baseline: document.querySelector("#baseline"),
  noRemoved: document.querySelector("#noRemoved"),
  unfollowersResults: document.querySelector("#unfollowersResults"),
  unfollowersCount: document.querySelector("#unfollowersCount"),
  unfollowersList: document.querySelector("#unfollowersList"),
  disconnectedSection: document.querySelector("#disconnectedSection"),
  disconnectedCount: document.querySelector("#disconnectedCount"),
  disconnectedStatus: document.querySelector("#disconnectedStatus"),
  disconnectedList: document.querySelector("#disconnectedList"),
  nonFollowersTotal: document.querySelector("#nonFollowersTotal"),
  followingTotal: document.querySelector("#followingTotal"),
  followersTotal: document.querySelector("#followersTotal"),
  nonFollowersUnavailable: document.querySelector("#nonFollowersUnavailable"),
  noNonFollowers: document.querySelector("#noNonFollowers"),
  nonFollowersResults: document.querySelector("#nonFollowersResults"),
  nonFollowersCount: document.querySelector("#nonFollowersCount"),
  nonFollowersList: document.querySelector("#nonFollowersList"),
  missingResult: document.querySelector("#missingResult"),
  scanAgain: document.querySelector("#scanAgain"),
  scanBoth: document.querySelector("#scanBoth"),
  historySection: document.querySelector("#historySection"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory"),
  newNonFollowers: document.querySelector("#newNonFollowers")
};

elements.scanAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_SCAN", mode: activeTab });
});
elements.scanBoth.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_SCAN", mode: "both" });
});
elements.clearHistory.addEventListener("click", async () => {
  if (!confirm("Apagar todo o histórico de quem parou de seguir? Esta ação não pode ser desfeita.")) return;
  await saveHistory({});
});
elements.tabButtons.forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
if (result?.account) {
  const key = `${HISTORY_PREFIX}${result.account}`;
  history = (await chrome.storage.local.get(key))[key] ?? {};
}
render(result);

function render(data) {
  if (!data) {
    elements.subtitle.textContent = "Ainda não há dados salvos neste navegador.";
    elements.missingResult.classList.remove("hidden");
    return;
  }
  elements.subtitle.textContent = `@${data.account} · verificado em ${formatDate(data.scannedAt)}`;
  elements.tabs.classList.remove("hidden");
  elements.unfollowersPanel.classList.remove("hidden");
  renderUnfollowers(data);
  renderHistory();
  renderDisconnected(data);
  renderNonFollowers(data);
  const requestedTab = new URLSearchParams(location.search).get("tab");
  selectTab(requestedTab === "nonFollowers" || requestedTab === "unfollowers"
    ? requestedTab
    : data.lastMode || "unfollowers");
}

function renderUnfollowers(data) {
  const removed = Array.isArray(data.removed) ? data.removed : [];
  const available = data.unfollowersAvailable === true || data.currentTotal != null;
  elements.removedTotal.textContent = available ? formatNumber(removed.length) : "—";
  elements.currentTotal.textContent = available
    ? formatNumber(data.unfollowersCurrentTotal ?? data.currentTotal)
    : "—";
  elements.previousTotal.textContent = available && data.previousTotal != null
    ? formatNumber(data.previousTotal)
    : "—";
  if (!available) {
    elements.unfollowersUnavailable.classList.remove("hidden");
  } else if (data.isBaseline) {
    elements.baseline.classList.remove("hidden");
  } else if (removed.length === 0) {
    elements.noRemoved.classList.remove("hidden");
  } else {
    elements.unfollowersResults.classList.remove("hidden");
    elements.unfollowersCount.textContent = `${formatNumber(removed.length)} usuário(s)`;
    renderUsers(elements.unfollowersList, removed);
  }
}

function renderHistory() {
  const entries = Object.values(history).sort((a, b) => String(b.detectedAt).localeCompare(String(a.detectedAt)));
  elements.historySection.classList.toggle("hidden", entries.length === 0);
  elements.historyCount.textContent = `${formatNumber(entries.length)} usuário(s)`;
  elements.historyList.textContent = "";
  entries.forEach((entry) => {
    const row = createUserRow(entry.user, { note: `Detectado em ${formatDate(entry.detectedAt)}` });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-danger small";
    remove.textContent = "Apagar";
    remove.addEventListener("click", async () => {
      const next = { ...history };
      delete next[entry.user.username];
      await saveHistory(next);
    });
    row.append(remove);
    elements.historyList.append(row);
  });
}

async function saveHistory(next) {
  history = next;
  await chrome.storage.local.set({ [`${HISTORY_PREFIX}${result.account}`]: next });
  renderHistory();
}

function renderDisconnected(data) {
  if (!(data.unfollowersAvailable === true || data.currentTotal != null)) return;
  elements.disconnectedSection.classList.remove("hidden");
  if (!data.disconnectedAvailable) {
    elements.disconnectedCount.textContent = "Indisponível";
    elements.disconnectedStatus.textContent = "São necessárias duas verificações consecutivas com as listas completas de seguidores e seguindo. Históricos antigos e o modo visual não contêm esses dados.";
    return;
  }
  const users = Array.isArray(data.disconnected) ? data.disconnected : [];
  elements.disconnectedCount.textContent = `${formatNumber(users.length)} usuário(s)`;
  elements.disconnectedStatus.textContent = users.length ? "Comparação com a verificação anterior." : "Nenhuma conta sumiu das duas listas nesta comparação.";
  if (users.length) {
    elements.disconnectedList.classList.remove("hidden");
    renderUsers(elements.disconnectedList, users);
  }
}

function renderNonFollowers(data) {
  const users = Array.isArray(data.nonFollowers) ? data.nonFollowers : [];
  const available = data.nonFollowersAvailable === true;
  elements.nonFollowersTotal.textContent = available ? formatNumber(users.length) : "—";
  elements.followingTotal.textContent = available && data.followingTotal != null
    ? formatNumber(data.followingTotal)
    : "—";
  elements.followersTotal.textContent = available
    ? formatNumber(data.nonFollowersFollowersTotal ?? data.currentTotal)
    : "—";
  if (!available) {
    elements.nonFollowersUnavailable.classList.remove("hidden");
  } else if (users.length === 0) {
    elements.noNonFollowers.classList.remove("hidden");
  } else {
    elements.nonFollowersResults.classList.remove("hidden");
    elements.nonFollowersCount.textContent = `${formatNumber(users.length)} usuário(s)`;
    const fresh = new Set(Array.isArray(data.nonFollowersNew) ? data.nonFollowersNew : []);
    if (fresh.size > 0) {
      elements.newNonFollowers.textContent = `+${formatNumber(fresh.size)} novo(s) desde a última verificação: ${[...fresh].map((name) => `@${name}`).join(", ")}`;
      elements.newNonFollowers.classList.remove("hidden");
    }
    renderUsers(elements.nonFollowersList, [...users].sort((x, y) => Number(fresh.has(y.username)) - Number(fresh.has(x.username))), fresh);
  }
}

function selectTab(tab) {
  const showNonFollowers = tab === "nonFollowers";
  activeTab = showNonFollowers ? "nonFollowers" : "unfollowers";
  elements.unfollowersPanel.classList.toggle("hidden", showNonFollowers);
  elements.nonFollowersPanel.classList.toggle("hidden", !showNonFollowers);
  elements.tabButtons.forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

function renderUsers(container, users, fresh = new Set()) {
  users.forEach((user) => container.append(createUserRow(user, { isNew: fresh.has(user.username) })));
}

function profileHref(user) {
  return `https://www.instagram.com/${encodeURIComponent(user.username)}/`;
}

function createUserRow(user, { isNew = false, note = "" } = {}) {
  const row = document.createElement("article");
  row.className = "person";
  const avatar = createAvatarFallback(user.username);
  if (user.avatarUrl) void hydrateAvatar(avatar, user);
  const avatarLink = document.createElement("a");
  avatarLink.className = "avatar-link";
  avatarLink.href = profileHref(user);
  avatarLink.target = "_blank";
  avatarLink.rel = "noreferrer";
  avatarLink.setAttribute("aria-label", `Abrir perfil de @${user.username}`);
  avatarLink.append(avatar);

  const identity = document.createElement("div");
  identity.className = "identity";
  const username = document.createElement("strong");
  const handle = document.createElement("a");
  handle.className = "handle";
  handle.href = profileHref(user);
  handle.target = "_blank";
  handle.rel = "noreferrer";
  handle.textContent = `@${user.username}`;
  username.append(handle);
  if (isNew) {
    const badge = document.createElement("em");
    badge.className = "badge-new";
    badge.textContent = "Novo";
    username.append(badge);
  }
  const name = document.createElement("span");
  name.textContent = user.name || "Nome não disponível";
  identity.append(username, name);
  if (note) {
    const noteEl = document.createElement("span");
    noteEl.textContent = note;
    identity.append(noteEl);
  }

  const link = document.createElement("a");
  link.className = "open-profile";
  link.href = profileHref(user);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Abrir perfil";
  row.append(avatarLink, identity, link);
  return row;
}

function createAvatarFallback(username) {
  const avatar = document.createElement("div");
  avatar.className = "avatar avatar-fallback";
  avatar.textContent = String(username || "?").slice(0, 1).toUpperCase();
  return avatar;
}

async function hydrateAvatar(container, user) {
  const dataUrl = await scheduleAvatar(user.avatarUrl);
  if (!dataUrl || !container.isConnected) return;
  const image = document.createElement("img");
  image.className = "avatar-image";
  image.alt = `Foto de @${user.username}`;
  image.addEventListener("error", () => image.remove(), { once: true });
  image.addEventListener("load", () => {
    container.textContent = "";
    container.append(image);
  }, { once: true });
  image.src = dataUrl;
}

function scheduleAvatar(url) {
  if (!url) return Promise.resolve(null);
  if (avatarCache.has(url)) return avatarCache.get(url);
  const promise = new Promise((resolve) => {
    avatarQueue.push({ url, resolve });
    pumpAvatarQueue();
  });
  avatarCache.set(url, promise);
  return promise;
}

function pumpAvatarQueue() {
  while (activeAvatarRequests < MAX_AVATAR_REQUESTS && avatarQueue.length > 0) {
    const item = avatarQueue.shift();
    activeAvatarRequests += 1;
    chrome.runtime.sendMessage({ type: "LOAD_AVATAR", url: item.url })
      .then((response) => item.resolve(response?.ok ? response.dataUrl : null))
      .catch(() => item.resolve(null))
      .finally(() => {
        activeAvatarRequests -= 1;
        pumpAvatarQueue();
      });
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}
