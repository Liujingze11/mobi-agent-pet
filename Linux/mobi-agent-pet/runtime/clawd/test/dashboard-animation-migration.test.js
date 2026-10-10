"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const src = path.join(__dirname, "..", "src");
const read = (file) => fs.readFileSync(path.join(src, file), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("behavior page offers only Custom editor and never invokes sound APIs", async()=>{
 const dom=new JSDOM(read("dashboard.html"),{runScripts:"outside-only"}),w=dom.window,calls=[];
 w.setInterval=()=>1;w.ClawdDashboardTheme={create:()=>({t:x=>x,enter(){},leave(){},refresh(){},render(){}})};
 w.dashboardAPI={onLangChange(){},onSessionSnapshot(){},getI18n:async()=>({lang:"zh",translations:{appModeEditCustom:"编辑自定义模式…"}}),getSnapshot:async()=>({sessions:[],groups:[]}),getPetBehavior:async()=>({}),openCustomModeEditor:async()=>calls.push("edit")};
 w.eval(read("session-focus-unavailable.js"));w.eval(read("dashboard-renderer.js"));await tick();w.document.getElementById("behaviorTab").click();await tick();
 assert.equal(w.document.querySelectorAll(".sound-override-row,.pet-behavior-switch").length,0);
 w.document.querySelector("[data-edit-custom-mode]").click();await tick();assert.deepEqual(calls,["edit"]);dom.window.close();
});

test("dashboard has no mounted sound editor and Settings loads the Custom editor dependencies",()=>{
 const html=read("settings.html"),dashboard=read("dashboard.html");
 assert.ok(!dashboard.includes('src="./dashboard-animation.js"'));assert.ok(!dashboard.includes('id="animationContent"'));
 assert.ok(html.indexOf('src="pet-states.js"')<html.indexOf('src="custom-mode-profile.js"'));
 assert.ok(html.indexOf('src="custom-mode-profile.js"')<html.indexOf('src="settings-tab-custom-mode.js"'));
});

test("status session list does not inherit Settings panel spacing", () => {
  const { window } = new JSDOM(read("dashboard.html"));
  const sessions = window.document.querySelector("#statusPage #content");
  assert.ok(sessions);
  assert.match(read("settings.css"), /\.content\s*\{[^}]*padding:\s*28px 36px/s);
  assert.equal(sessions.classList.contains("content"), false);
  window.close();
});
