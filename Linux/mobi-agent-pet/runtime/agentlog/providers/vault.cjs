"use strict";

function createProviderVault({ safeStorage } = {}) {
  if (!safeStorage) throw new TypeError("safeStorage is required");

  function canStoreSecrets() {
    try {
      const backend = safeStorage.getSelectedStorageBackend?.();
      return safeStorage.isEncryptionAvailable() === true
        && typeof backend === "string"
        && backend !== "basic_text"
        && backend !== "unknown";
    } catch {
      return false;
    }
  }

  function seal(config, { allowPlain = false } = {}) {
    if (!canStoreSecrets()) {
      if (!allowPlain) throw new Error("Secure storage is unavailable");
      return Buffer.concat([Buffer.from("mobi-provider-public-v1:"), Buffer.from(JSON.stringify(config))]);
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(config));
    if (!Buffer.isBuffer(encrypted)) throw new TypeError("safeStorage returned invalid ciphertext");
    return Buffer.concat([Buffer.from("mobi-provider-v1:"), encrypted]);
  }

  function open(blob) {
    const publicMarker = Buffer.from("mobi-provider-public-v1:");
    if (Buffer.isBuffer(blob) && blob.subarray(0, publicMarker.length).equals(publicMarker)) {
      return JSON.parse(blob.subarray(publicMarker.length).toString("utf8"));
    }
    if (!canStoreSecrets()) throw new Error("Secure storage is unavailable");
    const marker = Buffer.from("mobi-provider-v1:");
    if (!Buffer.isBuffer(blob) || !blob.subarray(0, marker.length).equals(marker)) {
      throw new Error("Unsupported provider ciphertext");
    }
    return JSON.parse(safeStorage.decryptString(blob.subarray(marker.length)));
  }

  return { seal, open, canStoreSecrets };
}

module.exports = { createProviderVault };
