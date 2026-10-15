import { compareFollowers, findNonFollowers, normalizeUsername, toFollowerMap } from "../core/follower-comparator.js";
import { isAllowedAvatarUrl, isAllowedImageType } from "../core/avatar-policy.js";
import { createAvatarStore } from "../core/avatar-store.js";

const SESSION_KEY = "scanSession";
const RESULT_KEY = "lastScanResult";
const SNAPSHOT_PREFIX = "followersSnapshot:";
const SCAN_MODES = new Set(["unfollowers", "nonFollowers"]);
const avatarStore = createAvatarStore();
const pendingAvatars = new Map();

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
      return startScan(message.mode);
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
    case "LOAD_AVATAR":
      return loadAvatar(message.url);
    default:
      return { ok: false, error: "Mensagem desconhecida." };
  }
}

async function startScan(rawMode) {
  const mode = SCAN_MODES.has(rawMode) ? rawMode : "unfollowers";
  const scanId = crypto.randomUUID();
  const session = {
    scanId,
    mode,
    status: "starting",
    message: mode === "unfollowers"
      ? "Preparando a análise de quem deixou de seguir…"
      : "Preparando a análise de quem não segue você…",
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
  const mode = SCAN_MODES.has(session.mode) ? session.mode : payload?.mode;
  const followers = Array.isArray(payload?.followers) ? payload.followers : [];
  const followingAvailable = Array.isArray(payload?.following);
  const following = followingAvailable ? payload.following : [];
  if (!account || !SCAN_MODES.has(mode)) {
    throw new Error("A varredura não retornou uma conta e uma lista válidas.");
  }
  if (mode === "nonFollowers" && !followingAvailable) {
    throw new Error("A lista de contas seguidas não foi concluída.");
  }

  const snapshotKey = `${SNAPSHOT_PREFIX}${account}`;
  const stored = await chrome.storage.local.get([snapshotKey, RESULT_KEY]);
  const previousSnapshot = stored[snapshotKey] ?? null;
  const previousResult = stored[RESULT_KEY]?.account === account ? stored[RESULT_KEY] : {};
  const currentFollowers = toFollowerMap(followers);
  const scannedAt = new Date().toISOString();
  let result = {
    ...previousResult,
    account,
    scannedAt,
    lastMode: mode,
    removed: Array.isArray(previousResult.removed) ? previousResult.removed : [],
    unfollowersAvailable: previousResult.unfollowersAvailable === true || Number.isFinite(previousResult.currentTotal),
    nonFollowers: Array.isArray(previousResult.nonFollowers) ? previousResult.nonFollowers : [],
    nonFollowersAvailable: previousResult.nonFollowersAvailable === true
  };

  const changes = {};
  if (mode === "unfollowers") {
    const currentTotal = Object.keys(currentFollowers).length;
    result = {
      ...result,
      unfollowersScannedAt: scannedAt,
      unfollowersAvailable: true,
      isBaseline: !previousSnapshot,
      currentTotal,
      unfollowersCurrentTotal: currentTotal,
      previousTotal: previousSnapshot?.total ?? null,
      removed: previousSnapshot
        ? compareFollowers(previousSnapshot.followers, currentFollowers)
        : []
    };
    changes[snapshotKey] = {
      account,
      scannedAt,
      total: currentTotal,
      followers: currentFollowers
    };
  } else {
    const currentFollowing = toFollowerMap(following);
    result = {
      ...result,
      nonFollowersScannedAt: scannedAt,
      nonFollowersFollowersTotal: Object.keys(currentFollowers).length,
      followingTotal: Object.keys(currentFollowing).length,
      nonFollowers: findNonFollowers(currentFollowers, currentFollowing),
      nonFollowersAvailable: true
    };
  }

  changes[RESULT_KEY] = result;
  await chrome.storage.local.set(changes);

  await chrome.storage.session.set({
    [SESSION_KEY]: { ...session, status: "scanning", message: "Listas salvas. Preservando fotos de perfil…" }
  });
  await preserveAvatars([
    ...result.removed, ...result.nonFollowers,
    ...(mode === "unfollowers" ? Object.values(currentFollowers) : [])
  ]);

  // Cancellation/new scans during photo preservation must not be overwritten.
  const latest = await getSession();
  if (latest.scanId !== session.scanId || latest.status === "cancelled") return { ok: true, result };

  const completedTotal = mode === "unfollowers"
    ? result.unfollowersCurrentTotal
    : result.followingTotal;
  const message = mode === "unfollowers"
    ? (result.isBaseline ? "Primeira lista de seguidores salva." : "Análise de unfollow concluída.")
    : "Análise de quem não segue você concluída.";

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      ...session,
      status: "completed",
      message,
      account,
      collected: completedTotal,
      expected: completedTotal,
      completedAt: scannedAt
    }
  });

  const dashboardUrl = chrome.runtime.getURL(`src/dashboard/dashboard.html?tab=${mode}`);
  await chrome.tabs.create({ url: dashboardUrl });
  return { ok: true, result };
}

async function loadAvatar(rawUrl) {
  if (!isAllowedAvatarUrl(rawUrl)) return { ok: false };
  if (pendingAvatars.has(rawUrl)) return pendingAvatars.get(rawUrl);
  const request = readAvatar(rawUrl).catch(() => ({ ok: false }));
  pendingAvatars.set(rawUrl, request);
  try {
    return await request;
  } finally {
    pendingAvatars.delete(rawUrl);
  }
}

async function readAvatar(rawUrl) {
  const cached = await avatarStore.get(rawUrl);
  if (cached) return avatarResponse(await cached.arrayBuffer(), cached.headers.get("content-type"));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(rawUrl, {
      method: "GET",
      credentials: "omit",
      cache: "force-cache",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    if (!response.ok) return { ok: false };

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (!isAllowedImageType(contentType) || declaredSize > 2_500_000) return { ok: false };

    const buffer = await response.arrayBuffer();
    const result = avatarResponse(buffer, contentType);
    if (result.ok) await avatarStore.put(rawUrl, buffer, contentType);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function avatarResponse(buffer, contentType) {
  if (!isAllowedImageType(contentType) || !buffer.byteLength || buffer.byteLength > 2_500_000) return { ok: false };
  return {
    ok: true,
    dataUrl: `data:${contentType.split(";")[0]};base64,${arrayBufferToBase64(buffer)}`
  };
}

async function preserveAvatars(users) {
  const urls = [...new Set(users.map((user) => user.avatarUrl).filter(isAllowedAvatarUrl))].slice(0, 1000);
  const deadline = Date.now() + 20_000;
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (index < urls.length && Date.now() < deadline) {
      await loadAvatar(urls[index++]);
    }
  }));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
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
    mode: null,
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
