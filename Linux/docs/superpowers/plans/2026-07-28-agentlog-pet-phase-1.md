# AgentLog Pet Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current manual-timer-driven Electron entry point with one Linux-first AgentLog Pet application powered by a pinned Clawd runtime, Codex CLI and Claude Code integrations, and a normalized live agent-event stream.

**Architecture:** Vendor the complete Clawd on Desk source snapshot at commit `45d388aa661824443cd96779ff0a5d277972bd10` under `runtime/clawd/` and keep its internal hook names and `clawd` compatibility protocol intact. A small CommonJS product layer under `runtime/agentlog/` owns the AgentLog Pet identity and normalized event stream, while a narrow callback in Clawd's existing `state.updateSession()` path observes every accepted Codex, Claude, and future-agent event without changing the upstream state machine.

**Tech Stack:** Electron 41, Node.js 22.12 or newer, CommonJS for the desktop runtime and bridge, React 19/Vite 6 retained for the existing management UI, Node's built-in test runner, electron-builder 26, Linux AppImage and Debian packages.

## Global Constraints

- Product name: `AgentLog Pet`.
- Tagline: `Your Private AI Agent Work Journal`.
- Package and repository name: `agentlog-pet`.
- Initial platform: Linux.
- The application has one installer, one application identity, one single-instance lock, one tray, one autostart entry, one update flow, and one Electron main-process owner.
- Codex CLI and Claude Code must work in the first usable release.
- The pet's primary visual state comes from live agent activity, never from the existing manual timer.
- Existing DevPulse source and user data must not be deleted; project data migration begins in Phase 2.
- Keep upstream internal `CLAWD_*`, `~/.clawd`, hook markers, managed-file markers, and the `clawd://` import protocol compatible in Phase 1.
- User-visible application copy uses `AgentLog Pet`; internal compatibility strings may continue to use `Clawd`.
- The upstream runtime is pinned to commit `45d388aa661824443cd96779ff0a5d277972bd10` before product patches are applied.
- Normalized-event observers are best-effort and must never block or alter the upstream pet state machine.
- The normalized-event stream is in-memory in Phase 1; SQLite persistence, project resolution, dual timers, summaries, and workspace restoration are separate implementation phases.

---

## File Map

### Product-owned files

- `runtime/agentlog/main.cjs`: Electron product bootstrap; sets the application identity before loading the pinned runtime.
- `runtime/agentlog/brand.cjs`: Canonical product name, tagline, application ID, repository URL, and safe copy-rebranding helpers.
- `runtime/agentlog/brand-renderer.js`: Sandboxed renderer equivalent of the copy-rebranding helper.
- `runtime/agentlog/runtime-bridge.cjs`: Process-wide bridge between the Clawd session coordinator and AgentLog-owned consumers.
- `runtime/agentlog/events/normalized-event.cjs`: Versioned normalized event schema and source-event conversion.
- `runtime/agentlog/events/event-stream.cjs`: Bounded in-memory event stream with isolated subscribers and diagnostics.
- `scripts/import-clawd-runtime.sh`: Reproducibly imports the exact upstream commit.
- `scripts/smoke-linux.cjs`: Launches the development or packaged application in an isolated home and verifies single-instance behavior.
- `test/agentlog/*.test.cjs`: Product identity, pin, branding, event schema, event stream, and package configuration tests.

### Pinned runtime files modified by AgentLog

- `runtime/clawd/src/main.js`: Wires the AgentLog event observer and opens the Agents view directly.
- `runtime/clawd/src/state.js`: Emits a best-effort raw session update to the AgentLog bridge.
- `runtime/clawd/src/i18n.js`: Applies product branding to translated user-visible strings.
- `runtime/clawd/src/settings-i18n.js`: Applies product branding in the sandboxed settings renderer.
- `runtime/clawd/src/settings.html`: Loads the renderer-safe brand helper and uses the AgentLog title.
- `runtime/clawd/src/settings-window.js`: Supports `open({ tab: "agents" })`.
- `runtime/clawd/src/preload-settings.js`: Exposes the main-process tab-selection signal.
- `runtime/clawd/src/settings-renderer.js`: Selects a requested settings tab.
- `runtime/clawd/src/menu.js`: Uses the AgentLog tooltip and exposes Agent Integrations from tray and pet menus.
- `runtime/clawd/src/settings-window-icon.js`: Uses the AgentLog application ID and settings title.
- `runtime/clawd/src/settings-tab-about.js`: Uses the AgentLog product name.
- `runtime/clawd/src/settings-ipc.js`: Returns AgentLog repository and author information.
- `runtime/clawd/src/login-item.js`: Uses the AgentLog autostart display name.
- `runtime/clawd/src/index.html`: Uses the AgentLog pet-window title.
- `runtime/clawd/test/state.test.js`: Covers observer delivery and failure isolation.
- `runtime/clawd/test/settings-window.test.js`: Covers direct Agents-tab opening.
- `runtime/clawd/test/menu-*.test.js`: Covers the Agent Integrations menu command and renamed tooltip.

### Root files

- `package.json`: Product package identity, scripts, dependency floors, Electron entry point, and electron-builder configuration.
- `package-lock.json`: Locked dependency graph.
- `electron-builder.yml`: Removed after its configuration is moved into `package.json`.
- `README.md`: Linux development, test, packaging, and product-scope instructions.
- `docs/superpowers/specs/2026-07-28-agentlog-pet-design.md`: Approved design status only.

---

### Task 1: Pin And Import The Clawd Runtime

**Files:**
- Create: `scripts/import-clawd-runtime.sh`
- Create: `runtime/clawd/**/*`
- Create: `runtime/clawd/AGENTLOG_UPSTREAM.json`
- Create: `runtime/clawd/UPSTREAM_AGENTLOG.md`
- Create: `test/agentlog/upstream-pin.test.cjs`

**Interfaces:**
- Consumes: Git and `tar` on Linux.
- Produces: A complete source snapshot at `runtime/clawd/` with `upstreamCommit === "45d388aa661824443cd96779ff0a5d277972bd10"` and upstream package version `0.13.0`.

- [ ] **Step 1: Write the failing upstream-pin test**

```js
// test/agentlog/upstream-pin.test.cjs
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(root, "runtime", "clawd");

test("the complete Clawd runtime is pinned to the approved commit", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, "AGENTLOG_UPSTREAM.json"), "utf8")
  );
  const upstreamPackage = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, "package.json"), "utf8")
  );

  assert.equal(
    manifest.upstreamCommit,
    "45d388aa661824443cd96779ff0a5d277972bd10"
  );
  assert.equal(manifest.upstreamRepository, "https://github.com/rullerzhou-afk/clawd-on-desk.git");
  assert.equal(upstreamPackage.version, "0.13.0");

  for (const relativePath of [
    "src/main.js",
    "src/state.js",
    "src/permission.js",
    "src/server.js",
    "agents/claude-code.js",
    "agents/codex.js",
    "agents/codex-log-monitor.js",
    "hooks/clawd-hook.js",
    "hooks/codex-install.js",
    "themes/clawd/theme.json",
    "test/run-tests.js",
  ]) {
    assert.equal(
      fs.existsSync(path.join(runtimeRoot, relativePath)),
      true,
      `missing pinned runtime file: ${relativePath}`
    );
  }
});
```

- [ ] **Step 2: Run the test and verify the missing runtime fails**

Run:

```bash
node --test test/agentlog/upstream-pin.test.cjs
```

Expected: FAIL with `ENOENT` for `runtime/clawd/AGENTLOG_UPSTREAM.json`.

- [ ] **Step 3: Add the reproducible import script**

```bash
#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="https://github.com/rullerzhou-afk/clawd-on-desk.git"
readonly COMMIT="45d388aa661824443cd96779ff0a5d277972bd10"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DESTINATION="${ROOT}/runtime/clawd"

if [[ -e "${DESTINATION}" ]]; then
  printf 'Refusing to overwrite existing runtime: %s\n' "${DESTINATION}" >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

git clone --filter=blob:none --no-checkout "${REPOSITORY}" "${temporary_directory}/source"
git -C "${temporary_directory}/source" fetch --depth 1 origin "${COMMIT}"
mkdir -p "${temporary_directory}/snapshot"
git -C "${temporary_directory}/source" archive "${COMMIT}" |
  tar -x -C "${temporary_directory}/snapshot"

mkdir -p "$(dirname "${DESTINATION}")"
mv "${temporary_directory}/snapshot" "${DESTINATION}"

printf '%s\n' \
  '{' \
  '  "upstreamRepository": "https://github.com/rullerzhou-afk/clawd-on-desk.git",' \
  '  "upstreamCommit": "45d388aa661824443cd96779ff0a5d277972bd10",' \
  '  "upstreamVersion": "0.13.0",' \
  '  "importedAt": "2026-07-28"' \
  '}' > "${DESTINATION}/AGENTLOG_UPSTREAM.json"
```

Make it executable and run it:

```bash
chmod +x scripts/import-clawd-runtime.sh
./scripts/import-clawd-runtime.sh
```

Expected: `runtime/clawd/src/main.js` and the manifest exist; no nested `.git` directory exists.

- [ ] **Step 4: Add the upstream maintenance note**

````markdown
# AgentLog Runtime Baseline

This directory is a source snapshot of:

- Repository: https://github.com/rullerzhou-afk/clawd-on-desk.git
- Commit: `45d388aa661824443cd96779ff0a5d277972bd10`
- Upstream version: `0.13.0`

AgentLog-specific code lives under `runtime/agentlog/`. Narrow integration
patches inside this snapshot are listed in the Phase 1 implementation plan.
Internal `clawd` protocol names and managed hook markers remain unchanged for
compatibility.

To compare this baseline with upstream:

```bash
git diff --no-index /path/to/clawd-on-desk runtime/clawd
```
````

- [ ] **Step 5: Run the pin test and an upstream baseline smoke suite**

Run:

```bash
node --test test/agentlog/upstream-pin.test.cjs
node --test \
  runtime/clawd/test/linux-ozone.test.js \
  runtime/clawd/test/agent-runtime-main.test.js \
  runtime/clawd/test/state.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the pinned baseline**

```bash
git add scripts/import-clawd-runtime.sh runtime/clawd test/agentlog/upstream-pin.test.cjs
git commit -m "chore: pin Clawd runtime baseline"
```

---

### Task 2: Make AgentLog Pet The Only Application Entry

**Files:**
- Create: `runtime/agentlog/brand.cjs`
- Create: `runtime/agentlog/main.cjs`
- Create: `test/agentlog/product-entry.test.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `electron-builder.yml`

**Interfaces:**
- Consumes: `runtime/clawd/src/main.js` from Task 1.
- Produces: `BRAND`, `rebrandText(value)`, `rebrandTree(value)`, and the sole Electron entry point `runtime/agentlog/main.cjs`.

- [ ] **Step 1: Write the failing product-entry test**

```js
// test/agentlog/product-entry.test.cjs
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productMain = fs.readFileSync(path.join(root, "runtime/agentlog/main.cjs"), "utf8");
const upstreamMain = fs.readFileSync(path.join(root, "runtime/clawd/src/main.js"), "utf8");

test("root package exposes one AgentLog Pet Electron application", () => {
  assert.equal(pkg.name, "agentlog-pet");
  assert.equal(pkg.productName, "AgentLog Pet");
  assert.equal(pkg.main, "runtime/agentlog/main.cjs");
  assert.equal(pkg.engines.node, ">=22.12.0");
  assert.equal(pkg.build.appId, "com.agentlog.pet");
  assert.equal(pkg.build.productName, "AgentLog Pet");
  assert.deepEqual(pkg.build.linux.target, [
    { target: "AppImage", arch: ["x64"] },
    { target: "deb", arch: ["x64"] },
  ]);
  assert.equal(
    pkg.build.publish[0].repo,
    "agentlog-pet"
  );
  assert.equal(pkg.dependencies["better-sqlite3"], undefined);
  assert.equal(fs.existsSync(path.join(root, "electron-builder.yml")), false);
});

test("legacy DevPulse main remains source-only and is not packaged as an entry", () => {
  assert.notEqual(pkg.main, "dist-electron/main.js");
  assert.equal(pkg.build.files.includes("dist-electron/**/*"), false);
});

test("the product wrapper delegates lifecycle ownership to one pinned runtime", () => {
  assert.ok(productMain.indexOf("app.setName") < productMain.indexOf("../clawd/src/main.js"));
  assert.doesNotMatch(productMain, /\bnew Tray\b|\bnew BrowserWindow\b/);
  assert.equal(
    (upstreamMain.match(/app\.requestSingleInstanceLock\(\)/g) || []).length,
    1
  );
});
```

- [ ] **Step 2: Run the product-entry test and verify the old identity fails**

Run:

```bash
node --test test/agentlog/product-entry.test.cjs
```

Expected: FAIL because `package.json` still names `devpulse-ai` and points at `dist-electron/main.js`.

- [ ] **Step 3: Add the canonical product contract**

```js
// runtime/agentlog/brand.cjs
"use strict";

const BRAND = Object.freeze({
  packageName: "agentlog-pet",
  productName: "AgentLog Pet",
  tagline: "Your Private AI Agent Work Journal",
  appId: "com.agentlog.pet",
  repositoryUrl: "https://github.com/Liujingze11/agentlog-pet",
  authorName: "Liujingze11",
  compatibilityProtocol: "clawd",
});

function rebrandText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("Clawd on Desk", BRAND.productName)
    .replace(/\bClawd\b/g, BRAND.productName);
}

function rebrandTree(value, seen = new WeakMap()) {
  if (typeof value === "string") return rebrandText(value);
  if (typeof value === "function") {
    return (...args) => rebrandText(value(...args));
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  const output = Array.isArray(value) ? [] : {};
  seen.set(value, output);
  for (const [key, child] of Object.entries(value)) {
    output[key] = rebrandTree(child, seen);
  }
  return output;
}

module.exports = { BRAND, rebrandText, rebrandTree };
```

- [ ] **Step 4: Add the single product bootstrap**

```js
// runtime/agentlog/main.cjs
"use strict";

const { app } = require("electron");
const { BRAND } = require("./brand.cjs");

app.setName(BRAND.productName);

require("../clawd/src/main.js");
```

The wrapper must not create a second tray, window owner, server, or process. The imported runtime continues to own `app.requestSingleInstanceLock()`, all Electron windows, integrations, and shutdown.

- [ ] **Step 5: Replace the root package identity and build configuration**

Set these root `package.json` fields and retain the existing React/Vite and `better-sqlite3` dependencies for Phase 2:

```json
{
  "name": "agentlog-pet",
  "productName": "AgentLog Pet",
  "version": "0.1.0",
  "description": "Your Private AI Agent Work Journal",
  "author": "Liujingze11",
  "main": "runtime/agentlog/main.cjs",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "start": "node runtime/clawd/scripts/ensure-sidecar-binaries.js && electron .",
    "dev": "CLAWD_SKIP_SIDECAR_FETCH=1 electron .",
    "fetch:sidecars": "node runtime/clawd/scripts/fetch-sidecar-binaries.js",
    "verify:sidecars": "node runtime/clawd/scripts/verify-sidecar-binaries.js",
    "test": "node --test test/agentlog/*.test.cjs",
    "test:upstream": "node runtime/clawd/test/run-tests.js",
    "test:phase1": "npm test && npm run test:upstream",
    "prebuild:linux": "node runtime/clawd/scripts/verify-sidecar-binaries.js build:linux",
    "build:linux": "electron-builder --linux",
    "smoke:linux": "node scripts/smoke-linux.cjs",
    "postinstall": "node runtime/clawd/scripts/verify-electron-install.js --context postinstall"
  },
  "build": {
    "appId": "com.agentlog.pet",
    "productName": "AgentLog Pet",
    "directories": {
      "output": "Linux",
      "buildResources": "runtime/clawd/build"
    },
    "protocols": [
      {
        "name": "AgentLog Pet Import Protocol",
        "schemes": ["clawd"]
      }
    ],
    "files": [
      "package.json",
      "runtime/agentlog/**/*",
      "runtime/clawd/package.json",
      "runtime/clawd/NOTICE.md",
      "runtime/clawd/AGENTLOG_UPSTREAM.json",
      "runtime/clawd/src/**/*",
      "runtime/clawd/assets/**/*",
      "runtime/clawd/hooks/**/*",
      "runtime/clawd/extensions/**/*",
      "runtime/clawd/agents/**/*",
      "runtime/clawd/themes/**/*",
      "runtime/clawd/pwa/**/*"
    ],
    "asarUnpack": [
      "runtime/clawd/assets/svg/**/*",
      "runtime/clawd/assets/accessories/**/*",
      "runtime/clawd/hooks/**/*",
      "runtime/clawd/extensions/**/*",
      "runtime/clawd/agents/**/*",
      "runtime/clawd/themes/**/*",
      "node_modules/jsonc-parser/**/*"
    ],
    "linux": {
      "maintainer": "Liujingze11",
      "icon": "runtime/clawd/assets/icons",
      "category": "Development",
      "artifactName": "AgentLog-Pet-${version}-${arch}.${ext}",
      "target": [
        { "target": "AppImage", "arch": ["x64"] },
        { "target": "deb", "arch": ["x64"] }
      ],
      "extraResources": [
        {
          "from": "runtime/clawd/bin/cc-connect-clawd/linux-${arch}",
          "to": "sidecars/cc-connect-clawd/linux-${arch}"
        }
      ]
    },
    "extraResources": [
      {
        "from": "runtime/clawd/assets/icon.png",
        "to": "icon.png"
      }
    ],
    "publish": [
      {
        "provider": "github",
        "owner": "Liujingze11",
        "repo": "agentlog-pet"
      }
    ]
  }
}
```

Keep the existing React/Vite development dependencies so the management UI
source remains buildable in Phase 2. Remove the unused Phase 1
`better-sqlite3` production dependency so electron-builder does not rebuild or
ship a native module that the selected main process never loads. Phase 2 adds
the Electron 41-compatible SQLite dependency together with its migrations.

Set production runtime dependency versions to the pinned runtime's known-good
floors:

```json
{
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.71.1",
    "electron-updater": "^6.8.3",
    "htmlparser2": "^12.0.0",
    "jsonc-parser": "^3.3.1",
    "koffi": "^2.15.2",
    "ws": "^8.21.0"
  },
  "devDependencies": {
    "electron": "^41.10.2",
    "electron-builder": "^26.8.1"
  }
}
```

Delete `electron-builder.yml`, then refresh the lockfile:

```bash
npm install
```

- [ ] **Step 6: Run the product tests and Electron verification**

Run:

```bash
node --test \
  test/agentlog/upstream-pin.test.cjs \
  test/agentlog/product-entry.test.cjs
npm exec electron -- --version
```

Expected: both tests PASS and Electron reports a `v41.x` version.

- [ ] **Step 7: Commit the application switch**

```bash
git add package.json package-lock.json runtime/agentlog electron-builder.yml test/agentlog
git commit -m "feat: make AgentLog Pet the desktop entry"
```

---

### Task 3: Rebrand Every User-Visible Runtime Surface

**Files:**
- Create: `runtime/agentlog/brand-renderer.js`
- Create: `test/agentlog/brand.test.cjs`
- Modify: `runtime/clawd/src/i18n.js`
- Modify: `runtime/clawd/src/settings-i18n.js`
- Modify: `runtime/clawd/src/settings.html`
- Modify: `runtime/clawd/src/index.html`
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/login-item.js`
- Modify: `runtime/clawd/src/settings-window-icon.js`
- Modify: `runtime/clawd/src/settings-tab-about.js`
- Modify: `runtime/clawd/src/settings-ipc.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/test/settings-window.test.js`
- Modify: `runtime/clawd/test/settings-ipc.test.js`

**Interfaces:**
- Consumes: `BRAND`, `rebrandText`, and `rebrandTree` from Task 2.
- Produces: Consistent `AgentLog Pet` naming in app metadata, tray tooltip, settings, onboarding, dashboard copy, autostart, and About.

- [ ] **Step 1: Write failing brand tests**

```js
// test/agentlog/brand.test.cjs
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { BRAND, rebrandText, rebrandTree } = require("../../runtime/agentlog/brand.cjs");

const root = path.resolve(__dirname, "../..");

test("brand helper replaces product copy without changing lowercase protocol markers", () => {
  assert.equal(BRAND.productName, "AgentLog Pet");
  assert.equal(rebrandText("Welcome to Clawd on Desk"), "Welcome to AgentLog Pet");
  assert.equal(rebrandText("Restart Clawd"), "Restart AgentLog Pet");
  assert.equal(rebrandText("clawd://import"), "clawd://import");
  const tree = rebrandTree({ title: "Clawd Settings", fn: () => "Wake Clawd" });
  assert.equal(tree.title, "AgentLog Pet Settings");
  assert.equal(tree.fn(), "Wake AgentLog Pet");
});

test("primary visible shells contain the AgentLog product name", () => {
  const visibleFiles = [
    "runtime/clawd/src/index.html",
    "runtime/clawd/src/settings.html",
    "runtime/clawd/src/settings-window-icon.js",
    "runtime/clawd/src/settings-tab-about.js",
    "runtime/clawd/src/menu.js",
    "runtime/clawd/src/login-item.js",
  ];

  for (const relativePath of visibleFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(source, /AgentLog Pet/, relativePath);
    assert.doesNotMatch(source, /Clawd on Desk|Clawd Settings|Clawd Desktop Pet/, relativePath);
  }
});

test("translated application copy is branded at runtime", () => {
  const { i18n } = require("../../runtime/clawd/src/i18n.js");
  assert.equal(i18n.en.tutorialWelcomeTitle, "Welcome to AgentLog Pet");
  assert.equal(i18n.en.settingsWindowTitle, "AgentLog Pet Settings");
  assert.equal(i18n.zh.tutorialWelcomeTitle, "欢迎使用 AgentLog Pet");
});
```

- [ ] **Step 2: Run the tests and verify visible Clawd copy fails**

Run:

```bash
node --test test/agentlog/brand.test.cjs
```

Expected: FAIL on untranslated `Clawd` product copy.

- [ ] **Step 3: Add the sandbox-safe renderer brand helper**

```js
// runtime/agentlog/brand-renderer.js
"use strict";

(function installAgentLogBrand(root) {
  function rebrandText(value) {
    if (typeof value !== "string") return value;
    return value
      .replaceAll("Clawd on Desk", "AgentLog Pet")
      .replace(/\bClawd\b/g, "AgentLog Pet");
  }

  function rebrandTree(value, seen = new WeakMap()) {
    if (typeof value === "string") return rebrandText(value);
    if (typeof value === "function") return (...args) => rebrandText(value(...args));
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const output = Array.isArray(value) ? [] : {};
    seen.set(value, output);
    for (const [key, child] of Object.entries(value)) {
      output[key] = rebrandTree(child, seen);
    }
    return output;
  }

  root.AgentLogBrand = Object.freeze({
    productName: "AgentLog Pet",
    tagline: "Your Private AI Agent Work Journal",
    rebrandText,
    rebrandTree,
  });
})(globalThis);
```

- [ ] **Step 4: Apply branding to both translation dictionaries**

In `runtime/clawd/src/i18n.js`, export a branded copy:

```js
const { rebrandTree } = require("../../agentlog/brand.cjs");
const brandedI18n = rebrandTree(i18n);

module.exports = {
  i18n: brandedI18n,
  SUPPORTED_LANGS,
  createTranslator(getLang) {
    if (typeof getLang !== "function") {
      throw new TypeError("createTranslator(getLang): getLang must be a function");
    }
    return function t(key) {
      const lang = getLang();
      const dict = brandedI18n[lang] || brandedI18n.en;
      return dict[key] || key;
    };
  },
};
```

In `runtime/clawd/src/settings.html`, load the product helper before `settings-i18n.js`:

```html
<script src="../../agentlog/brand-renderer.js"></script>
<script src="settings-i18n.js"></script>
```

At the end of `runtime/clawd/src/settings-i18n.js`, publish the branded tree:

```js
const brandedStrings = root.AgentLogBrand.rebrandTree(STRINGS);
root.ClawdSettingsI18n = {
  STRINGS: brandedStrings,
  MAINTAINERS: ["Liujingze11"],
  CONTRIBUTORS: [],
};
```

- [ ] **Step 5: Replace hardcoded product-shell copy**

Use these exact values:

```js
// runtime/clawd/src/settings-window-icon.js
const WINDOWS_APP_USER_MODEL_ID = "com.agentlog.pet";
const SETTINGS_WINDOW_TITLE = "AgentLog Pet Settings";

// runtime/clawd/src/menu.js, inside createTray()
ctx.tray.setToolTip("AgentLog Pet");

// runtime/clawd/src/login-item.js, Linux desktop entry lines
"Name=AgentLog Pet"

// runtime/clawd/src/settings-tab-about.js
crabWrap.title = "AgentLog Pet";
title.textContent = "AgentLog Pet";
```

Use these document titles:

```html
<!-- runtime/clawd/src/index.html -->
<title>AgentLog Pet</title>

<!-- runtime/clawd/src/settings.html -->
<title>AgentLog Pet Settings</title>
```

Pass the product contract to settings IPC from `runtime/clawd/src/main.js`:

```js
const { BRAND } = require("../../agentlog/brand.cjs");

registerSettingsIpc({
  // existing dependencies remain
  getProductInfo: () => ({
    repoUrl: BRAND.repositoryUrl,
    authorName: BRAND.authorName,
    authorUrl: "https://github.com/Liujingze11",
    copyright: "\u00a9 2026 Liujingze11",
  }),
});
```

Read it in `runtime/clawd/src/settings-ipc.js`:

```js
const getProductInfo = options.getProductInfo || (() => ({}));

handle("settings:get-about-info", () => {
  const product = getProductInfo();
  // Preserve the existing hero, update, and auto-update fields.
  return {
    version: app.getVersion(),
    repoUrl: product.repoUrl || "",
    license: "",
    copyright: product.copyright || "",
    authorName: product.authorName || "",
    authorUrl: product.authorUrl || "",
    heroSvgContent,
    pendingUpdateVersion,
    autoUpdateCheck,
  };
});
```

- [ ] **Step 6: Update affected upstream expectations**

Change the settings window assertion:

```js
assert.strictEqual(win.options.title, "AgentLog Pet Settings");
```

Pass this product fixture to `registerSettingsIpc()` in the About-info test:

```js
getProductInfo: () => ({
  repoUrl: "https://github.com/Liujingze11/agentlog-pet",
  authorName: "Liujingze11",
  authorUrl: "https://github.com/Liujingze11",
  copyright: "\u00a9 2026 Liujingze11",
}),
```

Assert the resulting product fields:

```js
repoUrl: "https://github.com/Liujingze11/agentlog-pet",
license: "",
copyright: "\u00a9 2026 Liujingze11",
authorName: "Liujingze11",
authorUrl: "https://github.com/Liujingze11",
```

Only update tests that assert user-visible product copy. Keep path fixtures such as `C:\Program Files\Clawd on Desk\...`, `~/.clawd`, `CLAWD_*`, and `clawd://` unchanged because they verify compatibility behavior.

- [ ] **Step 7: Run branding and affected upstream tests**

Run:

```bash
node --test \
  test/agentlog/brand.test.cjs \
  runtime/clawd/test/settings-window.test.js \
  runtime/clawd/test/settings-ipc.test.js \
  runtime/clawd/test/tutorial.test.js \
  runtime/clawd/test/menu-autostart.test.js
```

Expected: all tests PASS.

- [ ] **Step 8: Commit user-visible branding**

```bash
git add runtime/agentlog runtime/clawd/src runtime/clawd/test test/agentlog
git commit -m "feat: apply AgentLog Pet product identity"
```

---

### Task 4: Add The Versioned Normalized Agent Event Stream

**Files:**
- Create: `runtime/agentlog/events/normalized-event.cjs`
- Create: `runtime/agentlog/events/event-stream.cjs`
- Create: `test/agentlog/normalized-event.test.cjs`
- Create: `test/agentlog/event-stream.test.cjs`

**Interfaces:**
- Consumes: Raw `{ sessionId, state, event, opts }` updates from the Clawd session coordinator.
- Produces: `normalizeAgentEvent(input, context) -> NormalizedAgentEvent` and `createAgentEventStream(options) -> { publish, subscribe, getSnapshot, getStats, clear }`.

`NormalizedAgentEvent` has this Phase 1 shape:

```ts
type NormalizedAgentEvent = {
  schemaVersion: 1;
  id: string;
  sourceEventId: string | null;
  sourceSequence: number | null;
  agentId: string;
  sessionId: string;
  rawSessionId: string;
  parentSessionId: string | null;
  occurredAt: number;
  receivedAt: number;
  cwd: string | null;
  type: string;
  category:
    | "session_started"
    | "turn_started"
    | "tool_activity"
    | "permission_requested"
    | "completed"
    | "errored"
    | "session_ended"
    | "state_changed";
  state: string;
  toolName: string | null;
  transcriptPath: string | null;
  permission: {
    action: string | null;
    command: string | null;
    gateId: string | null;
  } | null;
  payload: {
    sessionTitle: string | null;
    model: string | null;
    provider: string | null;
    hookSource: string | null;
    assistantLastOutput: string | null;
  };
};
```

- [ ] **Step 1: Write failing normalization tests**

```js
// test/agentlog/normalized-event.test.cjs
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeAgentEvent,
} = require("../../runtime/agentlog/events/normalized-event.cjs");

test("normalizes a Codex permission event", () => {
  const event = normalizeAgentEvent({
    sessionId: "local:codex-42",
    state: "notification",
    event: "CodexUserInputRequest",
    opts: {
      agentId: "codex",
      rawSessionId: "codex-42",
      cwd: "/work/repo",
      toolName: "exec_command",
      permissionAction: "ask",
      permissionCommand: "npm test",
      permissionGateId: "gate-1",
      hookSource: "codex-official",
      sourceEventId: "codex-event-9",
      timestamp: 1_800_000_000_000,
    },
  }, { now: () => 1_800_000_000_500, sequence: 7 });

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.agentId, "codex");
  assert.equal(event.sessionId, "local:codex-42");
  assert.equal(event.rawSessionId, "codex-42");
  assert.equal(event.category, "permission_requested");
  assert.equal(event.occurredAt, 1_800_000_000_000);
  assert.equal(event.receivedAt, 1_800_000_000_500);
  assert.deepEqual(event.permission, {
    action: "ask",
    command: "npm test",
    gateId: "gate-1",
  });
});

test("uses a deterministic id when the source supplies an event id", () => {
  const input = {
    sessionId: "claude-session",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", sourceEventId: "hook-17" },
  };
  const a = normalizeAgentEvent(input, { now: () => 100, sequence: 1 });
  const b = normalizeAgentEvent(input, { now: () => 900, sequence: 99 });
  assert.equal(a.id, b.id);
});

test("bounds assistant output while preserving the original event", () => {
  const event = normalizeAgentEvent({
    sessionId: "s1",
    state: "idle",
    event: "Stop",
    opts: { agentId: "claude-code", assistantLastOutput: "x".repeat(20_000) },
  }, { now: () => 100, sequence: 1 });
  assert.equal(event.payload.assistantLastOutput.length, 16_384);
  assert.equal(event.category, "completed");
});
```

- [ ] **Step 2: Write failing stream tests**

```js
// test/agentlog/event-stream.test.cjs
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAgentEventStream,
} = require("../../runtime/agentlog/events/event-stream.cjs");

test("publishes in order and keeps only the configured recent events", () => {
  let now = 100;
  const stream = createAgentEventStream({ capacity: 2, now: () => now++ });
  const seen = [];
  stream.subscribe((event) => seen.push(event.type));

  stream.publish({ sessionId: "s", state: "working", event: "UserPromptSubmit", opts: { agentId: "claude-code" } });
  stream.publish({ sessionId: "s", state: "working", event: "PreToolUse", opts: { agentId: "claude-code" } });
  stream.publish({ sessionId: "s", state: "idle", event: "Stop", opts: { agentId: "claude-code" } });

  assert.deepEqual(seen, ["UserPromptSubmit", "PreToolUse", "Stop"]);
  assert.deepEqual(stream.getSnapshot().map((event) => event.type), ["PreToolUse", "Stop"]);
  assert.equal(stream.getStats().published, 3);
});

test("subscriber failures never block other subscribers", () => {
  const stream = createAgentEventStream({ onError: () => {} });
  let delivered = 0;
  stream.subscribe(() => { throw new Error("consumer failed"); });
  stream.subscribe(() => { delivered += 1; });

  const event = stream.publish({
    sessionId: "codex-s",
    state: "thinking",
    event: "UserPromptSubmit",
    opts: { agentId: "codex" },
  });

  assert.ok(event);
  assert.equal(delivered, 1);
  assert.equal(stream.getStats().subscriberErrors, 1);
});

test("deduplicates retries with the same source event identity", () => {
  const stream = createAgentEventStream();
  const input = {
    sessionId: "claude-s",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", sourceEventId: "hook-event-21" },
  };

  assert.ok(stream.publish(input));
  assert.equal(stream.publish(input), null);
  assert.equal(stream.getSnapshot().length, 1);
  assert.equal(stream.getStats().duplicates, 1);
});
```

- [ ] **Step 3: Run both tests and verify missing modules fail**

Run:

```bash
node --test \
  test/agentlog/normalized-event.test.cjs \
  test/agentlog/event-stream.test.cjs
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement normalization**

Implement `runtime/agentlog/events/normalized-event.cjs` with:

```js
"use strict";

const { createHash } = require("node:crypto");

const MAX_TEXT_LENGTH = 16_384;
const PERMISSION_EVENTS = new Set([
  "PermissionRequest",
  "CodexUserInputRequest",
  "Elicitation",
]);

function text(value, max = MAX_TEXT_LENGTH) {
  if (value == null) return null;
  const normalized = String(value);
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function epoch(value) {
  if (Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function categoryFor(event, state) {
  if (PERMISSION_EVENTS.has(event)) return "permission_requested";
  if (event === "SessionStart") return "session_started";
  if (event === "SessionEnd") return "session_ended";
  if (event === "UserPromptSubmit") return "turn_started";
  if (event === "Stop" || state === "attention") return "completed";
  if (state === "error" || /error|fail/i.test(event || "")) return "errored";
  if (/tool|command|patch|exec/i.test(event || "")) return "tool_activity";
  return "state_changed";
}

function hashId(parts) {
  return `evt_${createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24)}`;
}

function normalizeAgentEvent(input, context = {}) {
  if (!input || typeof input !== "object") throw new TypeError("agent event input must be an object");
  const opts = input.opts && typeof input.opts === "object" ? input.opts : {};
  const sessionId = text(input.sessionId, 512);
  if (!sessionId) throw new TypeError("agent event sessionId is required");

  const now = typeof context.now === "function" ? context.now : Date.now;
  const receivedAt = Math.trunc(now());
  const sourceEventId = text(opts.sourceEventId, 512);
  const sourceSequence = Number.isSafeInteger(opts.sourceSequence) ? opts.sourceSequence : null;
  const agentId = text(opts.agentId, 128) || "unknown";
  const type = text(input.event, 256) || "StateChanged";
  const state = text(input.state, 128) || "idle";
  const occurredAt = epoch(opts.timestamp) || receivedAt;
  const generatedSequence = Number.isSafeInteger(context.sequence) ? context.sequence : 0;
  const idSeed = sourceEventId
    ? [agentId, sessionId, sourceEventId]
    : sourceSequence != null
      ? [agentId, sessionId, String(sourceSequence)]
      : [agentId, sessionId, type, String(occurredAt), String(generatedSequence)];
  const hasPermission = PERMISSION_EVENTS.has(type)
    || opts.permissionAction != null
    || opts.permissionCommand != null
    || opts.permissionGateId != null;

  return Object.freeze({
    schemaVersion: 1,
    id: hashId(idSeed),
    sourceEventId,
    sourceSequence,
    agentId,
    sessionId,
    rawSessionId: text(opts.rawSessionId, 512) || sessionId,
    parentSessionId: text(opts.parentSessionId, 512),
    occurredAt,
    receivedAt,
    cwd: text(opts.cwd, 4096),
    type,
    category: categoryFor(type, state),
    state,
    toolName: text(opts.toolName, 512),
    transcriptPath: text(opts.transcriptPath, 4096),
    permission: hasPermission ? Object.freeze({
      action: text(opts.permissionAction, 512),
      command: text(opts.permissionCommand, 4096),
      gateId: text(opts.permissionGateId, 512),
    }) : null,
    payload: Object.freeze({
      sessionTitle: text(opts.sessionTitle, 1024),
      model: text(opts.model, 256),
      provider: text(opts.provider, 256),
      hookSource: text(opts.hookSource, 256),
      assistantLastOutput: text(opts.assistantLastOutput),
    }),
  });
}

module.exports = {
  MAX_TEXT_LENGTH,
  normalizeAgentEvent,
};
```

- [ ] **Step 5: Implement the bounded stream**

Implement `runtime/agentlog/events/event-stream.cjs`:

```js
"use strict";

const { normalizeAgentEvent } = require("./normalized-event.cjs");

function createAgentEventStream(options = {}) {
  const capacity = Number.isSafeInteger(options.capacity) && options.capacity > 0
    ? options.capacity
    : 500;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const onError = typeof options.onError === "function" ? options.onError : console.warn;
  const subscribers = new Set();
  const recent = [];
  const seenIds = new Set();
  let sequence = 0;
  const stats = {
    received: 0,
    published: 0,
    duplicates: 0,
    dropped: 0,
    subscriberErrors: 0,
    lastEventAt: null,
    lastEventId: null,
  };

  function publish(input) {
    stats.received += 1;
    let event;
    try {
      event = normalizeAgentEvent(input, { now, sequence: ++sequence });
    } catch (error) {
      stats.dropped += 1;
      try { onError("AgentLog event normalization failed", error); } catch {}
      return null;
    }

    if (seenIds.has(event.id)) {
      stats.duplicates += 1;
      return null;
    }

    seenIds.add(event.id);
    recent.push(event);
    if (recent.length > capacity) {
      const removed = recent.splice(0, recent.length - capacity);
      for (const oldEvent of removed) seenIds.delete(oldEvent.id);
    }
    stats.published += 1;
    stats.lastEventAt = event.receivedAt;
    stats.lastEventId = event.id;

    for (const subscriber of subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        stats.subscriberErrors += 1;
        try { onError("AgentLog event subscriber failed", error); } catch {}
      }
    }
    return event;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") throw new TypeError("subscriber must be a function");
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return Object.freeze({
    publish,
    subscribe,
    getSnapshot: () => recent.slice(),
    getStats: () => ({ ...stats, subscribers: subscribers.size, capacity }),
    clear: () => {
      recent.length = 0;
      seenIds.clear();
    },
  });
}

module.exports = { createAgentEventStream };
```

- [ ] **Step 6: Run the event tests**

Run:

```bash
node --test \
  test/agentlog/normalized-event.test.cjs \
  test/agentlog/event-stream.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the event foundation**

```bash
git add runtime/agentlog/events test/agentlog
git commit -m "feat: add normalized agent event stream"
```

---

### Task 5: Tap The Existing Session Coordinator Without Changing Pet Logic

**Files:**
- Create: `runtime/agentlog/runtime-bridge.cjs`
- Modify: `runtime/clawd/src/state.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/test/state.test.js`
- Create: `test/agentlog/runtime-bridge.test.cjs`

**Interfaces:**
- Consumes: `createAgentEventStream()` from Task 4 and Clawd's existing `updateSession(sessionId, state, event, opts)` calls.
- Produces: `publishUpstreamEvent(input)`, `subscribeToAgentEvents(listener)`, `getRecentAgentEvents()`, and `getAgentEventStats()`.

- [ ] **Step 1: Write the failing bridge test**

```js
// test/agentlog/runtime-bridge.test.cjs
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bridge = require("../../runtime/agentlog/runtime-bridge.cjs");

test("the process bridge publishes Codex and Claude events", () => {
  bridge.clearRecentAgentEvents();
  const seen = [];
  const unsubscribe = bridge.subscribeToAgentEvents((event) => seen.push(event));

  bridge.publishUpstreamEvent({
    sessionId: "codex-1",
    state: "thinking",
    event: "UserPromptSubmit",
    opts: { agentId: "codex", cwd: "/repo/a" },
  });
  bridge.publishUpstreamEvent({
    sessionId: "claude-1",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", cwd: "/repo/b" },
  });
  unsubscribe();

  assert.deepEqual(seen.map((event) => event.agentId), ["codex", "claude-code"]);
  assert.equal(bridge.getAgentEventStats().published, 2);
});
```

- [ ] **Step 2: Add failing state-observer tests**

Add to `runtime/clawd/test/state.test.js` using its existing `makeCtx()` helper:

```js
describe("AgentLog event observer", () => {
  let api;

  afterEach(() => { if (api) api.cleanup(); });

  it("receives the original session update bag", () => {
    const observed = [];
    api = require("../src/state")(makeCtx({
      onAgentEvent: (input) => observed.push(input),
    }));

    api.updateSession("codex-1", "working", "PreToolUse", {
      agentId: "codex",
      cwd: "/work/repo",
      toolName: "exec_command",
    });

    assert.strictEqual(observed.length, 1);
    assert.strictEqual(observed[0].sessionId, "codex-1");
    assert.strictEqual(observed[0].opts.agentId, "codex");
    assert.strictEqual(api.sessions.get("codex-1").state, "working");
  });

  it("continues normal session updates when the observer throws", () => {
    api = require("../src/state")(makeCtx({
      onAgentEvent: () => { throw new Error("observer failed"); },
    }));

    assert.doesNotThrow(() => {
      api.updateSession("claude-1", "thinking", "UserPromptSubmit", {
        agentId: "claude-code",
        cwd: "/work/repo",
      });
    });
    assert.strictEqual(api.sessions.get("claude-1").agentId, "claude-code");
  });
});
```

- [ ] **Step 3: Run both tests and verify the bridge is missing**

Run:

```bash
node --test \
  test/agentlog/runtime-bridge.test.cjs \
  runtime/clawd/test/state.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND` for the bridge and zero observed events in the state test.

- [ ] **Step 4: Implement the process-wide bridge**

```js
// runtime/agentlog/runtime-bridge.cjs
"use strict";

const { createAgentEventStream } = require("./events/event-stream.cjs");

const stream = createAgentEventStream({
  capacity: 500,
  onError: (message, error) => {
    console.warn(`${message}:`, error && error.message ? error.message : error);
  },
});

function publishUpstreamEvent(input) {
  return stream.publish(input);
}

module.exports = Object.freeze({
  publishUpstreamEvent,
  subscribeToAgentEvents: (listener) => stream.subscribe(listener),
  getRecentAgentEvents: () => stream.getSnapshot(),
  getAgentEventStats: () => stream.getStats(),
  clearRecentAgentEvents: () => stream.clear(),
});
```

- [ ] **Step 5: Emit from the coordinator with local failure isolation**

At the beginning of `updateSession()` in `runtime/clawd/src/state.js`, inside its existing outer `try` and before any early return:

```js
if (typeof ctx.onAgentEvent === "function") {
  try {
    ctx.onAgentEvent({ sessionId, state, event, opts });
  } catch (error) {
    if (typeof ctx.debugLog === "function") {
      ctx.debugLog(`agentlog-event-observer failed: ${error && error.message ? error.message : error}`);
    }
  }
}
```

Do not move, replace, or wrap the remaining Clawd state transitions.

- [ ] **Step 6: Wire the bridge in the main-process state context**

Near the other top-level imports in `runtime/clawd/src/main.js`:

```js
const agentLogRuntime = require("../../agentlog/runtime-bridge.cjs");
```

In `_stateCtx`:

```js
onAgentEvent: (input) => agentLogRuntime.publishUpstreamEvent(input),
```

This one callback covers HTTP hooks, official Codex hooks, Codex JSONL fallback, permission events, remote sessions, and future adapters because each path already converges on `updateSession()`.

- [ ] **Step 7: Run bridge and integration-path tests**

Run:

```bash
node --test \
  test/agentlog/runtime-bridge.test.cjs \
  runtime/clawd/test/state.test.js \
  runtime/clawd/test/agent-runtime-main.test.js \
  runtime/clawd/test/server-route-state.test.js \
  runtime/clawd/test/codex-log-monitor.test.js \
  runtime/clawd/test/codex-hook.test.js \
  runtime/clawd/test/claude-hook-health.test.js \
  runtime/clawd/test/permission-family-roundtrip.test.js
```

Expected: all tests PASS.

- [ ] **Step 8: Commit the coordinator bridge**

```bash
git add runtime/agentlog/runtime-bridge.cjs runtime/clawd/src runtime/clawd/test test/agentlog
git commit -m "feat: bridge live agent events into AgentLog"
```

---

### Task 6: Expose The Existing Agent Manager As A First-Class View

**Files:**
- Modify: `runtime/clawd/src/settings-window.js`
- Modify: `runtime/clawd/src/preload-settings.js`
- Modify: `runtime/clawd/src/settings-renderer.js`
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/src/i18n.js`
- Modify: `runtime/clawd/test/settings-window.test.js`
- Modify: `runtime/clawd/test/menu-display.test.js`
- Modify: `runtime/clawd/test/agents.test.js`

**Interfaces:**
- Consumes: Existing Clawd Agents settings tab, detection, install, repair, uninstall, permission-mode, Codex monitor, and Claude hook health actions.
- Produces: `settingsWindowRuntime.open({ tab?: string })` and direct `Agent Integrations` commands in the tray and pet context menu.

- [ ] **Step 1: Add failing settings-window tab-selection tests**

Change the fake `webContents.send` in
`runtime/clawd/test/settings-window.test.js` so the test can inspect IPC:

```js
this.webContents = {
  isDestroyed: () => false,
  onceCallbacks: new Map(),
  sent: [],
  once: (event, cb) => this.webContents.onceCallbacks.set(event, cb),
  send: (...args) => this.webContents.sent.push(args),
};
```

Add a test that opens the settings runtime with:

```js
runtime.open({ tab: "agents" });
```

After the fake window's `did-finish-load`, assert:

```js
assert.deepEqual(
  win.webContents.sent.at(-1),
  ["settings:select-tab", "agents"]
);
```

Open the existing window again with `{ tab: "agents" }` and assert it is focused and receives the same IPC message without creating a second settings window.

- [ ] **Step 2: Add a failing menu test**

In `runtime/clawd/test/menu-display.test.js`, provide:

```js
let openedTab = null;
const ctx = buildBaseCtx({
  openSettingsTab: (tab) => { openedTab = tab; },
});
```

Find the menu item whose label is `Agent Integrations`, call its `click()`, and assert:

```js
assert.equal(openedTab, "agents");
```

- [ ] **Step 3: Run the focused tests and verify selection is unsupported**

Run:

```bash
node --test \
  runtime/clawd/test/settings-window.test.js \
  runtime/clawd/test/menu-display.test.js
```

Expected: FAIL because `open()` ignores options and the menu has no direct Agents command.

- [ ] **Step 4: Add safe tab selection to the settings window**

In `runtime/clawd/src/settings-window.js`:

```js
const SETTINGS_TABS = new Set([
  "general",
  "agents",
  "theme",
  "animOverrides",
  "shortcuts",
  "telegram-approval",
  "discord-presence",
  "remote-ssh",
  "about",
]);

let pendingTab = null;

function rememberRequestedTab(tab) {
  if (!SETTINGS_TABS.has(tab)) return false;
  pendingTab = tab;
  return true;
}

function sendRequestedTab(win) {
  if (!pendingTab) return false;
  const webContents = win && win.webContents;
  if (webContents && typeof webContents.send === "function") {
    webContents.send("settings:select-tab", pendingTab);
    pendingTab = null;
    return true;
  }
  return false;
}
```

Change `open()` to `open(openOptions = {})` and call `rememberRequestedTab(openOptions.tab)` first. If the window already exists, call `sendRequestedTab(settingsWindow)` before focusing it. In `did-finish-load`, call `sendRequestedTab(createdWindow)` after applying the title and zoom. Clear `pendingTab` in the existing window `closed` handler.

- [ ] **Step 5: Carry the selection through the sandboxed preload**

In `runtime/clawd/src/preload-settings.js`:

```js
const selectTabListeners = new Set();

ipcRenderer.on("settings:select-tab", (_event, tab) => {
  for (const listener of selectTabListeners) {
    try { listener(tab); } catch (error) {
      console.warn("settings tab listener threw:", error);
    }
  }
});
```

Expose:

```js
onSelectTab: (listener) => {
  if (typeof listener !== "function") return () => {};
  selectTabListeners.add(listener);
  return () => selectTabListeners.delete(listener);
},
```

In `runtime/clawd/src/settings-renderer.js`:

```js
if (window.settingsAPI && typeof window.settingsAPI.onSelectTab === "function") {
  window.settingsAPI.onSelectTab((tab) => {
    if (core.tabs[tab]) core.ops.selectTab(tab);
  });
}
```

- [ ] **Step 6: Add direct Agent Integrations menu actions**

Add these exact keys to the five runtime dictionaries:

```js
// en
openAgentIntegrations: "Agent Integrations",

// zh
openAgentIntegrations: "Agent 集成",

// zh-TW
openAgentIntegrations: "Agent 整合",

// ko
openAgentIntegrations: "Agent 연동",

// ja
openAgentIntegrations: "Agent 連携",
```

Add this item to both tray and pet context menu application groups:

```js
{
  label: t("openAgentIntegrations"),
  click: () => ctx.openSettingsTab("agents"),
},
```

Wire it in `runtime/clawd/src/main.js`:

```js
openSettingsTab: (tab) => settingsWindowRuntime.open({ tab }),
openSettingsWindow: () => settingsWindowRuntime.open(),
```

Change tutorial's existing Agents link to:

```js
openSettingsTab: () => settingsWindowRuntime.open({ tab: "agents" }),
```

- [ ] **Step 7: Assert Codex and Claude remain first-class integrations**

Extend `runtime/clawd/test/agents.test.js`:

```js
const codex = registry.getAgent("codex");
const claude = registry.getAgent("claude-code");

assert.equal(codex.id, "codex");
assert.equal(codex.eventSource, "hook+log-poll");
assert.equal(codex.capabilities.permissionApproval, true);
assert.equal(claude.id, "claude-code");
assert.equal(claude.eventSource, "hook");
assert.equal(claude.capabilities.permissionApproval, true);
assert.equal(claude.capabilities.subagent, true);
```

Keep every other pinned upstream agent descriptor in the registry. Phase 1 acceptance focuses on Codex and Claude, while the imported runtime remains capable of the broader upstream set.

- [ ] **Step 8: Run the Agent manager tests**

Run:

```bash
node --test \
  runtime/clawd/test/settings-window.test.js \
  runtime/clawd/test/menu-display.test.js \
  runtime/clawd/test/agents.test.js \
  runtime/clawd/test/agent-installation-detector.test.js \
  runtime/clawd/test/codex-install.test.js \
  runtime/clawd/test/claude-hook-operations.test.js
```

Expected: all tests PASS.

- [ ] **Step 9: Commit the Agent manager entry points**

```bash
git add runtime/clawd/src runtime/clawd/test
git commit -m "feat: expose Agent integrations manager"
```

---

### Task 7: Verify Linux Single-App Launch And Produce Installers

**Files:**
- Create: `scripts/smoke-linux.cjs`
- Modify: `runtime/agentlog/main.cjs`
- Modify: `README.md`
- Create: `docs/verification/2026-07-28-agentlog-pet-phase-1-linux.md`

**Interfaces:**
- Consumes: The product bootstrap, pinned runtime, root package scripts, and Linux display supplied by the current session or `xvfb-run`.
- Produces: Automated launch evidence for one app instance and packaged `AgentLog-Pet-0.1.0-x64.AppImage` and `AgentLog-Pet-0.1.0-x64.deb`.

- [ ] **Step 1: Add a smoke-only readiness probe to the product bootstrap**

After requiring the Clawd main module in `runtime/agentlog/main.cjs`, add:

```js
if (process.env.AGENTLOG_SMOKE_MODE === "1") {
  const { BrowserWindow } = require("electron");
  app.whenReady().then(() => {
    const timer = setTimeout(() => {
      const payload = {
        productName: app.getName(),
        windowCount: BrowserWindow.getAllWindows().length,
        pid: process.pid,
      };
      process.stdout.write(`AGENTLOG_SMOKE_READY ${JSON.stringify(payload)}\n`);
    }, 1500);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
}
```

This probe is inert unless `AGENTLOG_SMOKE_MODE=1`.

- [ ] **Step 2: Write the Linux smoke runner**

Implement `scripts/smoke-linux.cjs` with these behaviors:

```js
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagedBinary = process.argv[2] ? path.resolve(process.argv[2]) : null;
const executable = packagedBinary || require("electron");
const appArgs = packagedBinary
  ? ["--ozone-platform=x11"]
  : ["--ozone-platform=x11", root];
const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-pet-smoke-"));
const env = {
  ...process.env,
  HOME: isolatedHome,
  XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
  CLAWD_SKIP_SIDECAR_FETCH: "1",
  CLAWD_OZONE_PLATFORM: "x11",
  AGENTLOG_SMOKE_MODE: "1",
};

function waitForReady(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`readiness timeout:\n${output}`)), timeoutMs);
    const inspect = (chunk) => {
      output += chunk.toString();
      const line = output.split(/\r?\n/).find((entry) => entry.startsWith("AGENTLOG_SMOKE_READY "));
      if (!line) return;
      clearTimeout(timeout);
      resolve(JSON.parse(line.slice("AGENTLOG_SMOKE_READY ".length)));
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`application exited before ready with code ${code}:\n${output}`));
    });
  });
}

function waitForExit(child, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("second instance did not exit")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

(async () => {
  let first;
  try {
    first = spawn(executable, appArgs, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const ready = await waitForReady(first);
    assert.equal(ready.productName, "AgentLog Pet");
    assert.ok(ready.windowCount >= 1, "pet runtime must create at least one window");

    const second = spawn(executable, appArgs, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(await waitForExit(second), 0);

    process.stdout.write(`${JSON.stringify({ status: "ok", ...ready })}\n`);
  } finally {
    if (first && first.exitCode == null) first.kill("SIGTERM");
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the development smoke test**

If the current graphical session has `DISPLAY`:

```bash
npm run smoke:linux
```

Otherwise:

```bash
xvfb-run -a npm run smoke:linux
```

Expected: one JSON line with `"status":"ok"`, `"productName":"AgentLog Pet"`, and `windowCount` of at least 1. The second launch exits with code 0 because the first process owns the single-instance lock.

- [ ] **Step 4: Run the full regression suite**

Run:

```bash
npm run test:phase1
```

Expected: all AgentLog tests and all pinned upstream tests PASS. Fix product-patch regressions before packaging; do not weaken upstream tests that cover pet state priority, permissions, startup recovery, liveness, multi-session behavior, Linux XWayland handling, or integration repair.

- [ ] **Step 5: Fetch the pinned Linux sidecar and build both packages**

Run:

```bash
npm run fetch:sidecars -- --target linux-x64
npm run verify:sidecars -- build:linux
npm run build:linux
```

Expected artifacts:

```text
Linux/AgentLog-Pet-0.1.0-x64.AppImage
Linux/AgentLog-Pet-0.1.0-x64.deb
```

- [ ] **Step 6: Smoke-test the packaged AppImage**

Run in the current graphical session:

```bash
chmod +x Linux/AgentLog-Pet-0.1.0-x64.AppImage
npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
```

Or under Xvfb:

```bash
xvfb-run -a npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
```

Expected: the same successful JSON payload as the development smoke run.

- [ ] **Step 7: Perform the Linux visual and interaction acceptance pass**

Launch the AppImage normally and verify all of these behaviors:

```text
PASS: The first visible product is the desktop pet, not the old DevPulse timer pet.
PASS: Only one AgentLog Pet tray icon appears.
PASS: A second launch focuses or reveals the existing application and does not create another tray.
PASS: The pet can be dragged under X11/XWayland and remains correctly framed.
PASS: Tray > Agent Integrations opens Settings directly on Agents.
PASS: Codex and Claude Code rows expose detect/install/repair/remove diagnostics.
PASS: A live Codex turn changes the pet through thinking, tool activity, permission or input waiting, and completion.
PASS: A live Claude Code turn changes the same pet through thinking, tool activity, permission waiting, and completion.
PASS: Concurrent Codex and Claude sessions appear in the Sessions dashboard without replacing one another.
PASS: Closing Settings or Sessions leaves the pet, listeners, and tray running.
PASS: Quit from the tray closes the whole application.
PASS: Existing DevPulse files and its previous user-data directory remain untouched.
```

Record the commands, package hashes, desktop environment, display protocol, and observed PASS results in `docs/verification/2026-07-28-agentlog-pet-phase-1-linux.md`. Include:

```bash
sha256sum \
  Linux/AgentLog-Pet-0.1.0-x64.AppImage \
  Linux/AgentLog-Pet-0.1.0-x64.deb
```

- [ ] **Step 8: Replace the README with Phase 1 product instructions**

The README must state:

````markdown
# AgentLog Pet

Your Private AI Agent Work Journal.

AgentLog Pet is a Linux-first desktop pet and local work journal for AI coding
agents. Phase 1 uses a pinned Clawd runtime for Codex CLI and Claude Code live
activity, permissions, sessions, themes, and Linux desktop behavior.

## Requirements

- Linux x64
- Node.js 22.12 or newer
- npm
- X11 or XWayland for full pet dragging and cursor tracking

## Development

```bash
npm install
CLAWD_SKIP_SIDECAR_FETCH=1 npm run dev
```

## Tests

```bash
npm run test:phase1
```

## Linux Packages

```bash
npm run fetch:sidecars -- --target linux-x64
npm run build:linux
```

The current DevPulse React and SQLite source remains in the repository for the
project manager migration. Project records, dual timers, summaries, reports,
and workspace restoration are delivered by the subsequent approved phases.
````

- [ ] **Step 9: Commit the verified Phase 1 release foundation**

Do not commit generated installers. Commit source and the verification record:

```bash
git add runtime/agentlog/main.cjs scripts/smoke-linux.cjs README.md docs/verification
git commit -m "test: verify AgentLog Pet Linux foundation"
```

---

## Phase 1 Completion Gate

Before declaring Phase 1 complete, run from `Linux/`:

```bash
git status --short
npm run test:phase1
npm run verify:sidecars -- build:linux
npm run build:linux
npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
git diff --check
```

Completion requires:

- The root package launches only `runtime/agentlog/main.cjs`.
- The imported runtime remains pinned to commit `45d388aa661824443cd96779ff0a5d277972bd10`.
- Upstream state, permissions, multi-session, startup recovery, liveness, Codex, Claude, and Linux tests pass.
- AgentLog branding tests pass without renaming internal hook protocols or managed markers.
- Normalized events are emitted for both Codex and Claude updates.
- A throwing AgentLog event subscriber cannot affect pet state.
- The development application and packaged AppImage pass the single-instance smoke test.
- The AppImage and Debian package are generated with `AgentLog Pet` identity.
- The Linux interaction acceptance record contains observed results rather than intended results.
- Existing DevPulse source and data remain available for Phase 2 migration.

Phase 2 begins only after this gate and adds SQLite project resolution plus separate AI-agent and human work timing. Phase 3 adds summaries, reports, and scripted workspace restoration. Phase 4 closes any remaining gap against the pinned Clawd feature baseline.
