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

for (const [roleId, idleFile, libraryCount] of [["mobi-a", "standing.svg", 14], ["mobi-b", "idle.svg", 14], ["mobi-c", "thinking.svg", 15]]) {
  test(`${roleId} has one default per state while preserving optional and saved actions`, () => withCatalog(() => {
    const actions = require("../../runtime/clawd/src/pet-action-plan");
    const theme = loader.loadTheme(roleId, { strict: true });
    const plan = actions.resolveEffectivePlan(theme);
    const expected = { idle: idleFile, roam: "roam.svg", working: "working.svg", waiting: "notification.svg", complete: "attention.svg", error: "error.svg", held: "drag.svg" };
    for (const [state, file] of Object.entries(expected)) {
      assert.equal(plan.states[state].mode, "sequence");
      assert.deepEqual(plan.states[state].actions, [{ file, enabled: true, durationMs: theme.actionDurations[file] }]);
    }
    const library = actions.collectActionFiles(theme);
    assert.equal(library.length, libraryCount);
    for (const file of ["thinking.svg", "building.svg", "juggling.svg", "sweeping.svg", "carrying.svg", "celebration-screen.svg"]) assert.ok(library.includes(file));
    const selected = loader.loadTheme(roleId, { strict: true, overrides: { actionPlan: { version: 1, states: {
      idle: { mode: "sequence", actions: [{ file: idleFile, enabled: true, durationMs: 4000 }] },
      working: { mode: "random", actions: [{ file: "building.svg", enabled: true, durationMs: 4000 }] },
      complete: { mode: "sequence", actions: [{ file: "celebration-screen.svg", enabled: true, durationMs: 4000 }] },
    } } } });
    const saved = actions.resolveEffectivePlan(selected);
    assert.equal(saved.states.working.mode, "random");
    assert.deepEqual(saved.states.working.actions, [{ file: "building.svg", enabled: true, durationMs: 6000 }]);
    assert.deepEqual(saved.states.complete.actions, [{ file: "celebration-screen.svg", enabled: true, durationMs: 8000 }]);
    assert.deepEqual(actions.defaultPlan(selected), plan, 'restore defaults uses the curated plan rather than saved assignments');
  }));
}

for (const [roleId, retiredLabel] of [["mobi-a", "整理工牌"], ["mobi-c", "等活叹气"]]) test(`${roleId} retires its idle animation and safely falls back from saved references`, () => withCatalog(() => {
  const actions = require("../../runtime/clawd/src/pet-action-plan");
  const generator = require("../../scripts/generate-mobi-themes.cjs");
  const variant = generator.variants.find(role => role.id === roleId);
  const raw = generator.manifest(variant);
  const assetsDir = path.join(runtime, "themes", roleId, "assets");
  assert.equal(fs.existsSync(path.join(assetsDir, "idle.svg")), false);
  assert.equal(actions.collectActionFiles(raw).includes("idle.svg"), false);
  assert.equal(Object.values(raw.actionLabels).includes(retiredLabel), false);
  const defaultVisual = generator.renderSvg(variant, "idle");
  if (roleId === "mobi-a") assert.doesNotMatch(defaultVisual, /animation:|prop-badge|prop-watch/);
  else {
    assert.equal(fs.existsSync(path.join(assetsDir, "standing.svg")), false);
    assert.equal(actions.collectActionFiles(raw).includes("standing.svg"), false);
    assert.equal(raw.actionLabels["standing.svg"], undefined);
    for (const state of ["idle", "yawning", "dozing", "waking"]) assert.deepEqual(raw.states[state], ["thinking.svg"]);
    assert.equal(raw.timings.minDisplay.idle, 6000);
  }
  assert.equal(fs.readFileSync(path.join(assetsDir, raw.states.idle[0]), "utf8"), defaultVisual);

  for (const retiredFile of roleId === "mobi-c" ? ["idle.svg", "standing.svg"] : ["idle.svg"]) {
    const theme = loader.loadTheme(roleId, { strict: true, overrides: { actionPlan: {
      version: 1,
      states: {
        idle: { mode: "sequence", actions: [{ file: retiredFile, enabled: true, durationMs: 4000 }] },
        working: { mode: "sequence", actions: [{ file: "working.svg", enabled: true, durationMs: 5000 }] },
      },
    } } });
    const plan = actions.resolveEffectivePlan(theme);
    assert.ok(plan.states.idle.actions.some(action => action.enabled));
    assert.equal(Object.values(plan.states).some(slot => slot.actions.some(action => action.file === retiredFile)), false);
    assert.deepEqual(plan.states.working.actions.map(action => action.file), ["working.svg"]);
    assert.equal(loader.getThemeMetadata(roleId).previewFileUrl.endsWith(raw.states.idle[0]), true);
    if (roleId === "mobi-c") assert.equal(require("../../runtime/clawd/src/theme-context")(theme).getRendererConfig().idleDefaultVisual, "thinking.svg");
  }
}));

for (const roleId of ["mobi-a", "mobi-b", "mobi-c"]) test(`${roleId} removes legacy mini visuals and ignores their saved action selections`, () => withCatalog(() => {
  const actions = require("../../runtime/clawd/src/pet-action-plan");
  const retiredFiles = ["mini-idle.svg", "mini-enter.svg", "mini-enter-sleep.svg", "mini-crabwalk.svg", "mini-peek.svg", "mini-alert.svg", "mini-happy.svg", "mini-sleep.svg", "mini-working.svg"];
  const theme = loader.loadTheme(roleId, { strict: true, overrides: { actionPlan: {
    version: 1,
    states: {
      idle: { mode: "sequence", actions: retiredFiles.map(file => ({ file, enabled: true, durationMs: 5000 })) },
      working: { mode: "sequence", actions: [...retiredFiles, "working.svg"].map(file => ({ file, enabled: true, durationMs: 5000 })) },
      held: { mode: "sequence", actions: [...retiredFiles, "drag.svg"].map(file => ({ file, enabled: true, durationMs: 5000 })) },
    },
  } } });
  assert.equal(theme.miniMode.supported, false);
  const assetsDir = path.join(runtime, "themes", roleId, "assets");
  assert.equal(fs.readdirSync(assetsDir).some(file => file.startsWith("mini-")), false);
  assert.equal(actions.collectActionFiles(theme).some(file => file.startsWith("mini-")), false);
  assert.equal(Object.keys(theme.actionLabels).some(file => file.startsWith("mini-")), false);
  const plan = actions.resolveEffectivePlan(theme);
  assert.ok(plan.states.idle.actions.some(action => action.enabled));
  for (const slot of Object.values(plan.states)) {
    assert.equal(slot.actions.some(action => action.file.startsWith("mini-")), false);
  }
  assert.deepEqual(plan.states.working.actions.map(action => action.file), ["working.svg"]);
  assert.deepEqual(plan.states.held.actions.map(action => action.file), ["drag.svg"]);
}));

test("Momo coffee idle plays a full ten-second cycle even with older saved timing", () => withCatalog(() => {
  const actions = require("../../runtime/clawd/src/pet-action-plan");
  const { probeAssetCycle } = require("../../runtime/clawd/src/animation-cycle");
  const cycle = probeAssetCycle(path.join(runtime, "themes/mobi-b/assets/idle.svg"));
  assert.equal(cycle.ms, 10000);
  const theme = loader.loadTheme("mobi-b", { strict: true, overrides: { actionPlan: {
    version: 1,
    states: { idle: { mode: "sequence", actions: [{ file: "idle.svg", enabled: true, durationMs: 4000 }] } },
  } } });
  const plan = actions.resolveEffectivePlan(theme);
  assert.equal(plan.states.idle.actions[0].durationMs, 10000);
  const generator = require("../../scripts/generate-mobi-themes.cjs");
  const variant = generator.variants.find(role => role.id === "mobi-b");
  assert.equal(fs.readFileSync(path.join(runtime, "themes/mobi-b/assets/idle.svg"), "utf8"), generator.renderSvg(variant, "idle"));
}));

for (const [roleId, sourceBeats, propClass] of [["mobi-a", [0, 2], "prop-paper"], ["mobi-b", [2, 3], "prop-cup"], ["mobi-c", [0, 2], "prop-paper"]]) test(`${roleId} thinking preserves its original gestures across a six-second cycle`, () => withCatalog(() => {
  const actions = require("../../runtime/clawd/src/pet-action-plan");
  const { probeAssetCycle } = require("../../runtime/clawd/src/animation-cycle");
  const asset = path.join(runtime, "themes", roleId, "assets/thinking.svg");
  assert.equal(probeAssetCycle(asset).ms, 6000);
  const raw = JSON.parse(fs.readFileSync(path.join(runtime, "themes", roleId, "theme.json"), "utf8"));
  const theme = loader.loadTheme(roleId, { strict: true, overrides: { actionPlan: {
    version: 1,
    states: {
      idle: { mode: "sequence", actions: [{ file: raw.states.idle[0], enabled: true, durationMs: 4000 }] },
      working: { mode: "sequence", actions: [{ file: "thinking.svg", enabled: true, durationMs: 5000 }] },
    },
  } } });
  assert.equal(actions.resolveEffectivePlan(theme).states.working.actions[0].durationMs, 6000);
  const generator = require("../../scripts/generate-mobi-themes.cjs");
  assert.equal(fs.readFileSync(asset, "utf8"), generator.renderSvg(generator.variants.find(role => role.id === roleId), "thinking"));
  const { parseDocument, DomUtils } = require("htmlparser2");
  const original = parseDocument(fs.readFileSync(path.join(runtime, "assets/source/action-updates", `${roleId}-thinking`, "thinking.svg"), "utf8"), { xmlMode: true });
  const current = parseDocument(fs.readFileSync(asset, "utf8"), { xmlMode: true });
  const byClass = (parent, name) => DomUtils.findOne(node => (node.attribs?.class || "").split(/\s+/).includes(name), parent.children);
  for (const [before, after] of [[`stage-${sourceBeats[0]}`, "thought-question"], [`stage-${sourceBeats[1]}`, "thought-idea"]]) {
    const sourcePhase = byClass(original, before), currentPhase = byClass(current, after);
    for (const part of ["actor", propClass]) {
      const expected = byClass(sourcePhase, part), actual = byClass(currentPhase, part);
      assert.ok(actual, `${after} must retain the original ${part}`);
      assert.equal(DomUtils.getOuterHTML(actual), DomUtils.getOuterHTML(expected));
    }
  }
}));

for (const roleId of ["mobi-a", "mobi-b", "mobi-c"]) test(`${roleId} juggling keeps three papers and one connected palm on each arm`, () => {
  const { parseDocument, DomUtils } = require("htmlparser2");
  const { probeAssetCycle } = require("../../runtime/clawd/src/animation-cycle");
  const asset = path.join(runtime, "themes", roleId, "assets/juggling.svg");
  const document = parseDocument(fs.readFileSync(asset, "utf8"), { xmlMode: true });
  const hasClass = name => node => (node.attribs?.class || "").split(/\s+/).includes(name);
  const stages = DomUtils.findAll(hasClass("stage"), document.children);
  assert.equal(stages.length, 4);
  for (const stage of stages) {
    const palms = DomUtils.findAll(hasClass("juggle-hand"), stage.children);
    assert.equal(palms.length, 2);
    for (const palm of palms) assert.ok(hasClass("limb")(palm.parent));
    assert.equal(DomUtils.findAll(hasClass("flying-paper"), stage.children).length, 3);
  }
  assert.equal(probeAssetCycle(asset).ms, 6000);
  const generator = require("../../scripts/generate-mobi-themes.cjs");
  assert.equal(fs.readFileSync(asset, "utf8"), generator.renderSvg(generator.variants.find(role => role.id === roleId), "juggling"));
});

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

test("built-in-only policy excludes external roles and falls back without deleting their files", () => withCatalog(userData => {
  const dir = path.join(userData, "themes", "custom-pet");
  fs.mkdirSync(dir, { recursive: true });
  const json = fs.readFileSync(path.join(runtime, "themes/mobi-a/theme.json"), "utf8");
  fs.writeFileSync(path.join(dir, "theme.json"), json);
  loader.setThemePolicy({ ...policy, allowUserThemes: false });
  for (const list of [loader.discoverThemes(), loader.listThemesWithMetadata()]) {
    assert.deepEqual(list.map(theme => theme.id).sort(), ["mobi-a", "mobi-b", "mobi-c"]);
  }
  assert.equal(loader.resolveThemeId("custom-pet"), "mobi-a");
  assert.equal(loader.loadTheme("custom-pet")._id, "mobi-a");
  assert.equal(fs.readFileSync(path.join(dir, "theme.json"), "utf8"), json);
}));

for (const previousTheme of ["calico", "missing-user-theme", "invalid-user-theme", "orphan-theme"]) test(`real startup preserves settings while resolving ${previousTheme}`, () => withCatalog(userData => {
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
  loader.setThemePolicy({ ...policy, allowUserThemes: false });
  const overrides = { actionPlan: { version: 1, states: { idle: { mode: "random", actions: [{ file: "idle.svg", enabled: true, durationMs: 4000 }] } } } };
  const snapshot = { theme: previousTheme, themeVariant: {}, themeOverrides: { "mobi-a": overrides,  calico: { states: { idle: { file: "calico-idle.svg" } } } } };
  const controller = { get: key => snapshot[key], hydrate(payload) { Object.assign(snapshot, payload); return { status: "ok" }; } };
  const themeRuntime = createThemeRuntime({ themeLoader: loader, settingsController: controller });
  const source = fs.readFileSync(path.join(runtime, "src/main.js"), "utf8");
  const start = source.indexOf('let _requestedThemeId =');
  const end = source.indexOf('// ── Pet window geometry / bounds runtime', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    console, themeLoader: loader, themeRuntime, _settingsController: controller,
  });
  assert.equal(snapshot.theme, "mobi-a");
  assert.deepEqual(themeRuntime.getActiveTheme()._userOverrides, overrides);
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

for (const roleId of ["mobi-a", "mobi-b", "mobi-c"]) test(`${roleId} offers independent frame and screen confetti with one default celebration`, () => withCatalog(() => {
  const actions = require("../../runtime/clawd/src/pet-action-plan");
  const generator = require("../../scripts/generate-mobi-themes.cjs");
  const theme = loader.loadTheme(roleId, { strict: true });
  assert.ok(actions.collectActionFiles(theme).includes("celebration-screen.svg"));
  assert.equal(theme.actionLabels["attention.svg"], "框内彩纸雨");
  assert.equal(theme.actionLabels["celebration-screen.svg"], "整屏彩纸雨");
  assert.deepEqual(actions.resolveEffectivePlan(theme).states.complete.actions.map(a => a.file), ["attention.svg"]);
  for (const file of ["attention.svg", "celebration-screen.svg"]) {
    const selected = loader.loadTheme(roleId, { strict: true, overrides: { actionPlan: { version: 1, states: {
      idle: { mode: "sequence", actions: [{ file: theme.states.idle[0], enabled: true, durationMs: 4000 }] },
      complete: { mode: "sequence", actions: [{ file, enabled: true, durationMs: 4000 }] },
    } } } });
    assert.deepEqual(actions.resolveEffectivePlan(selected).states.complete.actions, [{ file, enabled: true, durationMs: 8000 }]);
  }
  const {parseDocument,DomUtils}=require("htmlparser2");
  const byClass=(doc,name)=>DomUtils.findOne(n=>(n.attribs?.class||"").split(/\s+/).includes(name),doc.children,true);
  const docs=["attention.svg","celebration-screen.svg"].map(file=>{
    const asset=path.join(runtime,"themes",roleId,"assets",file),svg=fs.readFileSync(asset,"utf8");
    assert.equal(require("../../runtime/clawd/src/animation-cycle").probeAssetCycle(asset).ms,8000);
    assert.equal(svg,generator.renderSvg(generator.variants.find(v=>v.id===roleId),file.replace(/\.svg$/,"")));
    return parseDocument(svg,{xmlMode:true});
  });
  assert.equal(DomUtils.getOuterHTML(byClass(docs[0],"party-actor")),DomUtils.getOuterHTML(byClass(docs[1],"party-actor")));
  assert.ok(byClass(docs[0],"party-confetti"));
  assert.equal(byClass(docs[1],"party-confetti"),null);
}));

for(const roleId of ['mobi-a','mobi-b','mobi-c']) test(`${roleId} waiting holds its phone in one hand rig and omits the exclamation accent`,()=>withCatalog(()=>{
 const g=require('../../scripts/generate-mobi-themes.cjs'),{parseDocument,DomUtils}=require('htmlparser2');
 const file=path.join(runtime,'themes',roleId,'assets/notification.svg'),svg=fs.readFileSync(file,'utf8'),doc=parseDocument(svg,{xmlMode:true});
 const byClass=(root,name)=>DomUtils.findOne(n=>(n.attribs?.class||'').split(/\s+/).includes(name),root.children,true);
 const hand=byClass(doc,'phone-hand-right');assert.ok(hand,'the phone and fingers need one shared moving hand rig');
 assert.ok(byClass(hand,'held-phone'));assert.ok(byClass(hand,'phone-grip'));assert.ok(byClass(hand,'phone-thumb'));
 assert.ok(byClass(doc,'phone-arm-right'));assert.ok(byClass(doc,'phone-arm-left'));
 assert.equal(byClass(doc,'accent-tick'),null);assert.equal(byClass(doc,'accent-ping'),null);
 assert.equal(DomUtils.findAll(n=>(n.attribs?.class||'').split(/\s+/).includes('waiting-dot'),doc.children).length,3);
 assert.equal(require('../../runtime/clawd/src/animation-cycle').probeAssetCycle(file).ms,5000);
 assert.equal(loader.loadTheme(roleId,{strict:true}).actionDurations['notification.svg'],5000);
 assert.equal(svg,g.renderSvg(g.variants.find(v=>v.id===roleId),'notification'));
}));
