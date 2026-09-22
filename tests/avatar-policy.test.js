import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedAvatarUrl, isAllowedImageType } from "../src/core/avatar-policy.js";

test("aceita somente CDNs HTTPS da Meta usados pelos avatares", () => {
  assert.equal(isAllowedAvatarUrl("https://scontent.cdninstagram.com/photo.jpg"), true);
  assert.equal(isAllowedAvatarUrl("https://instagram.fssa1-1.fna.fbcdn.net/photo.webp"), true);
  assert.equal(isAllowedAvatarUrl("http://scontent.cdninstagram.com/photo.jpg"), false);
  assert.equal(isAllowedAvatarUrl("https://cdninstagram.com.evil.example/photo.jpg"), false);
  assert.equal(isAllowedAvatarUrl("https://example.com/photo.jpg"), false);
});

test("aceita somente tipos MIME de imagem conhecidos", () => {
  assert.equal(isAllowedImageType("image/jpeg"), true);
  assert.equal(isAllowedImageType("image/webp; charset=binary"), true);
  assert.equal(isAllowedImageType("text/html"), false);
  assert.equal(isAllowedImageType("image/svg+xml"), false);
});
