import { compareFollowers, normalizeUsername, toFollowerMap } from "../core/follower-comparator.js";

const SESSION_KEY = "scanSession";
const RESULT_KEY = "lastScanResult";
const SNAPSHOT_PREFIX = "followersSnapshot:";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({
    [SESSION_KEY]: idleSession()
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "START_SCAN":
      return startScan();
    case "GET_SCAN_STATE":
      return { ok: true, session: await getSession() };
    case "SCAN_PROGRESS":
      return updateProgress(message.progress, sender.tab?.id);
    case "SCAN_COMPLETE":
      return completeScan(message.payload, sender.tab?.id);
    case "SCAN_FAILED":
      return failScan(message.error, sender.tab?.id);
    case "CANCEL_SCAN":
      return cancelScan();
    case "OPEN_DASHBOARD":
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") });
      return { ok: true };
    default:
      return { ok: false, error: "Mensagem desconhecida." };
  }
}

async function startScan() {
  const scanId = crypto.randomUUID();
  const session = {
    scanId,
    status: "starting",
    message: "Abrindo o Instagram…",
    collected: 0,
    expected: null,
    startedAt: new Date().toISOString(),
    tabId: null
  };

  await chrome.storage.session.set({ [SESSION_KEY]: session });

  const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  let tab = tabs.find((candidate) => candidate.active) ?? tabs[0];

  if (tab?.id) {
    await chrome.storage.session.set({ [SESSION_KEY]: { ...session, tabId: tab.id } });
    tab = await chrome.tabs.update(tab.id, { url: "https://www.instagram.com/", active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: true });
    await chrome.storage.session.set({ [SESSION_KEY]: { ...session, tabId: tab.id } });
  }

  return { ok: true, scanId };
}

async function updateProgress(progress, tabId) {
  const current = await getSession();
  if (!current.scanId || (current.tabId && tabId && current.tabId !== tabId)) {
    return { ok: false, ignored: true };
  }

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      ...current,
      ...sanitizeProgress(progress),
      tabId: current.tabId ?? tabId ?? null
    }
  });
  return { ok: true };
}

async function completeScan(payload, tabId) {
  const session = await getSession();
  if (!session.scanId || session.status === "cancelled" || session.tabId !== tabId) {
    return { ok: false, ignored: true };
  }

  const account = normalizeUsername(payload?.account);
  const followers = Array.isArray(payload?.followers) ? payload.followers : [];
  if (!account) {
    throw new Error("A varredura não retornou uma conta e uma lista válidas.");
  }

  const snapshotKey = `${SNAPSHOT_PREFIX}${account}`;
  const stored = await chrome.storage.local.get(snapshotKey);
  const previousSnapshot = stored[snapshotKey] ?? null;
  const currentFollowers = toFollowerMap(followers);
  const removed = previousSnapshot
    ? compareFollowers(previousSnapshot.followers, currentFollowers)
    : [];

  const scannedAt = new Date().toISOString();
  const result = {
    account,
    scannedAt,
    isBaseline: !previousSnapshot,
    currentTotal: Object.keys(currentFollowers).length,
    previousTotal: previousSnapshot?.total ?? null,
    removed
  };

  await chrome.storage.local.set({
    [snapshotKey]: {
      account,
      scannedAt,
      total: result.currentTotal,
      followers: currentFollowers
    },
    [RESULT_KEY]: result
  });

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      ...session,
      status: "completed",
      message: result.isBaseline
        ? "Primeira lista salva com sucesso."
        : "Comparação concluída.",
      account,
      collected: result.currentTotal,
      expected: result.currentTotal,
      completedAt: scannedAt
    }
  });

  await chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") });
  return { ok: true, result };
}

async function failScan(error, tabId) {
  const session = await getSession();
  if (session.tabId && tabId && session.tabId !== tabId) return { ok: false, ignored: true };

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      ...session,
      status: "failed",
      message: String(error || "Não foi possível concluir a varredura."),
      failedAt: new Date().toISOString()
    }
  });
  return { ok: true };
}

async function cancelScan() {
  const session = await getSession();
  await chrome.storage.session.set({
    [SESSION_KEY]: {
      ...session,
      status: "cancelled",
      message: "Varredura cancelada.",
      cancelledAt: new Date().toISOString()
    }
  });

  if (session.tabId) {
    chrome.tabs.sendMessage(session.tabId, { type: "SCAN_CANCELLED" }).catch(() => undefined);
  }
  return { ok: true };
}

async function getSession() {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return stored[SESSION_KEY] ?? idleSession();
}

function idleSession() {
  return {
    scanId: null,
    status: "idle",
    message: "Pronto para verificar.",
    collected: 0,
    expected: null,
    tabId: null
  };
}

function sanitizeProgress(progress = {}) {
  const allowedStatus = new Set([
    "starting",
    "login_required",
    "finding_profile",
    "opening_followers",
    "scanning"
  ]);

  return {
    status: allowedStatus.has(progress.status) ? progress.status : "scanning",
    message: String(progress.message ?? "Verificando seguidores…").slice(0, 240),
    collected: Number.isFinite(progress.collected) ? Math.max(0, progress.collected) : 0,
    expected: Number.isFinite(progress.expected) ? Math.max(0, progress.expected) : null,
    account: progress.account ? normalizeUsername(progress.account) : undefined
  };
}
