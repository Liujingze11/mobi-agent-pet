"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const loader = require("../src/theme-loader");
const { probeSvgCycle } = require("../src/animation-cycle");
const { variants, manifest, renderSvg } = require("../../../scripts/generate-mobi-themes.cjs");
const createThemeContext = require("../src/theme-context");
const { describeDashboardPetScene } = require("../src/dashboard-pet-scene");

const runtime = path.join(__dirname, "..");
loader.setThemePolicy({ defaultThemeId: "mobi-a", excludedBuiltinThemeIds: ["clawd", "calico", "cloudling"] });
loader.init(path.join(runtime, "src"));

test("only the three new Mobi characters are selectable built-in pets in the product catalog", () => {
  const ids = loader.discoverThemes().filter(theme => theme.builtin).map(theme => theme.id).sort();
  assert.deepEqual(ids, ["mobi-a", "mobi-b", "mobi-c"]);
});

for (const id of ["mobi-a", "mobi-b", "mobi-c"]) {
  test(`${id} loads current action and interaction assets without the retired mini capability`, () => {
    const theme = loader.loadTheme(id, { strict: true });
    assert.equal(theme._id, id);
    assert.equal(theme._capabilities.eyeTracking, true);
    assert.equal(theme._capabilities.miniMode, false);
    const context = createThemeContext(theme, { assetsSvgDir: path.join(runtime, "assets", "svg") });
    const files = new Set([
      ...Object.values(theme.states).flat(),
      ...theme.workingTiers.map((tier) => tier.file),
      ...theme.jugglingTiers.map((tier) => tier.file),
      ...require('../src/pet-action-plan').collectActionFiles(theme),
    ]);
    for (const file of files) {
      const assetPath = context.resolveAssetPath(file);
      assert.ok(assetPath.startsWith(path.join(runtime, "themes", id, "assets")), file);
      const doc = new JSDOM(fs.readFileSync(assetPath, "utf8"), { contentType: "image/svg+xml" });
      assert.equal(doc.window.document.documentElement.localName, "svg");
      assert.equal(doc.window.document.querySelectorAll("script, image, foreignObject").length, 0);
      doc.window.close();
    }
    const idle = new JSDOM(fs.readFileSync(context.resolveAssetPath(theme.states.idle[0]), "utf8"), { contentType: "image/svg+xml" });
    assert.ok(idle.window.document.getElementById(theme.eyeTracking.ids.eyes));
    idle.window.close();
    const scene = describeDashboardPetScene(theme, context.resolveAssetPath);
    assert.equal(scene.themeId, id);
    assert.ok(scene.imageUrl.endsWith(theme.states.idle[0]));
  });
}

test("the real theme page offers 莫比, 莫莫, and 比比 and allows selecting each character", async () => {
  const dom = new JSDOM('<main id="themes"></main><div id="dashboardThemeToasts"></div>', { runScripts: "outside-only" });
  const { window } = dom;
  const selectedIds = [];
  let selected = "mobi-c";
  window.petThemeAPI = {
    getSnapshot: async () => ({ theme: selected, petTint: {}, petAccessory: {} }),
    getPetTintOptions: async () => [],
    getPetAccessoryOptions: async () => [],
    listThemes: async () => loader.listThemesWithMetadata().map((theme) => ({ ...theme, active: theme.id === selected })),
    command: async (action, payload) => {
      assert.equal(action, "setThemeSelection");
      const theme = loader.loadTheme(payload.themeId, { strict: true });
      selected = theme._id;
      selectedIds.push(selected);
      return { status: "ok", themeId: selected, themeVariant: "default" };
    },
  };
  window.eval(fs.readFileSync(path.join(runtime, "..", "agentlog", "brand-renderer.js"), "utf8"));
  for (const script of ["settings-i18n.js", "settings-tab-theme.js", "dashboard-theme.js"]) {
    window.eval(fs.readFileSync(path.join(runtime, "src", script), "utf8"));
  }
  const page = window.ClawdDashboardTheme.create({ container: window.document.getElementById("themes"), getLang: () => "zh" });
  try {
    await page.enter();
    for (const name of ["莫比", "莫莫", "比比"]) {
      const card = [...window.document.querySelectorAll('.theme-card[role="radio"]')].find((item) => item.textContent.includes(name));
      assert.ok(card, `${name} must have a visible choice`);
      assert.ok(card.querySelector("img"), "each choice must show its own preview");
      card.click();
      await new Promise((resolve) => setImmediate(resolve));
      const active = window.document.querySelector('.theme-card[aria-checked="true"]');
      assert.ok(active.textContent.includes(name));
    }
    assert.deepEqual(selectedIds, ["mobi-a", "mobi-b", "mobi-c"]);
  } finally { page.leave(); window.close(); }
});

for (const variant of variants) {
  test(`${variant.id} ships its current safe actions with truthful durations and Chinese names`, () => {
    const theme = loader.loadTheme(variant.id, { strict: true });
    assert.equal(theme.name, { "mobi-a": "莫比", "mobi-b": "莫莫", "mobi-c": "比比" }[variant.id]);
    assert.equal(theme.version, "2.0.0");
    assert.deepEqual(theme.actionDurations, manifest(variant).actionDurations);
    assert.equal(Object.keys(theme.actionDurations).length, { 'mobi-a': 14, 'mobi-b': 14, 'mobi-c': 15 }[variant.id]);
    assert.deepEqual(Object.keys(theme.actionDurations).sort(), require('../src/pet-action-plan').collectActionFiles(theme).sort());
    for (const [file, duration] of Object.entries(theme.actionDurations)) {
      assert.ok(duration >= 3000, file);
      assert.match(theme.actionLabels[file], /[\u4e00-\u9fff]/);
      const svg = fs.readFileSync(path.join(runtime, "themes", variant.id, "assets", file), "utf8");
      assert.equal(svg, renderSvg(variant, file === variant.idleFile ? 'idle' : file.replace(/\.svg$/, "")), `${file} must match reproducible source`);
      const doc = new JSDOM(svg, { contentType: "image/svg+xml" });
      assert.equal(doc.window.document.querySelectorAll("script,foreignObject,image").length, 0);
      assert.ok(doc.window.document.getElementById("body-js"));
      assert.equal(new Set([...doc.window.document.querySelectorAll("[id]")].map(el => el.id)).size, doc.window.document.querySelectorAll("[id]").length);
      const cycle = probeSvgCycle(svg);
      if (file === 'standing.svg') {
        assert.equal(cycle.status, 'unavailable', 'standing is intentionally static');
      } else {
        assert.equal(cycle.status, file === 'drag.svg' ? 'estimated' : 'exact', file);
        assert.equal(cycle.ms, duration, `${file}: ${JSON.stringify(cycle)}`);
      }
      doc.window.close();
    }
    const numericLeaves = value => Object.values(value).flatMap(item => typeof item === "number" ? [item] : item && typeof item === "object" ? numericLeaves(item) : []);
    for (const duration of numericLeaves({ minDisplay: theme.timings.minDisplay, autoReturn: theme.timings.autoReturn })) assert.ok(duration >= 3000);
    for (const reaction of Object.values(theme.reactions)) if (reaction.duration) assert.ok(reaction.duration >= 3000);
    assert.equal(theme.miniMode.supported, false);
  });
}

test("比比 visibly blushes and throws thirteen office props through the second half of its outburst", () => {
  const doc = new JSDOM(fs.readFileSync(path.join(runtime,"themes/mobi-c/assets/error.svg"),"utf8"), {contentType:"image/svg+xml"});
  try {
    assert.ok(doc.window.document.querySelector('[fill="#ef7777"]'), "rage should visibly redden 比比's face");
    const props = [...doc.window.document.querySelectorAll('.rage-item')];
    assert.equal(props.length, 13);
    for (const kind of ['paper', 'keyboard', 'cup']) assert.ok(props.some(prop => prop.getAttribute('aria-label') === kind));
    assert.ok(doc.window.document.querySelector('.rage-laptop'), 'the broken computer remains in the scene');
  } finally { doc.window.close(); }
});

for (const id of ["mobi-a","mobi-b","mobi-c"]) {
  test(`${id} working actions show foreground typing hands and a normal laptop in every beat`, () => {
    for (const file of ["working.svg"]) {
      const doc = new JSDOM(fs.readFileSync(path.join(runtime,"themes",id,"assets",file),"utf8"), {contentType:"image/svg+xml"});
      try {
        for (const stage of doc.window.document.querySelectorAll(".stage")) {
          assert.ok(stage.querySelector(".pose-type"), `${file} must continuously type`);
          const laptop=stage.querySelector(".prop-laptop"), hands=stage.querySelector(".typing-hands");
          assert.ok(laptop && hands, `${file} shows a laptop and visible hands`);
          assert.ok(laptop.compareDocumentPosition(hands) & doc.window.Node.DOCUMENT_POSITION_FOLLOWING, "hands must paint above the laptop");
          assert.equal(hands.querySelectorAll(".typing-hand").length,2);
          assert.ok(stage.querySelectorAll(".typing-key").length >= 4);
          assert.equal(stage.querySelectorAll(".screen-code .code-line").length,4,"normal work progressively writes four screen lines");
          assert.ok(stage.querySelector(".code-cursor"),"the typing cursor remains visible");
          assert.equal(stage.querySelectorAll(".accent-bug,.accent-patch,.prop-chaos,[fill='#ef7777']").length,0,"work must not look like an error outburst");
        }
      } finally { doc.window.close(); }
    }
  });
}
