"use strict";

function createProviderBalanceStore(db, { now = Date.now } = {}) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("database is required");
  const getRow = db.prepare("SELECT * FROM provider_balances WHERE provider_id=?");
  const upsert = db.prepare(`INSERT INTO provider_balances
    (provider_id,kind,amount,currency,remaining,unit,reset_at,checked_at,stale,error)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET
    kind=excluded.kind,amount=excluded.amount,currency=excluded.currency,
    remaining=excluded.remaining,unit=excluded.unit,reset_at=excluded.reset_at,
    checked_at=excluded.checked_at,stale=excluded.stale,error=excluded.error`);
  const fail = db.prepare(`INSERT INTO provider_balances(provider_id,stale,error) VALUES(?,1,?)
    ON CONFLICT(provider_id) DO UPDATE SET stale=1,error=excluded.error`);
  const invalidateRow = db.prepare("UPDATE provider_balances SET stale=1,error=NULL WHERE provider_id=?");
  const selectMany = db.prepare("SELECT * FROM provider_balances WHERE provider_id IN (SELECT value FROM json_each(?)) ORDER BY provider_id");
  function map(row) {
    if (!row) return null;
    return { providerId: row.provider_id, kind: row.kind, amount: row.amount, currency: row.currency,
      remaining: row.remaining, unit: row.unit, resetAt: row.reset_at, checkedAt: row.checked_at,
      stale: Boolean(row.stale), error: row.error };
  }
  function validate(value) {
    if (!value || !["money", "quota"].includes(value.kind)) throw new TypeError("invalid balance kind");
    if (value.kind === "money") {
      if (!Number.isFinite(value.amount) || value.amount < 0 || !/^[A-Z]{3}$/.test(value.currency || "")) {
        throw new TypeError("invalid money balance");
      }
    } else if (!Number.isFinite(value.remaining) || value.remaining < 0 ||
      typeof value.unit !== "string" || !value.unit.trim() || value.unit.length > 32 ||
      (value.resetAt != null && (!Number.isSafeInteger(value.resetAt) || value.resetAt < 0))) {
      throw new TypeError("invalid quota balance");
    }
  }
  function put(providerId, value) {
    validate(value);
    upsert.run(providerId, value.kind, value.kind === "money" ? value.amount : null,
      value.kind === "money" ? value.currency : null,
      value.kind === "quota" ? value.remaining : null, value.kind === "quota" ? value.unit : null,
      value.kind === "quota" ? value.resetAt ?? null : null, Math.trunc(now()), 0, null);
    return map(getRow.get(providerId));
  }
  function markFailure(providerId, reason) {
    if (!["auth", "network", "format"].includes(reason)) throw new TypeError("invalid balance error");
    fail.run(providerId, reason);
    return map(getRow.get(providerId));
  }
  function invalidate(providerId) {
    invalidateRow.run(providerId);
    return map(getRow.get(providerId));
  }
  function listVisible({ activeIds = [], enabledIds = [] } = {}) {
    const ids = [...new Set([...activeIds, ...enabledIds])].filter((id) => typeof id === "string");
    return ids.length ? selectMany.all(JSON.stringify(ids)).map(map) : [];
  }
  return { get: (providerId) => map(getRow.get(providerId)), put, markFailure, invalidate, listVisible };
}

module.exports = { createProviderBalanceStore };
