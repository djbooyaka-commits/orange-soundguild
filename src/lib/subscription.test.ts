import { test } from "node:test";
import assert from "node:assert/strict";
import { renewalExpiration, subscriptionDaysRemaining } from "./subscription.ts";

const now = Date.parse("2026-11-02T01:24:00Z");
test("early renewal adds 30 days without losing remaining days", () => {
  assert.equal(renewalExpiration("2026-11-12T01:24:00Z", now), "2026-12-12T01:24:00.000Z");
});
test("expired subscriptions receive 30 days from payment time", () => {
  assert.equal(renewalExpiration("2026-11-01T01:24:00Z", now), "2026-12-02T01:24:00.000Z");
});
test("a first subscription receives 30 days", () => {
  assert.equal(renewalExpiration(null, now), "2026-12-02T01:24:00.000Z");
});
test("days remaining includes partial days and never goes below zero", () => {
  assert.equal(subscriptionDaysRemaining("2026-11-03T02:24:00Z", now), 2);
  assert.equal(subscriptionDaysRemaining("2026-11-01T01:24:00Z", now), 0);
});