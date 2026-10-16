"use strict";

// Read-only preview of the production scene. All controls use mock Agent data.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/runtime/clawd/src/"><title>Mobi 的办公室</title><link rel="icon" href="data:,"><link rel="stylesheet" href="dashboard-office.css"><style>
*{box-sizing:border-box}body{margin:0;padding:32px 20px;background:#f5f5f5;color:#262626;font:14px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto}h1{margin:0 0 4px;font-size:24px}p{margin:0 0 18px;color:#777}.controls{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:18px}label{display:flex;gap:10px;align-items:center}select{padding:7px 12px;border:1px solid #ddd;border-radius:8px;background:white;font:inherit}#petScene{width:100%;aspect-ratio:3/2;border:1px solid #e2e2e2;border-radius:18px}footer{margin-top:14px;color:#888;font-size:12px}
</style></head><body><main><h1>Mobi 的办公室</h1><p>切换角色和 Agent 状态，查看动作变化。</p><div class="controls"><label>主角<select id="role"><option value="mobi-a">莫比</option><option value="mobi-b" selected>莫莫</option><option value="mobi-c">比比</option></select></label><label>Agent 状态<select id="status"><option value="working">工作中</option><option value="waiting">等待输入</option><option value="complete">任务完成</option><option value="idle">空闲</option></select></label></div><section id="petScene" class="pet-scene" aria-labelledby="petName"><span id="petMood" class="pet-scene__mood">工作中</span><div id="officeScene"></div><span id="petName" class="pet-scene__accessible-name">莫莫</span></section><footer>工作动作缓慢切换；喝一口咖啡后会放下杯子。同事的动作时间彼此错开。</footer></main><script src="dashboard-office.js"></script><script src="/office-demo.js"></script></body></html>`;
const demo = `const office = MobiDashboardOffice.create({container:document.getElementById('officeScene')});
const role = document.getElementById('role'), status = document.getElementById('status');
function updateRole(){office.setTheme({themeId:role.value});document.getElementById('petName').textContent=role.options[role.selectedIndex].text;}
function updateStatus(){office.setSessions(status.value==='idle'?[]:[{state:status.value,badge:status.value==='working'?'running':status.value==='complete'?'done':'idle'}]);document.getElementById('petMood').textContent=status.options[status.selectedIndex].text;}
role.addEventListener('change',updateRole);status.addEventListener('change',updateStatus);updateRole();updateStatus();office.setActive(true);
document.addEventListener('visibilitychange',()=>office.setActive(!document.hidden));window.addEventListener('pagehide',()=>office.destroy());`;
const comparison = `<!doctype html><html><head><title>Office design comparison</title><style>body{font:14px system-ui;margin:20px}main{display:flex;gap:20px}figure{margin:0;width:48%}img{width:100%;height:400px;object-fit:contain;background:white}figcaption{margin-bottom:10px}</style></head><body><main><figure><figcaption>Selected design</figcaption><img src="/runtime/clawd/assets/source/dashboard-office/approved-reference.png"></figure><figure><figcaption>Rendered overview component (labels retain application scale)</figcaption><img src="/docs/verification/office-scene/mobi-a-typing.png"></figure></main></body></html>`;
const types = { ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".html":"text/html", ".json":"application/json" };
http.createServer((req,res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/comparison" || url.pathname === "/office-demo.js") {
    res.setHeader("Content-Type", url.pathname === "/office-demo.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(url.pathname === "/office-demo.js" ? demo : url.pathname === "/comparison" ? comparison : html); return;
  }
  const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) { res.writeHead(404); res.end(); return; }
  fs.readFile(file,(error,data) => { if(error){res.writeHead(404);res.end();return;}res.setHeader("Content-Type",types[path.extname(file)]);res.end(data); });
}).listen(4176,"127.0.0.1",()=>console.log("Office preview: http://127.0.0.1:4176"));
