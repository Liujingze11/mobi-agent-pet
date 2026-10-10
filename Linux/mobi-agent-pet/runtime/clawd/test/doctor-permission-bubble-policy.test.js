const { describe, it } = require("node:test");
const assert = require("node:assert");
const { checkPermissionBubblePolicy } = require("../src/doctor-detectors/permission-bubble-policy");

describe("checkPermissionBubblePolicy", () => {
  it("passes when permission bubbles are enabled", () => {
    assert.deepStrictEqual(
      checkPermissionBubblePolicy({ prefs: { permissionBubblesEnabled: true } }),
      {
        id: "permission-bubble-policy",
        status: "pass",
        level: null,
        detail: "Permission bubbles are enabled",
      }
    );
  });

  it("treats intentionally disabled permission bubbles as neutral", () => {
    const result = checkPermissionBubblePolicy({ prefs: { permissionBubblesEnabled: false } });
    assert.strictEqual(result.status, "disabled-by-user");
    assert.strictEqual(result.level, "info");
    assert.strictEqual(result.fixAction, undefined);
  });

  it("treats the all-bubbles-hidden setting as neutral", () => {
    const result = checkPermissionBubblePolicy({
      prefs: { hideBubbles: true, permissionBubblesEnabled: true },
    });
    assert.strictEqual(result.status, "disabled-by-user");
    assert.strictEqual(result.level, "info");
  });

  it("returns info when DND suppresses otherwise enabled bubbles", () => {
    const result = checkPermissionBubblePolicy({
      prefs: { permissionBubblesEnabled: true },
      doNotDisturb: true,
    });
    assert.strictEqual(result.status, "suppressed-by-dnd");
    assert.strictEqual(result.level, "info");
  });
});
