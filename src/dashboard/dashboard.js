const RESULT_KEY = "lastScanResult";
const result = (await chrome.storage.local.get(RESULT_KEY))[RESULT_KEY];
const avatarCache = new Map();
const avatarQueue = [];
const MAX_AVATAR_REQUESTS = 4;
let activeAvatarRequests = 0;
let activeTab = "unfollowers";

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
  nonFollowersTotal: document.querySelector("#nonFollowersTotal"),
  followingTotal: document.querySelector("#followingTotal"),
  followersTotal: document.querySelector("#followersTotal"),
  nonFollowersUnavailable: document.querySelector("#nonFollowersUnavailable"),
  noNonFollowers: document.querySelector("#noNonFollowers"),
  nonFollowersResults: document.querySelector("#nonFollowersResults"),
  nonFollowersCount: document.querySelector("#nonFollowersCount"),
  nonFollowersList: document.querySelector("#nonFollowersList"),
  missingResult: document.querySelector("#missingResult"),
  scanAgain: document.querySelector("#scanAgain")
};

elements.scanAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_SCAN", mode: activeTab });
});
elements.tabButtons.forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
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
    renderUsers(elements.nonFollowersList, users);
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

function renderUsers(container, users) {
  users.forEach((user) => container.append(createUserRow(user)));
}

function createUserRow(user) {
  const row = document.createElement("article");
  row.className = "person";
  const avatar = createAvatarFallback(user.username);
  if (user.avatarUrl) void hydrateAvatar(avatar, user);

  const identity = document.createElement("div");
  identity.className = "identity";
  const username = document.createElement("strong");
  username.textContent = `@${user.username}`;
  const name = document.createElement("span");
  name.textContent = user.name || "Nome não disponível";
  identity.append(username, name);

  const link = document.createElement("a");
  link.href = user.profileUrl || `https://www.instagram.com/${encodeURIComponent(user.username)}/`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Abrir perfil";
  row.append(avatar, identity, link);
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
