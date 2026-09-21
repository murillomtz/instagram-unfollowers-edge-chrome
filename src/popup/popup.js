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
  followersCount: document.querySelector("#followersCount"),
  lastScanAt: document.querySelector("#lastScanAt"),
  startScan: document.querySelector("#startScan"),
  cancelScan: document.querySelector("#cancelScan"),
  openDashboard: document.querySelector("#openDashboard")
};

elements.startScan.addEventListener("click", async () => {
  elements.startScan.disabled = true;
  await chrome.runtime.sendMessage({ type: "START_SCAN" });
  await refresh();
});

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

function renderSession(session = {}) {
  const active = ACTIVE_STATUSES.has(session.status);
  const labels = {
    starting: "Iniciando",
    login_required: "Login necessário",
    finding_profile: "Identificando perfil",
    opening_followers: "Abrindo seguidores",
    scanning: "Verificando seguidores",
    completed: "Verificação concluída",
    failed: "Não foi possível concluir",
    cancelled: "Varredura cancelada",
    idle: "Pronto para verificar"
  };

  elements.statusTitle.textContent = labels[session.status] ?? labels.idle;
  elements.statusMessage.textContent = session.message ?? "A primeira execução criará sua lista-base.";
  elements.startScan.disabled = active;
  elements.startScan.textContent = active ? "Verificação em andamento" : "Verificar agora";
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

function renderResult(result) {
  elements.lastResult.classList.toggle("hidden", !result);
  if (!result) return;
  elements.removedCount.textContent = formatNumber(result.removed?.length ?? 0);
  elements.followersCount.textContent = formatNumber(result.currentTotal ?? 0);
  elements.lastScanAt.textContent = `Última verificação: ${formatDate(result.scannedAt)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
