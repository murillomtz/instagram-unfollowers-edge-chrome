const SESSION_KEY = "scanSession";
const RESULT_KEY = "lastScanResult";
const ACTIVE_STATUSES = new Set(["starting", "login_required", "finding_profile", "opening_followers", "scanning"]);

const elements = {
  statusTitle: document.querySelector("#statusTitle"),
  statusMessage: document.querySelector("#statusMessage"),
  progressArea: document.querySelector("#progressArea"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  lastResult: document.querySelector("#lastResult"),
  removedCount: document.querySelector("#removedCount"),
  nonFollowersCount: document.querySelector("#nonFollowersCount"),
  followersCount: document.querySelector("#followersCount"),
  lastScanAt: document.querySelector("#lastScanAt"),
  scanUnfollowers: document.querySelector("#scanUnfollowers"),
  scanNonFollowers: document.querySelector("#scanNonFollowers"),
  cancelScan: document.querySelector("#cancelScan"),
  openDashboard: document.querySelector("#openDashboard")
};

elements.scanUnfollowers.addEventListener("click", () => startScan("unfollowers"));
elements.scanNonFollowers.addEventListener("click", () => startScan("nonFollowers"));

elements.cancelScan.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CANCEL_SCAN" });
  await refresh();
});

elements.openDashboard.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
});

chrome.storage.onChanged.addListener(() => void refresh());
void refresh();

async function refresh() {
  const [sessionStore, localStore] = await Promise.all([
    chrome.storage.session.get(SESSION_KEY),
    chrome.storage.local.get(RESULT_KEY)
  ]);
  renderSession(sessionStore[SESSION_KEY]);
  renderResult(localStore[RESULT_KEY]);
}

async function startScan(mode) {
  setScanButtonsDisabled(true);
  await chrome.runtime.sendMessage({ type: "START_SCAN", mode });
  await refresh();
}

function renderSession(session = {}) {
  const active = ACTIVE_STATUSES.has(session.status);
  const labels = {
    starting: "Iniciando",
    login_required: "Login necessário",
    finding_profile: "Identificando perfil",
    opening_followers: "Abrindo seguidores",
    scanning: "Analisando relações",
    completed: "Verificação concluída",
    failed: "Não foi possível concluir",
    cancelled: "Varredura cancelada",
    idle: "Pronto para verificar"
  };

  elements.statusTitle.textContent = labels[session.status] ?? labels.idle;
  elements.statusMessage.textContent = session.message ?? "A primeira execução criará sua lista-base.";
  setScanButtonsDisabled(active);
  elements.cancelScan.classList.toggle("hidden", !active);
  elements.progressArea.classList.toggle("hidden", !active);

  const collected = Number(session.collected) || 0;
  const expected = Number(session.expected) || 0;
  const percent = expected ? Math.min(100, Math.round(collected / expected * 100)) : 20;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = expected
    ? `${formatNumber(collected)} de ${formatNumber(expected)}`
    : `${formatNumber(collected)} coletados`;
}

function setScanButtonsDisabled(disabled) {
  elements.scanUnfollowers.disabled = disabled;
  elements.scanNonFollowers.disabled = disabled;
}

function renderResult(result) {
  elements.lastResult.classList.toggle("hidden", !result);
  if (!result) return;
  const unfollowersAvailable = result.unfollowersAvailable === true || result.currentTotal != null;
  elements.removedCount.textContent = unfollowersAvailable
    ? formatNumber(result.removed?.length ?? 0)
    : "—";
  elements.nonFollowersCount.textContent = result.nonFollowersAvailable
    ? formatNumber(result.nonFollowers?.length ?? 0)
    : "—";
  const followersTotal = result.lastMode === "nonFollowers"
    ? result.nonFollowersFollowersTotal
    : (result.unfollowersCurrentTotal ?? result.currentTotal);
  elements.followersCount.textContent = followersTotal == null ? "—" : formatNumber(followersTotal);
  elements.lastScanAt.textContent = `Última verificação: ${formatDate(result.scannedAt)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
