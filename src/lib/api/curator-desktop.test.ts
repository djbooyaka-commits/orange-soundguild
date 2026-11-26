import { test } from "node:test";
import assert from "node:assert/strict";
import { signDesktopKey, verifyDesktopKey } from "./curator-desktop.server";

const uid = "11111111-2222-3333-4444-555555555555";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-secret";

test("accepts a fresh key for its curator", () => {
  assert.equal(verifyDesktopKey(signDesktopKey(uid).key), uid);
});
test("rejects an expired key", () => {
  assert.equal(verifyDesktopKey(signDesktopKey(uid, Date.now() - 91 * 86_400_000).key), null);
});
test("rejects a key edited to another curator", () => {
  const raw = Buffer.from(signDesktopKey(uid).key, "base64url").toString();
  const forged = Buffer.from(raw.replace(uid, "99999999-2222-3333-4444-555555555555")).toString("base64url");
  assert.equal(verifyDesktopKey(forged), null);
});
