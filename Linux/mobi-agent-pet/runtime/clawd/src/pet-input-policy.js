"use strict";
(function (root) {
  const policy = Object.freeze({ dragThreshold: 8, doubleClickMs: 500, doubleClickDistance: 12 });
  if (typeof module !== "undefined" && module.exports) module.exports = policy;
  else root.MobiPetInputPolicy = policy;
})(globalThis);
