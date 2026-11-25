import { test } from "node:test";
import { strict as assert } from "node:assert";
import { memberSubmissionStats, type MemberSubmission } from "./curator-member-stats";

const now = Date.parse("2026-11-25T00:00:00Z");
const row: MemberSubmission = { curator_playlist_id: "a", submitter_user_id: "member", cost_points: 50, status: "approved", created_at: "2026-11-24T00:00:00Z" };
test("member totals stay scoped to the selected playlist and member", () => {
  const stats = memberSubmissionStats([row, { ...row, curator_playlist_id: "b" }, { ...row, submitter_user_id: "other" }], "a", "member", now);
  assert.equal(stats.points, 50);
  assert.equal(stats.count, 1);
});
test("rejected and expired submissions do not reduce the 30-day balance", () => {
  assert.equal(memberSubmissionStats([{ ...row, status: "rejected" }, { ...row, created_at: "2026-10-25T00:00:00Z" }], "a", "member", now).points, 0);
});