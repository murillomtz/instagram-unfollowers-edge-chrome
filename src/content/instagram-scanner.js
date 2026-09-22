(() => {
  "use strict";

  const RESERVED_PATHS = new Set([
    "accounts", "about", "api", "challenge", "developer", "direct", "directory",
    "emails", "explore", "legal", "p", "privacy", "reel", "reels", "stories", "web"
  ]);
  const TERMINAL_STATUSES = new Set(["idle", "completed", "failed", "cancelled"]);
  const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;
  const MAX_SCAN_MS = 30 * 60 * 1000;
  const API_PAGE_SIZE = 50;
  const API_DELAY_MIN_MS = 1500;
  const API_DELAY_MAX_MS = 3000;

  let running = false;
  let cancelled = false;
  let activeScanId = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SCAN_REQUESTED") void resumeIfRequested();
    if (message?.type === "SCAN_CANCELLED") {
      cancelled = true;
      removeOverlay();
    }
  });

  void resumeIfRequested();

  async function resumeIfRequested() {
    if (running) return;
    const state = await safeMessage({ type: "GET_SCAN_STATE" });
    const session = state?.session;
    if (!session?.scanId || TERMINAL_STATUSES.has(session.status)) return;

    running = true;
    cancelled = false;
    activeScanId = session.scanId;
    showOverlay("Preparando a varredura…", 0, null);

    try {
      await runScan(session.mode);
    } catch (error) {
      if (!cancelled) {
        const message = error instanceof Error ? error.message : String(error);
        updateOverlay(message, 0, null, true);
        await safeMessage({ type: "SCAN_FAILED", error: message });
      }
    } finally {
      running = false;
      activeScanId = null;
    }
  }

  async function runScan(mode = "unfollowers") {
    if (isLoginRequired()) {
      await progress("login_required", "Faça login no Instagram. A verificação continuará automaticamente.");
      updateOverlay("Faça login no Instagram. Depois, aguarde a continuação automática.", 0, null);
      const loggedIn = await waitForLogin(10 * 60 * 1000);
      if (!loggedIn) {
        throw new Error("O tempo de espera pelo login foi excedido. Inicie a verificação novamente.");
      }
    }

    await progress("finding_profile", "Identificando o seu perfil…");
    const account = await waitForAccountUsername(15_000);
    assertNotCancelled();

    if (!account) {
      throw new Error("Não consegui identificar seu perfil. Abra seu perfil do Instagram e tente novamente.");
    }

    const apiContext = discoverInstagramApiContext();
    if (apiContext) {
      try {
        await progress("scanning", "Conectando às listas do Instagram…", 0, null, account);
        const relationships = await collectRelationshipsViaApi(apiContext, account, mode);
        await finishScan(account, relationships.followers, relationships.following, mode);
        return;
      } catch (error) {
        if (cancelled) throw error;
        if (mode === "nonFollowers") throw error;
        console.warn("Unfollow Local: coleta pela API interna indisponível; usando o modo visual.", error);
        await progress("opening_followers", "Tentando o modo visual do Instagram…", 0, null, account);
      }
    }

    if (mode === "nonFollowers") {
      throw new Error("Não foi possível acessar as listas pela sessão do Instagram. Tente novamente mais tarde.");
    }

    if (!isOnProfile(account)) {
      location.assign(`https://www.instagram.com/${encodeURIComponent(account)}/`);
      return;
    }

    await progress("opening_followers", "Abrindo a lista de seguidores…", 0, null, account);
    const followersLink = await waitForElement(() => findFollowersLink(account), 15_000);
    if (!followersLink) {
      throw new Error("Não encontrei o botão de seguidores. Confirme que este é o seu perfil e tente novamente.");
    }

    const expectedInfo = parseFollowerCount(followersLink.textContent || followersLink.getAttribute("title") || "");
    followersLink.click();

    const dialog = await waitForElement(() => document.querySelector('div[role="dialog"]'), 15_000);
    if (!dialog) throw new Error("A lista de seguidores não abriu. Tente novamente.");

    const scrollContainer = await waitForElement(() => findScrollableContainer(dialog), 12_000);
    if (!scrollContainer) throw new Error("Não encontrei a área rolável da lista de seguidores.");

    const followers = await collectFollowers({
      dialog,
      scrollContainer,
      expectedInfo,
      account
    });

    await finishScan(account, followers, null, mode);
  }

  async function finishScan(account, followers, following, mode) {
    assertNotCancelled();
    await safeMessage({
      type: "SCAN_COMPLETE",
      payload: { account, followers, following, mode }
    });
    const total = mode === "nonFollowers" ? (following?.length ?? 0) : followers.length;
    updateOverlay("Varredura concluída. Abrindo o resultado…", total, total);
    setTimeout(removeOverlay, 2500);
  }

  async function collectRelationshipsViaApi(apiContext, account, mode) {
    let expectedFollowers = null;
    let expectedFollowing = null;

    try {
      const profile = await fetchInstagramJson(
        `/api/v1/users/${encodeURIComponent(apiContext.userId)}/info/`,
        apiContext.headers
      );
      expectedFollowers = safeCount(profile?.user?.follower_count);
      expectedFollowing = safeCount(profile?.user?.following_count);
    } catch (error) {
      console.warn("Unfollow Local: não foi possível obter as contagens do perfil.", error);
    }

    const report = async (relationship, count) => {
      const label = relationship === "followers" ? "seguidores" : "contas seguidas";
      const expected = relationship === "followers" ? expectedFollowers : expectedFollowing;
      await progress(
        "scanning",
        `Analisando ${label}: ${formatNumber(count)}`,
        count,
        expected,
        account
      );
      updateOverlay(`Analisando ${label}…`, count, expected);
    };

    const followers = await collectRelationshipViaApi({
      apiContext,
      account,
      relationship: "followers",
      expected: expectedFollowers,
      onProgress: report
    });
    let following = null;
    if (mode === "nonFollowers") {
      await report("following", 0);
      await sleep(randomBetween(API_DELAY_MIN_MS, API_DELAY_MAX_MS));
      following = await collectRelationshipViaApi({
        apiContext,
        account,
        relationship: "following",
        expected: expectedFollowing,
        onProgress: report
      });
    }

    return { followers, following };
  }

  async function collectRelationshipViaApi({ apiContext, account, relationship, expected, onProgress }) {
    const collected = new Map();
    const seenCursors = new Set();
    const startedAt = Date.now();
    let cursor = "";

    while (Date.now() - startedAt < MAX_SCAN_MS) {
      assertNotCancelled();
      const url = new URL(
        `/api/v1/friendships/${encodeURIComponent(apiContext.userId)}/${relationship}/`,
        location.origin
      );
      url.searchParams.set("count", String(API_PAGE_SIZE));
      if (relationship === "followers") url.searchParams.set("search_surface", "follow_list_page");
      if (relationship === "following") url.searchParams.set("order", "date_followed_latest");
      if (cursor) url.searchParams.set("max_id", cursor);

      const page = await fetchInstagramJson(url.href, apiContext.headers);
      for (const user of Array.isArray(page?.users) ? page.users : []) {
        const follower = followerFromApiUser(user, account);
        if (!follower) continue;
        const identity = follower.id ? `id:${follower.id}` : `username:${follower.username}`;
        collected.set(identity, follower);
      }
      await onProgress(relationship, collected.size);

      const nextCursor = page?.next_max_id == null ? "" : String(page.next_max_id);
      if (!nextCursor) {
        validateApiCompleteness(collected.size, expected, relationship);
        return [...collected.values()];
      }

      if (seenCursors.has(nextCursor)) {
        throw new Error("O Instagram repetiu uma página da lista. Tente novamente mais tarde.");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      await sleep(randomBetween(API_DELAY_MIN_MS, API_DELAY_MAX_MS));
    }

    throw new Error("A varredura excedeu 30 minutos e foi interrompida sem alterar o snapshot anterior.");
  }

  function discoverInstagramApiContext() {
    const source = document.documentElement.innerHTML;
    const userId = firstMatch(source, [
      /"viewerId"\s*:\s*"(\d+)"/i,
      /\\"viewerId\\"\s*:\s*\\"(\d+)\\"/i,
      /"appScopedIdentity"\s*:\s*"(\d+)"/i,
      /\\"appScopedIdentity\\"\s*:\s*\\"(\d+)\\"/i
    ]);
    if (!userId) return null;

    const headers = {
      "accept": "*/*",
      "content-type": "application/x-www-form-urlencoded",
      "x-asbd-id": "359341",
      "x-ig-max-touch-points": "0",
      "x-requested-with": "XMLHttpRequest"
    };
    const csrfToken = readCookie("csrftoken") || firstMatch(source, [
      /"csrf_token"\s*:\s*"([^"]+)"/i,
      /\\"csrf_token\\"\s*:\s*\\"([^\\"]+)\\"/i
    ]);
    const appId = firstMatch(source, [
      /"X-IG-App-ID"\s*:\s*"(\d+)"/i,
      /\\"X-IG-App-ID\\"\s*:\s*\\"(\d+)\\"/i
    ]);

    if (csrfToken) headers["x-csrftoken"] = csrfToken;
    if (appId) headers["x-ig-app-id"] = appId;
    try {
      const claim = sessionStorage.getItem("www-claim-v2");
      if (claim) headers["x-ig-www-claim"] = claim;
    } catch {
      // A coleta ainda pode funcionar sem o claim em algumas sessões.
    }

    return { userId, headers };
  }

  async function fetchInstagramJson(url, headers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers,
        signal: controller.signal
      });
      if (/\/accounts\/login|\/challenge/.test(response.url)) {
        throw new Error("Sua sessão expirou ou o Instagram solicitou uma verificação de segurança.");
      }
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("O Instagram limitou temporariamente as consultas. Aguarde e tente novamente.");
        }
        if ([401, 403].includes(response.status)) {
          throw new Error("O Instagram recusou a sessão. Faça login novamente e tente de novo.");
        }
        throw new Error(`O Instagram recusou a consulta (status ${response.status}).`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error("O Instagram retornou uma resposta inesperada. Tente novamente mais tarde.");
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("O Instagram demorou demais para responder. Tente novamente.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function followerFromApiUser(user, account) {
    const username = String(user?.username ?? "").trim().toLowerCase();
    if (!validUsername(username) || username === account.toLowerCase()) return null;
    return {
      id: String(user?.pk ?? user?.pk_id ?? "").trim(),
      username,
      name: String(user?.full_name ?? "").trim(),
      avatarUrl: String(user?.profile_pic_url ?? "").trim(),
      profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`
    };
  }

  function safeCount(value) {
    const count = Number(value);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  function validateApiCompleteness(collected, expected, relationship) {
    const label = relationship === "followers" ? "seguidores" : "contas seguidas";
    if (expected === null) {
      if (collected === 0) {
        throw new Error(`O Instagram não retornou ${label}. Tente novamente mais tarde.`);
      }
      return;
    }
    if (relationship === "following") {
      const tolerance = Math.max(2, Math.ceil(expected * 0.01));
      if (Math.abs(collected - expected) <= tolerance) return;
    } else if (collected === expected) {
      return;
    }
    if (collected !== expected) {
      throw new Error(
        `Coleta incompleta de ${label}: eram esperados ${expected}, mas foram recebidos ${collected}.`
      );
    }
  }

  function firstMatch(source, patterns) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : null;
  }

  function randomBetween(minimum, maximum) {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  async function collectFollowers({ dialog, scrollContainer, expectedInfo, account }) {
    const collected = new Map();
    const startedAt = Date.now();
    let stableRounds = 0;
    let lastCount = 0;
    let lastScrollTop = -1;

    while (Date.now() - startedAt < MAX_SCAN_MS) {
      assertNotCancelled();
      extractVisibleFollowers(dialog, account).forEach((follower) => {
        collected.set(follower.username, follower);
      });

      const expected = expectedInfo?.value ?? null;
      await progress(
        "scanning",
        expected ? `Coletando seguidores: ${collected.size} de ${formatNumber(expected)}` : `Coletando seguidores: ${collected.size}`,
        collected.size,
        expected,
        account
      );
      updateOverlay("Verificando seguidores…", collected.size, expected);

      if (expectedInfo?.exact && collected.size === expectedInfo.value) {
        return [...collected.values()];
      }

      const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 8;
      const unchanged = collected.size === lastCount && scrollContainer.scrollTop === lastScrollTop;
      stableRounds = atBottom && unchanged ? stableRounds + 1 : 0;

      if (stableRounds >= 5) {
        validateCompleteness(collected.size, expectedInfo);
        return [...collected.values()];
      }

      lastCount = collected.size;
      lastScrollTop = scrollContainer.scrollTop;
      const nextTop = Math.min(
        scrollContainer.scrollTop + Math.max(420, Math.floor(scrollContainer.clientHeight * 0.82)),
        scrollContainer.scrollHeight
      );
      scrollContainer.scrollTo({ top: nextTop, behavior: "smooth" });
      await waitForMutationOrTimeout(dialog, 1200);
    }

    throw new Error("A varredura excedeu 30 minutos e foi interrompida sem alterar o snapshot anterior.");
  }

  function extractVisibleFollowers(dialog, account) {
    const result = [];
    const seen = new Set();

    const addFollower = (username, row, anchor = null) => {
      if (!username || username === account || seen.has(username)) return;

      const avatar = row?.querySelector("img") ?? anchor?.querySelector("img");
      const name = extractDisplayName(row, username);

      result.push({
        username,
        name,
        avatarUrl: avatar?.currentSrc || avatar?.src || "",
        profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`
      });
      seen.add(username);
    };

    for (const anchor of dialog.querySelectorAll('a[href]')) {
      const username = usernameFromHref(anchor.getAttribute("href"));
      const row = findFollowerRow(anchor, dialog);
      addFollower(username, row, anchor);
    }

    // Algumas versões do Instagram renderizam as linhas sem um link de perfil.
    // Nesse caso, o botão "Remover" é o marcador semântico mais estável da linha.
    for (const action of dialog.querySelectorAll("button, [role='button']")) {
      if (!isFollowerAction(action)) continue;
      const row = findFollowerRowFromAction(action, dialog, account);
      const username = extractUsernameFromRow(row, account);
      addFollower(username, row);
    }

    return result;
  }

  function isFollowerAction(element) {
    const text = normalizeText(element.textContent || element.getAttribute("aria-label") || "");
    return ["remover", "remove", "seguindo", "following"].includes(text);
  }

  function findFollowerRowFromAction(action, boundary, account) {
    let element = action;
    for (let depth = 0; depth < 9 && element && element !== boundary; depth += 1) {
      const hasImage = Boolean(element.querySelector?.("img"));
      if (hasImage && extractUsernameFromRow(element, account)) return element;
      element = element.parentElement;
    }
    return null;
  }

  function extractUsernameFromRow(row, account) {
    if (!row) return null;
    const ignored = new Set([
      "remover", "remove", "seguir", "follow", "seguindo", "following",
      "solicitado", "requested", "pesquisar", "search"
    ]);

    const leafTexts = [...row.querySelectorAll("a, span, div")]
      .filter((element) => element.childElementCount === 0)
      .map((element) => element.textContent?.trim() || "");

    for (const text of leafTexts) {
      const username = text.replace(/^@/, "");
      if (!username || ignored.has(normalizeText(username))) continue;
      if (username.toLowerCase() === account.toLowerCase()) continue;
      if (validUsername(username)) return username;
    }

    return null;
  }

  function findFollowerRow(anchor, boundary) {
    let element = anchor;
    for (let depth = 0; depth < 7 && element && element !== boundary; depth += 1) {
      const hasImage = Boolean(element.querySelector?.("img"));
      const hasAction = Boolean(element.querySelector?.("button, [role='button']"));
      if (hasImage && hasAction) return element;
      element = element.parentElement;
    }
    return anchor.parentElement;
  }

  function extractDisplayName(row, username) {
    if (!row) return "";
    const ignored = new Set([
      username.toLowerCase(), `@${username.toLowerCase()}`, "seguir", "seguindo", "follow", "following",
      "remover", "remove", "solicitado", "requested"
    ]);

    const candidates = [...row.querySelectorAll("span, div")]
      .map((element) => element.childElementCount === 0 ? element.textContent?.trim() : "")
      .filter((text) => text && text.length <= 120 && !ignored.has(text.toLowerCase()));

    return candidates.find((text) => !text.startsWith("@") && !USERNAME_PATTERN.test(text)) ?? "";
  }

  function findFollowersLink(account) {
    const expectedPath = `/${account.toLowerCase()}/followers`;
    const anchors = [...document.querySelectorAll("a[href]")];

    const pathMatch = anchors.find((anchor) => {
      try {
        const url = new URL(anchor.getAttribute("href"), location.origin);
        const path = url.pathname.toLowerCase().replace(/\/+$/, "");
        return url.origin === location.origin && path === expectedPath;
      } catch {
        return false;
      }
    });
    if (pathMatch) return pathMatch;

    const followerTextPattern = /^\s*[\d.,]+\s*(seguidores|followers)\s*$/i;
    const labelledControl = [...document.querySelectorAll("a, button, [role='button']")]
      .find((element) => followerTextPattern.test(element.textContent || ""));
    if (labelledControl) return labelledControl;

    const textElement = [...document.querySelectorAll("span, div")]
      .filter((element) => element.childElementCount === 0)
      .find((element) => followerTextPattern.test(element.textContent || ""));
    if (!textElement) return null;

    return textElement.closest("a, button, [role='button']") ?? textElement;
  }

  function findScrollableContainer(dialog) {
    const knownInstagramContainer = dialog.querySelector("._aano");
    if (knownInstagramContainer && canActuallyScroll(knownInstagramContainer)) {
      return knownInstagramContainer;
    }

    const elements = [dialog, ...dialog.querySelectorAll("div, section, ul")];
    const candidates = elements
      .filter(canActuallyScroll)
      .map((element) => {
        const style = getComputedStyle(element);
        const profileLinks = [...element.querySelectorAll("a[href]")]
          .filter((anchor) => usernameFromHref(anchor.getAttribute("href"))).length;
        let score = profileLinks * 10;
        if (["auto", "scroll"].includes(style.overflowY)) score += 100;
        if (element.classList.contains("_aano")) score += 200;
        if (element !== dialog) score += 20;
        score += Math.min(80, Math.round((element.scrollHeight - element.clientHeight) / 10));
        return { element, score };
      })
      .sort((left, right) => right.score - left.score);

    return candidates[0]?.element ?? null;
  }

  function canActuallyScroll(element) {
    if (!element || element.clientHeight < 60 || element.scrollHeight <= element.clientHeight + 8) {
      return false;
    }

    const originalTop = element.scrollTop;
    const probeTop = originalTop < element.scrollHeight - element.clientHeight
      ? originalTop + 1
      : Math.max(0, originalTop - 1);

    element.scrollTop = probeTop;
    const moved = element.scrollTop !== originalTop;
    element.scrollTop = originalTop;
    return moved;
  }

  async function waitForAccountUsername(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      assertNotCancelled();
      const username = detectAccountUsername();
      if (username) return username;
      await sleep(500);
    }
    return null;
  }

  async function waitForLogin(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      assertNotCancelled();
      if (!isLoginRequired()) return true;
      await sleep(800);
    }
    return false;
  }

  function detectAccountUsername() {
    const current = usernameFromProfilePage();
    if (current && findFollowersLink(current)) return current;

    const profileLabelPattern = /(^|\s)(perfil|profile)(\s|$)/i;
    const anchors = [...document.querySelectorAll('a[href]')]
      .map((anchor, order) => ({
        anchor,
        order,
        username: usernameFromHref(anchor.getAttribute("href"))
      }))
      .filter((candidate) => candidate.username);

    const semanticMatch = anchors.find(({ anchor }) => {
      const ownLabel = `${anchor.getAttribute("aria-label") || ""} ${anchor.getAttribute("title") || ""}`;
      const labelledChild = anchor.querySelector("[aria-label], [title]");
      const childLabel = labelledChild
        ? `${labelledChild.getAttribute("aria-label") || ""} ${labelledChild.getAttribute("title") || ""}`
        : "";
      return profileLabelPattern.test(`${ownLabel} ${childLabel}`);
    });
    if (semanticMatch) return semanticMatch.username;

    const sidebarAvatarCandidates = anchors
      .map((candidate) => {
        const image = candidate.anchor.querySelector("img");
        if (!image || candidate.anchor.closest("main")) return null;

        const alt = image.getAttribute("alt") || "";
        const rect = image.getBoundingClientRect();
        let score = 0;
        if (/(foto|photo).*(perfil|profile)|(perfil|profile).*(foto|photo)/i.test(alt)) score += 60;
        if (candidate.anchor.closest("nav, header, [role='navigation']")) score += 40;
        if (rect.width > 0 && rect.width <= 44 && rect.height > 0 && rect.height <= 44) score += 20;
        return { ...candidate, score };
      })
      .filter((candidate) => candidate?.score >= 20)
      .sort((left, right) => right.score - left.score || left.order - right.order);

    if (sidebarAvatarCandidates.length > 0) {
      return sidebarAvatarCandidates[0].username;
    }

    return null;
  }

  function usernameFromProfilePage() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    return validUsername(parts[0]) ? parts[0].toLowerCase() : null;
  }

  function usernameFromHref(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1 || !validUsername(parts[0])) return null;
      return parts[0].toLowerCase();
    } catch {
      return null;
    }
  }

  function validUsername(value) {
    return USERNAME_PATTERN.test(value) && !RESERVED_PATHS.has(value.toLowerCase());
  }

  function normalizeText(value) {
    return String(value).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isOnProfile(account) {
    return location.pathname.toLowerCase() === `/${account.toLowerCase()}/`;
  }

  function isLoginRequired() {
    return location.pathname.startsWith("/accounts/login") ||
      Boolean(document.querySelector('input[name="username"], input[name="password"]'));
  }

  function parseFollowerCount(text) {
    const normalized = String(text).toLowerCase().replace(/seguidores|followers/g, "").trim();
    const match = normalized.match(/([\d.,]+)\s*(mil|k|mi|m|bi|b)?/i);
    if (!match) return null;

    const suffix = match[2]?.toLowerCase() ?? "";
    if (!suffix) {
      const digits = match[1].replace(/\D/g, "");
      return digits ? { value: Number(digits), exact: true } : null;
    }

    let numeric = match[1].replace(/\s/g, "");
    if (numeric.includes(",") && numeric.includes(".")) {
      numeric = numeric.lastIndexOf(",") > numeric.lastIndexOf(".")
        ? numeric.replace(/\./g, "").replace(",", ".")
        : numeric.replace(/,/g, "");
    } else {
      numeric = numeric.replace(",", ".");
    }

    const multiplier = ["mil", "k"].includes(suffix) ? 1_000
      : ["mi", "m"].includes(suffix) ? 1_000_000
        : 1_000_000_000;
    const value = Math.round(Number.parseFloat(numeric) * multiplier);
    return Number.isFinite(value) ? { value, exact: false } : null;
  }

  function validateCompleteness(collected, expectedInfo) {
    if (!expectedInfo) {
      if (collected === 0) throw new Error("Nenhum seguidor foi encontrado; o snapshot anterior foi preservado.");
      return;
    }

    if (expectedInfo.exact && collected !== expectedInfo.value) {
      throw new Error(`Varredura incompleta: o Instagram informa ${expectedInfo.value}, mas foram coletados ${collected}. O snapshot anterior foi preservado.`);
    }

    if (!expectedInfo.exact) {
      const tolerance = Math.max(100, Math.ceil(expectedInfo.value * 0.06));
      if (Math.abs(collected - expectedInfo.value) > tolerance) {
        throw new Error(`A quantidade coletada (${collected}) ficou distante da quantidade exibida (${expectedInfo.value}). O snapshot anterior foi preservado.`);
      }
    }
  }

  async function progress(status, message, collected = 0, expected = null, account = undefined) {
    await safeMessage({
      type: "SCAN_PROGRESS",
      progress: { status, message, collected, expected, account }
    });
  }

  async function safeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return null;
    }
  }

  function assertNotCancelled() {
    if (cancelled) throw new Error("Varredura cancelada.");
  }

  function waitForElement(factory, timeoutMs) {
    return new Promise((resolve) => {
      const existing = factory();
      if (existing) return resolve(existing);

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
      const observer = new MutationObserver(() => {
        const element = factory();
        if (!element) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(element);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function waitForMutationOrTimeout(target, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        resolve();
      };
      const observer = new MutationObserver(finish);
      observer.observe(target, { childList: true, subtree: true });
      setTimeout(finish, timeoutMs);
    });
  }

  function showOverlay(message, collected, expected) {
    removeOverlay();
    const root = document.createElement("aside");
    root.id = "unfollow-local-overlay";
    root.innerHTML = `
      <style>
        #unfollow-local-overlay{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:320px;padding:18px;background:#111827;color:#fff;border:1px solid #374151;border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.35);font:14px/1.45 Arial,sans-serif}
        #unfollow-local-overlay *{box-sizing:border-box}
        #unfollow-local-overlay strong{display:block;font-size:16px;margin-bottom:6px}
        #unfollow-local-overlay p{margin:0 0 12px;color:#d1d5db}
        #unfollow-local-overlay .uf-track{height:7px;overflow:hidden;border-radius:99px;background:#374151}
        #unfollow-local-overlay .uf-bar{height:100%;width:20%;border-radius:99px;background:#60a5fa;transition:width .25s}
        #unfollow-local-overlay .uf-meta{display:flex;justify-content:space-between;margin-top:8px;color:#9ca3af;font-size:12px}
        #unfollow-local-overlay button{margin-top:12px;width:100%;padding:8px;border:1px solid #4b5563;border-radius:9px;background:transparent;color:#fff;cursor:pointer}
      </style>
      <strong>Unfollow Local</strong>
      <p data-role="message"></p>
      <div class="uf-track"><div class="uf-bar" data-role="bar"></div></div>
      <div class="uf-meta"><span data-role="count"></span><span>Não feche esta aba</span></div>
      <button type="button">Cancelar</button>`;
    document.documentElement.appendChild(root);
    root.querySelector("button").addEventListener("click", async () => {
      cancelled = true;
      await safeMessage({ type: "CANCEL_SCAN" });
      removeOverlay();
    });
    updateOverlay(message, collected, expected);
  }

  function updateOverlay(message, collected, expected, isError = false) {
    const root = document.getElementById("unfollow-local-overlay");
    if (!root) return;
    root.querySelector('[data-role="message"]').textContent = message;
    root.querySelector('[data-role="count"]').textContent = expected
      ? `${formatNumber(collected)} / ${formatNumber(expected)}`
      : `${formatNumber(collected)} coletados`;
    const percent = expected ? Math.min(100, Math.round((collected / expected) * 100)) : 22;
    const bar = root.querySelector('[data-role="bar"]');
    bar.style.width = `${percent}%`;
    bar.style.background = isError ? "#f87171" : "#60a5fa";
  }

  function removeOverlay() {
    document.getElementById("unfollow-local-overlay")?.remove();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
