const RESULT_KEY = "lastScanResult";
const result = (await chrome.storage.local.get(RESULT_KEY))[RESULT_KEY];

const elements = {
  subtitle: document.querySelector("#subtitle"),
  summary: document.querySelector("#summary"),
  removedTotal: document.querySelector("#removedTotal"),
  currentTotal: document.querySelector("#currentTotal"),
  previousTotal: document.querySelector("#previousTotal"),
  baseline: document.querySelector("#baseline"),
  noRemoved: document.querySelector("#noRemoved"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#resultCount"),
  followerList: document.querySelector("#followerList"),
  missingResult: document.querySelector("#missingResult"),
  scanAgain: document.querySelector("#scanAgain")
};

elements.scanAgain.addEventListener("click", () => chrome.runtime.sendMessage({ type: "START_SCAN" }));
render(result);

function render(data) {
  if (!data) {
    elements.subtitle.textContent = "Ainda não há dados salvos neste navegador.";
    elements.missingResult.classList.remove("hidden");
    return;
  }

  elements.subtitle.textContent = `@${data.account} · verificado em ${formatDate(data.scannedAt)}`;
  elements.summary.classList.remove("hidden");
  elements.removedTotal.textContent = formatNumber(data.removed?.length ?? 0);
  elements.currentTotal.textContent = formatNumber(data.currentTotal);
  elements.previousTotal.textContent = data.previousTotal == null ? "—" : formatNumber(data.previousTotal);

  if (data.isBaseline) {
    elements.baseline.classList.remove("hidden");
    return;
  }

  if (!data.removed?.length) {
    elements.noRemoved.classList.remove("hidden");
    return;
  }

  elements.results.classList.remove("hidden");
  elements.resultCount.textContent = `${formatNumber(data.removed.length)} resultado(s)`;
  data.removed.forEach((follower) => elements.followerList.append(createFollowerRow(follower)));
}

function createFollowerRow(follower) {
  const row = document.createElement("article");
  row.className = "person";

  const avatar = follower.avatarUrl ? document.createElement("img") : document.createElement("div");
  avatar.className = follower.avatarUrl ? "avatar" : "avatar avatar-fallback";
  if (follower.avatarUrl) {
    avatar.src = follower.avatarUrl;
    avatar.alt = `Foto de @${follower.username}`;
    avatar.referrerPolicy = "no-referrer";
  } else {
    avatar.textContent = follower.username.slice(0, 1).toUpperCase();
  }

  const identity = document.createElement("div");
  identity.className = "identity";
  const username = document.createElement("strong");
  username.textContent = `@${follower.username}`;
  const name = document.createElement("span");
  name.textContent = follower.name || "Nome não disponível";
  identity.append(username, name);

  const link = document.createElement("a");
  link.href = follower.profileUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Ver perfil";

  row.append(avatar, identity, link);
  return row;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}
