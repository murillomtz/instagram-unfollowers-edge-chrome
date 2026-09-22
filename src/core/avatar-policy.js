const ALLOWED_AVATAR_ROOTS = ["cdninstagram.com", "fbcdn.net"];

export function isAllowedAvatarUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") return false;
    return ALLOWED_AVATAR_ROOTS.some((root) =>
      url.hostname === root || url.hostname.endsWith(`.${root}`)
    );
  } catch {
    return false;
  }
}

export function isAllowedImageType(value) {
  return /^image\/(?:avif|gif|jpe?g|png|webp)(?:;|$)/i.test(String(value ?? ""));
}
