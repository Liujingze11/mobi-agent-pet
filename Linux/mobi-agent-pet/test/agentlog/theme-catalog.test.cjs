"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const runtime = path.join(root, "runtime/clawd");
const loader = require("../../runtime/clawd/src/theme-loader");
const createThemeRuntime = require("../../runtime/clawd/src/theme-runtime");
const policy = { defaultThemeId: "mobi-a", excludedBuiltinThemeIds: ["clawd", "calico", "cloudling"] };

function withCatalog(run) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-catalog-"));
  try {
    loader.setThemePolicy(policy);
    loader.init(path.join(runtime, "src"), userData);
    return run(userData);
  } finally {
    if (typeof loader.setThemePolicy === "function") loader.setThemePolicy();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

test("Mobi catalog offers only the three new built-in pets through both listing APIs", () => withCatalog(() => {
  for (const list of [loader.discoverThemes(), loader.listThemesWithMetadata()]) {
    assert.deepEqual(list.filter(t => t.builtin).map(t => t.id).sort(), ["mobi-a", "mobi-b", "mobi-c"]);
  }
  assert.equal(loader.getDefaultThemeId(), "mobi-a");
  for (const id of ["clawd", "calico", "cloudling"]) {
    assert.throws(() => loader.loadTheme(id, { strict: true }), /not found/);
    assert.equal(loader.resolveThemeId(id), "mobi-a");
    assert.equal(loader.loadTheme(id)._id, "mobi-a");
  }
  assert.equal(loader.loadTheme("missing-user-theme")._id, "mobi-a");
}));

test("retiring built-ins preserves user-installed themes, even one with a retired identifier", () => withCatalog(userData => {
  const dir = path.join(userData, "themes", "clawd");
  fs.mkdirSync(dir, { recursive: true });
  const raw = JSON.parse(fs.readFileSync(path.join(runtime, "themes/mobi-a/theme.json"), "utf8"));
  raw.name = "My custom pet";
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(raw));
  fs.cpSync(path.join(runtime, "themes/mobi-a/assets"), path.join(dir, "assets"), { recursive: true });
  for (const list of [loader.discoverThemes(), loader.listThemesWithMetadata()]) {
    const custom = list.find(t => t.id === "clawd");
    assert.equal(custom.name, "My custom pet");
    assert.equal(custom.builtin, false);
  }
  assert.equal(loader.resolveThemeId("clawd"), "clawd");
  const loaded = loader.loadTheme("clawd", { strict: true });
  assert.equal(loaded._builtin, false);
  assert.equal(loaded.name, "My custom pet");
}));

for (const previousTheme of ["calico", "missing-user-theme", "invalid-user-theme", "orphan-theme", "recovered-theme"]) test(`real startup preserves settings while resolving ${previousTheme}`, () => withCatalog(userData => {
  if (previousTheme === "invalid-user-theme") {
    const dir = path.join(userData, "themes", previousTheme);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ schemaVersion: 0, name: "Invalid theme" }));
  }
  if (previousTheme === "orphan-theme") {
    const raw = fs.readFileSync(path.join(runtime, "themes/mobi-a/theme.json"), "utf8");
    for (const id of ["orphan-theme", "clawd"]) {
      const dir = path.join(userData, "themes", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "theme.json"), raw);
      fs.cpSync(path.join(runtime, "themes/mobi-a/assets"), path.join(dir, "assets"), { recursive: true });
    }
  }
  const overrides = { actionPlan: { version: 1, states: { idle: { mode: "random", actions: [{ file: "idle.svg", enabled: true, durationMs: 4000 }] } } } };
  const restoredOverrides = { actionPlan: { version: 1, states: { idle: { mode: "sequence", actions: [{ file: "idle.svg", enabled: true, durationMs: 5000 }] } } } };
  const snapshot = { theme: previousTheme, themeVariant: {}, themeOverrides: { "mobi-a": overrides, "recovered-theme": restoredOverrides, calico: { states: { idle: { file: "calico-idle.svg" } } } } };
  const controller = { get: key => snapshot[key], hydrate(payload) { Object.assign(snapshot, payload); return { status: "ok" }; } };
  const themeRuntime = createThemeRuntime({ themeLoader: loader, settingsController: controller });
  const source = fs.readFileSync(path.join(runtime, "src/main.js"), "utf8");
  const start = source.indexOf('let _requestedThemeId =');
  const end = source.indexOf('// ── Pet window geometry / bounds runtime', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    console, themeLoader: loader, themeRuntime, _settingsController: controller,
    codexPetMain: { syncThemes(id) {
      if (id === "recovered-theme") {
        const dir = path.join(userData, "themes", id);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(path.join(runtime, "themes/mobi-a/theme.json"), path.join(dir, "theme.json"));
        fs.cpSync(path.join(runtime, "themes/mobi-a/assets"), path.join(dir, "assets"), { recursive: true });
      }
      return {};
    }, summaryHasActiveOrphan: (_, id) => id === "orphan-theme", mergeSyncSummaries: () => ({}), setLastSyncSummary() {} },
  });
  assert.equal(snapshot.theme, previousTheme === "recovered-theme" ? previousTheme : "mobi-a");
  assert.deepEqual(themeRuntime.getActiveTheme()._userOverrides, previousTheme === "recovered-theme" ? restoredOverrides : overrides);
  assert.ok(snapshot.themeOverrides.calico, "old settings are retained without being applied to a new character");
}));

test("packaging excludes retired native pets but includes all three new characters", () => {
  const { FileMatcher } = require("app-builder-lib/out/fileMatcher");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const matcher = new FileMatcher(root, "/tmp/mobi-package-probe", value => value, pkg.build.files);
  const filter = matcher.createFilter();
  for (const id of ["clawd", "calico", "cloudling", "mobi-a", "mobi-b", "mobi-c"]) {
    const file = path.join(root, "runtime/clawd/themes", id, "theme.json");
    assert.equal(filter(file, fs.statSync(file)), id.startsWith("mobi-"), id);
  }
});

test("theme diagnostics recommend the available product default", () => withCatalog(() => {
  const { checkThemeHealth } = require("../../runtime/clawd/src/doctor-detectors/theme-health");
  const failed = checkThemeHealth({ themeId: "missing-user-theme" });
  assert.equal(failed.status, "fail");
  assert.match(failed.textHint, /莫比/);
  assert.doesNotMatch(failed.textHint, /clawd/);
  assert.equal(checkThemeHealth().themeId, "mobi-a");
}));
