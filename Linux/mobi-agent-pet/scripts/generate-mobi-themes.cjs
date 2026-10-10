"use strict";

// Authored four-beat office comedies. No external artwork, fonts, or scripting.
// Each action owns one clock: even fast taps/shivers occur inside its long cycle.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const normalStates = ["idle", "thinking", "working", "juggling", "building", "sweeping", "carrying", "attention", "notification", "error", "yawning", "dozing", "collapsing", "sleeping", "waking", "roam", "drag", "poke-left", "poke-right", "double"];
const miniStates = ["mini-idle", "mini-enter", "mini-enter-sleep", "mini-crabwalk", "mini-peek", "mini-alert", "mini-happy", "mini-sleep", "mini-working"];
const variants = [
  { id: "mobi-a", name: "莫比", shape: "square", character: 0, description: "方头莫比：认真加班，总在出岔子后努力补救的苦命打工人。" },
  { id: "mobi-b", name: "莫莫", shape: "round", character: 1, description: "圆头莫莫：靠咖啡硬撑，随时想偷偷摸鱼的困倦打工人。" },
  { id: "mobi-c", name: "比比", shape: "wide", character: 2, description: "扁方头比比：急性子容易炸毛，边崩溃边赶工的苦命打工人。" },
];

// beat format: pose / expression / prop / visible story accent.
// The prop changes with the beat (screen errors, cup spills, escaping paperwork).
const stories = {
  idle: [
    ["检查工牌又戴歪", "stand/calm/badge/none", "inspect/focus/badge/check", "flail/shock/badge/slip", "shrug/worry/badge/check"],
    ["摸鱼被咖啡叫醒", "slump/tired/cup/none", "sleep/sleep/cup/zzz", "flail/shock/cup/spill", "sip/tired/cup/steam"],
    ["等活着急叹口气", "stand/angry/watch/tick", "inspect/angry/watch/question", "fold/grit/watch/sigh", "slump/tired/watch/none"],
  ],
  thinking: [
    ["认真琢磨逐步理清", "inspect/focus/paper/question", "scratch/worry/paper/knot", "point/calm/paper/idea", "inspect/focus/paper/check"],
    ["咖啡里寻找灵感", "sip/tired/cup/steam", "sleep/sleep/cup/zzz", "inspect/worry/cup/question", "point/calm/cup/idea"],
    ["急着理清绕绕思路", "scratch/angry/paper/question", "scratch/grit/paper/knot", "point/grit/paper/idea", "inspect/focus/paper/check"],
  ],
  working: [
    ["认真核对逐行打字", "type/focus/laptop/code", "type/grit/laptop/line", "type/focus/laptop/document", "type/calm/laptop/code"],
    ["咖啡放旁困倦也不停敲", "type/tired/laptop/code", "type/tired/laptop/line", "type/worry/laptop/document", "type/tired/laptop/code"],
    ["咬牙猛敲键盘赶进度", "type/grit/laptop/code", "type/angry/laptop/line", "type/grit/laptop/document", "type/focus/laptop/code"],
  ],
  juggling: [
    ["认真协调三份任务", "juggle/focus/papers/one", "juggle/grit/papers/two", "juggle/worry/papers/three", "juggle/focus/papers/one"],
    ["困倦也要接住任务", "juggle/tired/papers/one", "juggle/worry/papers/two", "juggle/tired/papers/three", "juggle/tired/papers/one"],
    ["急急接住飞来需求", "juggle/angry/papers/one", "juggle/grit/papers/two", "juggle/grit/papers/three", "juggle/angry/papers/one"],
  ],
  building: [
    ["认真搭建逐块核对", "build/focus/blocks/one", "build/grit/blocks/two", "build/focus/blocks/three", "build/calm/blocks/check"],
    ["困倦但仍逐块搭建", "build/tired/blocks/one", "build/tired/blocks/two", "build/worry/blocks/three", "build/tired/blocks/check"],
    ["急急搭建快速核对", "build/angry/blocks/one", "build/grit/blocks/two", "build/grit/blocks/three", "build/focus/blocks/check"],
  ],
  sweeping: [
    ["认真来回清扫碎屑", "sweep/focus/broom/dust", "sweep/grit/broom/none", "sweep/worry/broom/dust", "sweep/calm/broom/check"],
    ["困得摇摆仍在扫地", "sweep/tired/broom/dust", "sweep/tired/broom/sigh", "sweep/worry/broom/dust", "sweep/tired/broom/check"],
    ["急急扫完清理干净", "sweep/angry/broom/dust", "sweep/grit/broom/none", "sweep/grit/broom/dust", "sweep/focus/broom/check"],
  ],
  carrying: [
    ["稳稳抱箱小步搬运", "carry/focus/box/none", "step/grit/box/heavy", "carry/worry/box/none", "step/focus/box/check"],
    ["困倦抱箱仍在搬运", "carry/tired/box/heavy", "step/tired/box/sigh", "carry/worry/box/none", "step/tired/box/check"],
    ["急性子抱箱赶路", "carry/angry/box/heavy", "step/grit/box/tick", "carry/grit/box/none", "step/focus/box/check"],
  ],
  attention: [
    ["完成交付开心庆祝", "cheer/happy/paper/check", "wave/happy/paper/spark", "cheer/happy/paper/check", "wave/calm/paper/spark"],
    ["收工完成开心举杯", "cheer/happy/cup/check", "wave/happy/cup/spark", "cheer/happy/cup/check", "wave/calm/cup/steam"],
    ["终于完成放松庆祝", "cheer/happy/paper/check", "wave/happy/paper/spark", "cheer/happy/paper/check", "wave/calm/paper/sigh"],
  ],
  notification: [
    ["举起手机耐心等回复", "inspect/calm/phone/question", "wave/worry/phone/ping", "inspect/focus/phone/tick", "wave/calm/phone/question"],
    ["困倦举手机等回复", "inspect/tired/phone/question", "wave/worry/phone/ping", "inspect/tired/phone/tick", "wave/tired/phone/question"],
    ["急急举手机催回复", "inspect/angry/phone/question", "wave/grit/phone/ping", "inspect/focus/phone/tick", "wave/grit/phone/question"],
  ],
  error: [
    ["报错捂脸再补救", "type/focus/laptop/code", "flail/shock/laptop/bug", "cover/worry/laptop/rain", "type/grit/laptop/patch"],
    ["咖啡泼了人醒了", "sip/tired/cup/steam", "flail/shock/cup/spill", "cover/worry/laptop/bug", "type/tired/laptop/patch"],
    ["红脸摔东西又捡回赶工", "inspect/angry/laptop/bug", "flail/rage/laptop/anger", "flail/rage/chaos/toss", "bow/worry/laptop/patch"],
  ],
  yawning: [
    ["忍住哈欠又破功", "stand/focus/paper/none", "cover/tired/paper/sigh", "stretch/yawn/paper/zzz", "inspect/worry/paper/check"],
    ["咖啡挡不住哈欠", "sip/tired/cup/steam", "cover/yawn/cup/sigh", "stretch/yawn/cup/zzz", "slump/tired/cup/none"],
    ["嘴硬加班大哈欠", "fold/angry/watch/tick", "cover/tired/watch/sigh", "stretch/yawn/watch/zzz", "fold/grit/watch/anger"],
  ],
  dozing: [
    ["点头撞醒继续读", "inspect/focus/paper/check", "slump/tired/paper/sigh", "sleep/sleep/paper/zzz", "flail/shock/paper/slip"],
    ["抱杯点头咖啡险", "sip/tired/cup/steam", "slump/tired/cup/sigh", "sleep/sleep/cup/zzz", "flail/shock/cup/spill"],
    ["硬撑点头气自己", "fold/grit/laptop/on", "slump/tired/laptop/sigh", "sleep/sleep/laptop/zzz", "flail/grit/laptop/anger"],
  ],
  collapsing: [
    ["累到钻进纸箱", "carry/tired/box/heavy", "slump/tired/box/sigh", "curl/sleep/box/zzz", "sleep/sleep/box/none"],
    ["抱着咖啡就趴下", "sip/tired/cup/steam", "slump/yawn/cup/sigh", "curl/sleep/cup/zzz", "sleep/sleep/cup/none"],
    ["气力耗尽趴工位", "type/grit/laptop/question", "cover/tired/laptop/sigh", "curl/sleep/laptop/zzz", "sleep/sleep/laptop/none"],
  ],
  sleeping: [
    ["梦里还在补文件", "curl/sleep/pillow/zzz", "sleep/sleep/paper/check", "hug/sleep/paper/question", "curl/sleep/pillow/zzz"],
    ["咖啡枕边偷好眠", "curl/sleep/pillow/zzz", "sleep/sleep/cup/steam", "hug/sleep/cup/zzz", "curl/sleep/pillow/moon"],
    ["睡梦里也急炸毛", "curl/sleep/pillow/zzz", "sleep/sleep/paper/question", "flail/sleep/paper/anger", "curl/sleep/pillow/sigh"],
  ],
  waking: [
    ["醒来先找工牌", "curl/sleep/pillow/zzz", "wake/shock/badge/question", "stretch/yawn/badge/sigh", "inspect/focus/badge/check"],
    ["起床先续一杯命", "curl/sleep/pillow/zzz", "wake/tired/cup/question", "sip/tired/cup/steam", "stand/calm/cup/check"],
    ["惊醒发现又迟了", "curl/sleep/pillow/zzz", "wake/shock/watch/tick", "flail/grit/watch/anger", "step/grit/paper/code"],
  ],
  roam: [
    ["撑伞小步漫游", "step/calm/umbrella/rain", "side-step/focus/umbrella/none", "step/happy/umbrella/check", "side-step/calm/umbrella/none"],
    ["捧咖啡溜达透气", "step/tired/cup/sigh", "side-step/calm/cup/steam", "step/happy/cup/none", "side-step/tired/cup/steam"],
    ["拎包急急走两步", "step/angry/briefcase/tick", "side-step/grit/briefcase/none", "step/focus/briefcase/check", "side-step/angry/briefcase/none"],
  ],
  drag: [
    ["悬空摇晃仍护文件", "held/shock/papers/slip", "held/worry/papers/two", "held/grit/papers/stack", "held/worry/papers/check"],
    ["悬空摇晃仍护咖啡", "held/tired/cup/zzz", "held/shock/cup/spill", "held/worry/cup/steam", "held/tired/cup/sigh"],
    ["悬空乱蹬还护公文包", "held/shock/briefcase/slip", "held/angry/briefcase/tick", "held/grit/briefcase/sigh", "held/angry/briefcase/none"],
  ],
  "poke-left": [
    ["左戳歪头扶工牌", "lean-right/shock/badge/poke-left", "cover/worry/badge/slip", "inspect/grit/badge/check", "stand/calm/badge/check"],
    ["左戳醒了又偷睡", "lean-right/shock/cup/poke-left", "sip/tired/cup/steam", "wave/worry/cup/sigh", "sleep/sleep/cup/zzz"],
    ["左戳炸毛追手指", "lean-right/shock/none/poke-left", "flail/grit/none/anger", "point/grit/none/poke-left", "fold/grit/watch/tick"],
  ],
  "poke-right": [
    ["右戳护住小文件", "lean-left/shock/paper/poke-right", "hug/worry/paper/slip", "inspect/grit/paper/check", "wave/calm/paper/check"],
    ["右戳差点洒咖啡", "lean-left/shock/cup/poke-right", "flail/worry/cup/spill", "hug/tired/cup/none", "sip/tired/cup/steam"],
    ["右戳拍桌又收手", "lean-left/shock/laptop/poke-right", "flail/grit/laptop/anger", "type/grit/laptop/question", "fold/grit/laptop/sigh"],
  ],
  double: [
    ["连戳吓跳再鞠躬", "flail/shock/paper/ping", "cheer/happy/paper/spark", "bow/worry/paper/slip", "wave/calm/paper/check"],
    ["连戳精神三秒钟", "wake/shock/cup/ping", "cheer/happy/cup/spark", "sip/tired/cup/steam", "slump/sleep/cup/zzz"],
    ["连戳气炸又硬撑", "flail/grit/laptop/anger", "kick/grit/laptop/cloud", "cover/worry/laptop/sigh", "type/grit/laptop/check"],
  ],
  "mini-idle": [
    ["小窗检查工牌", "inspect/focus/badge/check", "stand/calm/badge/none", "flail/shock/badge/slip", "inspect/worry/badge/check"],
    ["小窗抱杯偷眠", "sip/tired/cup/steam", "slump/tired/cup/sigh", "sleep/sleep/cup/zzz", "wake/shock/cup/tick"],
    ["小窗等活叹口气", "fold/angry/watch/tick", "inspect/angry/watch/question", "fold/grit/watch/sigh", "slump/tired/watch/none"],
  ],
  "mini-enter": [
    ["抱文件挤进小窗", "hide/worry/papers/heavy", "peek/focus/papers/one", "flail/shock/papers/fall", "hug/grit/papers/check"],
    ["抱咖啡溜进小窗", "hide/tired/cup/zzz", "peek/worry/cup/question", "sip/tired/cup/steam", "slump/calm/cup/sigh"],
    ["急着钻窗撞歪头", "hide/angry/none/tick", "peek/grit/none/check", "flail/grit/none/anger", "fold/grit/none/sigh"],
  ],
  "mini-enter-sleep": [
    ["带文件缩窗睡", "slump/tired/paper/sigh", "hide/sleep/paper/zzz", "peek/sleep/paper/slip", "curl/sleep/paper/zzz"],
    ["咖啡抱紧缩窗睡", "sip/tired/cup/steam", "slump/yawn/cup/sigh", "hide/sleep/cup/zzz", "curl/sleep/cup/moon"],
    ["气完缩窗趴着睡", "fold/grit/laptop/anger", "slump/tired/laptop/sigh", "hide/sleep/laptop/zzz", "curl/sleep/laptop/none"],
  ],
  "mini-crabwalk": [
    ["抱文件持续横着挪", "step/focus/papers/one", "side-step/worry/papers/heavy", "step/grit/papers/two", "side-step/focus/papers/check"],
    ["捧咖啡持续偷偷横移", "step/tired/cup/steam", "side-step/calm/cup/none", "step/worry/cup/sigh", "side-step/tired/cup/steam"],
    ["抱箱持续急急横移", "step/angry/box/tick", "side-step/grit/box/heavy", "step/focus/box/none", "side-step/worry/box/check"],
  ],
  "mini-peek": [
    ["探头看活又缩回", "hide/worry/paper/none", "peek/focus/paper/question", "flail/shock/paper/question", "hide/worry/paper/sigh"],
    ["探头确认没人管", "hide/tired/cup/none", "peek/worry/cup/question", "sip/happy/cup/steam", "hide/sleep/cup/zzz"],
    ["探头发现新需求", "hide/angry/phone/none", "peek/grit/phone/question", "flail/grit/phone/ping", "hide/grit/phone/anger"],
  ],
  "mini-alert": [
    ["小窗举手机等待回复", "inspect/calm/phone/question", "wave/worry/phone/ping", "inspect/focus/phone/tick", "wave/calm/phone/question"],
    ["小窗困倦等回复", "inspect/tired/phone/question", "wave/worry/phone/ping", "inspect/tired/phone/tick", "wave/tired/phone/question"],
    ["小窗催促等待回复", "inspect/angry/phone/question", "wave/grit/phone/ping", "inspect/focus/phone/tick", "wave/grit/phone/question"],
  ],
  "mini-happy": [
    ["小窗完成开心庆祝", "cheer/happy/paper/check", "wave/happy/paper/spark", "cheer/happy/paper/check", "wave/calm/paper/spark"],
    ["小窗完成举杯庆祝", "cheer/happy/cup/check", "wave/happy/cup/spark", "cheer/happy/cup/check", "wave/calm/cup/steam"],
    ["小窗完成松一口气", "cheer/happy/paper/check", "wave/happy/paper/spark", "cheer/happy/paper/check", "wave/calm/paper/sigh"],
  ],
  "mini-sleep": [
    ["小窗梦里护文件", "curl/sleep/paper/zzz", "hug/sleep/paper/check", "flail/sleep/paper/question", "curl/sleep/paper/none"],
    ["小窗咖啡陪着睡", "curl/sleep/cup/zzz", "sleep/sleep/cup/steam", "hug/sleep/cup/moon", "curl/sleep/cup/none"],
    ["小窗梦里还炸毛", "curl/sleep/paper/zzz", "sleep/sleep/paper/question", "flail/sleep/paper/anger", "curl/sleep/paper/sigh"],
  ],
  "mini-working": [
    ["小窗逐行认真敲字", "type/focus/laptop/code", "type/grit/laptop/line", "type/focus/laptop/document", "type/calm/laptop/code"],
    ["小窗困倦仍持续敲字", "type/tired/laptop/code", "type/tired/laptop/line", "type/worry/laptop/document", "type/tired/laptop/code"],
    ["小窗咬牙猛敲键盘", "type/grit/laptop/code", "type/angry/laptop/line", "type/grit/laptop/document", "type/focus/laptop/code"],
  ],
};
const shortLabels = {"idle": ["整理工牌", "咖啡续命", "等活叹气"], "thinking": ["认真琢磨", "困倦思索", "急着思索"], "working": ["认真打字", "困倦打字", "猛敲键盘"], "juggling": ["协调任务", "困倦多开", "接住需求"], "building": ["认真搭建", "困倦搭建", "急急搭建"], "sweeping": ["认真清扫", "困倦清扫", "急急清扫"], "carrying": ["小步搬箱", "困倦搬箱", "急急搬箱"], "attention": ["交活庆祝", "举杯庆祝", "收工庆祝"], "notification": ["等待回复", "困倦等待", "催促回复"], "error": ["捂脸抢修", "咖啡事故", "疯狂摔物"], "yawning": ["忍不住困", "咖啡无效", "嘴硬哈欠"], "dozing": ["点头犯困", "抱杯点头", "硬撑犯困"], "collapsing": ["纸箱躺平", "抱杯趴倒", "工位趴倒"], "sleeping": ["文件入梦", "咖啡陪睡", "加班入梦"], "waking": ["找回工牌", "起床续命", "惊醒赶工"], "roam": ["撑伞溜达", "咖啡散步", "急急散步"], "drag": ["悬空护纸", "悬空护杯", "悬空乱蹬"], "poke-left": ["戳歪工牌", "戳醒偷睡", "左戳急眼"], "poke-right": ["护住文件", "护住咖啡", "右戳急眼"], "double": ["吓跳鞠躬", "短暂精神", "急眼硬撑"], "mini-idle": ["小窗工牌", "小窗偷眠", "小窗等活"], "mini-enter": ["抱纸入窗", "抱杯入窗", "急急入窗"], "mini-enter-sleep": ["抱纸缩睡", "抱杯缩睡", "缩窗趴睡"], "mini-crabwalk": ["抱纸横挪", "抱杯横挪", "抱箱横挪"], "mini-peek": ["探头看活", "探头摸鱼", "探头催活"], "mini-alert": ["小窗等待", "困倦等待", "小窗催复"], "mini-happy": ["小窗庆祝", "举杯庆祝", "小窗收工"], "mini-sleep": ["抱纸入梦", "抱杯入梦", "赶工入梦"], "mini-working": ["小窗打字", "困倦打字", "猛敲键盘"]};
const actionDurations = Object.fromEntries([...normalStates, ...miniStates].map(state => [`${state}.svg`, ["building", "juggling", "error", "sleeping", "mini-sleep", "collapsing"].includes(state) ? 6000 : ["idle", "mini-idle", "poke-left", "poke-right", "double", "attention", "mini-happy"].includes(state) ? 4000 : 5000]));
const stroke = "#242424", paper = "#fffef9";
const p = (d, attrs = "") => `<path d="${d}" ${attrs}/>`;
const g = (content, attrs = "") => `<g ${attrs}>${content}</g>`;
const line = d => p(d, 'fill="none"');
const dot = (x, y, r = 3.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${stroke}" stroke="none"/>`;
const rect = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;

function head(shape) {
  if (shape === "round") return p("M80 30 C106 29 123 47 123 72 C124 97 107 113 80 113 C53 114 36 97 37 72 C36 47 54 29 80 30 Z");
  if (shape === "wide") return p("M43 41 Q27 40 27 55 L28 96 Q28 111 44 112 L116 111 Q132 111 132 95 L131 55 Q131 41 115 42 Z");
  return p("M53 28 Q37 27 37 46 L38 95 Q37 113 54 113 L105 112 Q123 112 122 94 L122 45 Q121 28 105 29 Z");
}

function face(variant, mood, first) {
  const y = variant.shape === "wide" ? 82 : 78;
  let eyes = dot(60, y) + dot(100, y), brows = "", mouth = line("M75 98 Q80 100 85 98");
  if (["sleep", "yawn", "tired"].includes(mood)) {
    eyes = line(`M53 ${y} Q60 ${y+5} 67 ${y} M93 ${y} Q100 ${y+5} 107 ${y}`);
    if (mood === "tired") eyes += line(`M53 ${y+7} L66 ${y+8} M94 ${y+8} L106 ${y+7}`);
  }
  if (mood === "happy") { eyes = line(`M53 ${y+2} Q60 ${y-9} 67 ${y+2} M93 ${y+2} Q100 ${y-9} 107 ${y+2}`); mouth = line("M71 97 Q80 109 89 97"); }
  if (mood === "shock") { eyes = `<circle cx="60" cy="${y}" r="8"/><circle cx="100" cy="${y}" r="8"/>` + dot(60,y,2.3)+dot(100,y,2.3); mouth = '<ellipse cx="80" cy="99" rx="5" ry="7"/>'; }
  if (["angry", "rage", "grit"].includes(mood)) { brows = line(`M51 ${y-12} L69 ${y-6} M91 ${y-6} L109 ${y-12}`); mouth = mood === "rage" ? p("M70 96 L90 96 L87 107 L73 107 Z")+line("M72 100 H88") : line("M73 102 L79 99 L86 102"); }
  if (mood === "worry") { brows = line(`M52 ${y-9} L67 ${y-14} M94 ${y-14} L108 ${y-9}`); mouth = line("M73 103 Q80 96 87 103"); }
  if (mood === "focus") { brows = line(`M53 ${y-10} H68 M92 ${y-10} H107`); mouth = line("M76 101 H84"); }
  if (mood === "yawn") mouth = '<ellipse cx="80" cy="98" rx="9" ry="11"/>';
  if (mood === "sleep") mouth = line("M76 100 Q80 103 84 100");
  const blush = variant.character === 2 && mood === "rage" ? '<ellipse cx="52" cy="94" rx="13" ry="9" fill="#ef7777" stroke="none" opacity=".85"/><ellipse cx="108" cy="94" rx="13" ry="9" fill="#ef7777" stroke="none" opacity=".85"/>' : "";
  return blush + g(eyes, first ? 'id="eyes-js" class="eyes"' : 'class="eyes"') + g(brows, 'stroke-width="2.8"') + g(mouth, 'stroke-width="3"') + (variant.character === 0 ? line("M45 64 L49 59") : variant.character === 1 ? line("M74 38 Q84 31 91 39") : line("M61 42 L66 35 L71 42"));
}

// Arms are deliberately drawn as loose lines with round mittens; head and torso
// stay the approved white silhouettes, while the whole body acts out each beat.
const handTargets = {
  stand:[47,139,113,139], inspect:[58,126,99,99], scratch:[52,62,116,136], type:[67,135,96,135],
  flail:[25,99,136,91], shrug:[35,120,127,118], sip:[45,137,87,99], sleep:[62,136,99,137],
  slump:[52,146,108,148], fold:[94,126,63,127], point:[42,132,124,76], juggle:[32,119,128,119],
  hug:[75,132,85,131], build:[48,132,118,111], sweep:[63,141,117,124], carry:[53,137,109,137],
  step:[45,130,118,139], "side-step":[35,133,127,133], cheer:[31,72,128,72], wave:[44,139,121,63],
  cover:[59,84,101,86], stretch:[28,61,133,60], curl:[72,138,89,138], wake:[42,102,119,99],
  held:[47,47,111,44], kick:[34,94,129,98], "lean-right":[33,132,114,117], "lean-left":[45,117,127,132],
  bow:[58,137,102,139], hide:[53,121,108,121], peek:[47,116,114,115],
};
const poseTransforms = {
  stand:"", inspect:"rotate(-5 80 140)", scratch:"rotate(-8 80 140)", type:"translate(0 2)",
  flail:"translate(0 -5) rotate(5 80 145)", shrug:"rotate(-3 80 145)", sip:"rotate(-5 80 140)",
  sleep:"translate(0 8) rotate(9 80 142)", slump:"translate(0 5) rotate(8 80 145)", fold:"rotate(-3 80 145)",
  point:"rotate(-5 80 145)", juggle:"translate(0 -2)", hug:"translate(0 3)", build:"rotate(-4 80 145)",
  sweep:"rotate(-9 80 145)", carry:"rotate(5 80 145)", step:"rotate(-7 80 146)", "side-step":"rotate(7 80 146)",
  cheer:"translate(0 -8)", wave:"rotate(-4 80 145)", cover:"translate(0 4)", stretch:"translate(0 -6)",
  curl:"translate(8 30) rotate(21 80 135) scale(.88 .79)", wake:"translate(0 2) rotate(-9 80 145)",
  held:"translate(0 -12)", kick:"rotate(-12 80 80)", "lean-right":"rotate(13 80 145)", "lean-left":"rotate(-13 80 145)",
  bow:"translate(0 8) rotate(12 80 145)", hide:"translate(0 20)", peek:"translate(0 5) rotate(-7 80 130)",
};
function actor(variant, pose, mood, mini, first, beat) {
  const targets = handTargets[pose];
  const mittens = [];
  const arms = [0, 1].map(side => {
    const sx = side ? 97 : 63, ex = targets[side*2], ey = targets[side*2+1] - (mini && targets[side*2+1] > 110 ? 18 : 0), sy = mini ? 99 : 115;
    mittens.push(`<ellipse cx="${ex}" cy="${ey}" rx="5" ry="5.5"/>`);
    return g(line(`M${sx} ${sy} Q${(sx+ex)/2 + (side ? 8 : -8)} ${(sy+ey)/2} ${ex} ${ey}`) + `<ellipse cx="${ex}" cy="${ey}" rx="5" ry="5.5"/>`, `class="limb limb-${side}"`);
  }).join("");
  const legs = pose === "held" ? line("M69 145 L57 154 L52 148 M91 145 L105 153 L111 147") : pose === "kick" ? line("M70 146 Q60 150 43 153 M90 146 Q106 155 116 162") : pose === "step" || pose === "side-step" ? line("M70 146 L58 162 L49 162 M89 147 L101 159 L111 159") : line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const sweat = ["worry", "shock"].includes(mood) ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : "";
  const headTilt = pose === "slump" || pose === "sleep" ? "rotate(10 80 104)" : pose === "scratch" ? "rotate(-9 80 104)" : pose === "flail" && variant.character === 2 ? "rotate(-9 80 104)" : "";
  return g((mini ? "" : legs + torso) + arms + g(head(variant.shape) + face(variant, mood, first) + sweat, `class="head-pose" transform="${headTilt} rotate(${[-2,0,2,-1][beat]} 80 104)"`) + mittens.join(""), `class="actor pose-${pose}" transform="${poseTransforms[pose]}"`);
}

function miniLaptopTransform() {
  return "translate(0 -31) translate(80 159) scale(.6) translate(-80 -159)";
}
function screenCode(beat) {
  const lengths = [[27,36,22,31],[34,23,35,27],[36,31,25,34],[29,35,21,30]][beat];
  return g(lengths.map((length,i)=>p(`M60 ${131+i*4} H${60+length}`, `class="code-line code-line-${i}" fill="none"`)).join("") + p("M61 129 V132", 'class="code-cursor" fill="none" stroke-width="1.6"'), 'class="screen-code" stroke-width="1.9"');
}

function prop(type, accent, beat, mini, pose) {
  let result = "";
  const tilt = accent === "slip" || accent === "fall" ? (beat % 2 ? 17 : -16) : 0;
  if (type === "chaos") {
    const keyboard = g(rect(48,130,52,15,2)+line("M54 136 H92 M58 141 H87"), 'class="thrown-item thrown-keyboard" transform="rotate(-15 75 138)"');
    const sheet = g(p("M17 97 H37 L45 105 V132 H17 Z")+line("M23 108 H37 M23 116 H35"), 'class="thrown-item thrown-paper" transform="rotate(-23 31 115)"');
    const cup = g(p("M119 102 H139 L136 126 H122 Z")+line("M140 108 Q151 105 146 118 L139 117"), 'class="thrown-item thrown-cup" transform="rotate(24 129 114)"');
    result = keyboard + sheet + cup + line("M12 84 L25 92 M143 83 L134 92 M71 116 L72 124");
  }
  if (type === "laptop") {
    result = p("M48 123 L110 123 L106 150 H53 Z") + rect(54,127,50,18,2) + p("M53 150 H106 L119 159 H41 Z");
    result += accent === "bug" ? g(line("M74 131 L87 142 M87 131 L74 142"),'stroke-width="2.2"') : accent === "patch" || accent === "check" ? g(line("M72 136 L78 142 L89 131"),'stroke-width="2.2"') : screenCode(beat);
    result += line("M57 154 H101");
  }
  if (type === "cup" || type === "cups") {
    const one = p("M99 113 H120 L118 139 Q108 145 101 137 Z") + p("M120 117 Q133 116 129 128 Q126 132 120 128", 'fill="none"') + line("M101 118 H119");
    result = type === "cups" ? g(one, 'transform="translate(-66 -9)"') + g(one, 'transform="translate(-33 -40)"') + one : one;
    if (accent === "steam") result += g(line("M103 107 Q98 100 105 95 M113 105 Q108 98 114 91"), 'class="steam" stroke-width="2.3"');
    if (accent === "spill" || accent === "fall") result += line("M98 123 Q84 130 91 148 M92 149 L83 155 M98 154 H121") + dot(85,143,2);
  }
  if (type === "paper" || type === "papers") {
    const sheet = (x,y,r) => g(p(`M${x} ${y} H${x+23} L${x+30} ${y+7} V${y+38} H${x} Z`) + line(`M${x+23} ${y} V${y+7} H${x+30} M${x+5} ${y+14} H${x+24} M${x+5} ${y+21} H${x+22} M${x+5} ${y+28} H${x+16}`), `class="flying-paper" transform="rotate(${r} ${x+15} ${y+19})" stroke-width="2.6"`);
    result = type === "paper" ? sheet(67,120,tilt) : accent === "fall" ? sheet(22,107,-27)+sheet(64,125,15)+sheet(113,110,32) : sheet(26,84,-15)+sheet(67,62,7)+sheet(109,85,15);
    if (accent === "stack") result = sheet(54,121,-8)+sheet(66,117,7)+sheet(78,121,0);
  }
  if (type === "badge") result = line("M64 111 L80 128 L97 111") + rect(68,123,25,26,3) + dot(80,132,3)+line("M74 141 H87");
  if (type === "phone") result = rect(111,109,22,37,4)+rect(115,115,14,20,1)+dot(122,141,1.5);
  if (type === "watch") result = line("M34 129 H56") + '<circle cx="44" cy="129" r="9"/>'+line(`M44 124 V129 L${beat%2 ? 49 : 40} 132`);
  if (type === "box" || type === "briefcase") {
    result = type === "box" ? p("M44 123 L78 115 L117 125 V155 L81 164 L44 153 Z") + line("M44 123 L81 133 L117 125 M81 133 V164 M66 119 L100 129 M64 150 L70 152") : rect(45,127,70,32,4)+p("M70 128 V118 H90 V128", 'fill="none"')+line("M45 139 H115 M78 135 H84 V143 H78 Z");
  }
  if (type === "blocks") {
    result = rect(40,142,32,19)+rect(75,142,32,19)+rect(58,121,32,19);
    if (["two","three","patch"].includes(accent)) result += rect(76,100,32,19);
    if (accent === "three") result += rect(95,78,32,19);
    if (accent === "fall") result = g(rect(30,139,32,19),'transform="rotate(-13 46 149)"')+g(rect(79,139,32,19),'transform="rotate(18 95 149)"')+g(rect(112,119,29,19),'transform="rotate(35 126 128)"');
    result += line("M47 150 H61 M82 150 H95");
  }
  if (type === "broom") result = line("M106 109 L126 149") + p("M117 146 L132 139 L145 158 L127 166 Z") + g(line("M126 149 L134 161 M132 146 L141 157"), 'stroke-width="2"');
  if (type === "umbrella") result = p("M11 70 Q35 31 60 70 Q50 65 45 70 Q34 64 26 70 Q18 65 11 70 Z")+line("M35 52 V136 Q35 144 42 142");
  if (type === "pillow") result = p("M38 141 Q54 137 70 142 L116 145 Q122 151 116 160 L40 160 Q34 153 38 141 Z")+g(line("M43 147 L49 151 M110 149 L115 155"), 'stroke-width="2"');
  return g(result, `class="prop prop-${type}" transform="${mini ? type === 'laptop' && pose === 'type' ? miniLaptopTransform() : 'translate(0 -35)' : ''} ${pose === 'sip' && type === 'cup' ? 'translate(-24 -19)' : ''} rotate(${tilt} 80 136)"`);
}

function typingHands(variant, mini, beat) {
  const sy = mini ? 140 : 118;
  const fingers = [0,1].map(side => {
    const sx=side?100:60, ex=side?96:66, elbow=side?113:47;
    return g(line(`M${sx} ${sy} Q${elbow} 138 ${side?106:54} 147 L${ex} 153`) + `<ellipse cx="${ex}" cy="153" rx="6" ry="4.5"/>` + g(line(`M${ex-3} 154 H${ex+3}`),'stroke-width="1.8"'), `class="typing-hand typing-hand-${side}"`);
  }).join("");
  const keys = Array.from({length:6},(_,i)=>g(rect(52+i*8,151,6,5,1),`class="typing-key key-${i%2}" stroke-width="1.3"`)).join("");
  const cup = variant.character===1 && !mini ? g(p("M124 139 H137 L135 157 H126 Z")+line("M138 144 Q147 141 144 150 H137"),'stroke-width="2.7"') : "";
  return g(cup+keys+fingers,`class="typing-hands typing-style-${variant.character} typing-beat-${beat}" transform="${mini?miniLaptopTransform():''}"`);
}

function accentArt(accent, mini) {
  const y = mini ? 22 : 18;
  const symbols = {
    check: line(`M127 ${y+9} L133 ${y+15} L145 ${y}`), patch: rect(130,y+3,17,9,2)+g(line(`M136 ${y+5} V${y+10} M141 ${y+5} V${y+10}`),'stroke-width="1.5"'),
    bug: line(`M134 ${y} L144 ${y+11} M144 ${y} L134 ${y+11}`), ping: line(`M130 ${y+4} L136 ${y-2} M140 ${y+9} L151 ${y+8} M138 ${y+16} L145 ${y+22}`),
    tick: line(`M130 ${y+2} V${y+12}`)+dot(130,y+17,2), question: p(`M129 ${y+6} Q129 ${y-2} 136 ${y} Q146 ${y+3} 135 ${y+12} V${y+15}`, 'fill="none"')+dot(135,y+21,1.8),
    idea: '<circle cx="135" cy="25" r="9"/>'+line("M130 34 H140 M132 39 H138 M135 8 V3 M120 15 L115 12 M148 15 L153 12"),
    knot: line(`M124 ${y+9} Q139 ${y-3} 144 ${y+9} Q132 ${y+22} 130 ${y+8} Q143 ${y-2} 146 ${y+18}`),
    anger: line(`M128 ${y+5} H137 V${y-3} M142 ${y+5} H150 M140 ${y+10} V${y+18} M135 ${y+10} H128`),
    sigh: line(`M131 ${y+9} Q144 ${y+3} 149 ${y+10} Q147 ${y+18} 133 ${y+14}`),
    zzz: line(`M125 ${y+5} H135 L125 ${y+15} H135 M139 ${y-5} H148 L139 ${y+3} H148`),
    spark: line(`M19 ${y+20} V${y+32} M13 ${y+26} H25 M136 ${y+5} V${y+17} M130 ${y+11} H142`),
    moon: p(`M139 ${y} Q124 ${y+10} 139 ${y+23} Q151 ${y+20} 153 ${y+10} Q140 ${y+15} 139 ${y} Z`),
    rain: line("M18 92 L14 101 M28 104 L24 113 M139 90 L135 99 M146 105 L142 114"),
    "poke-left": line("M10 72 H26 M18 65 L27 72 L18 79"), "poke-right": line("M150 72 H136 M142 65 L133 72 L142 79"),
    cloud: p(`M123 ${y+21} Q118 ${y+10} 129 ${y+8} Q133 ${y-4} 142 ${y+4} Q154 ${y+2} 151 ${y+14} Q156 ${y+22} 143 ${y+24} Z`),
    dust: dot(19,mini?118:157,2)+dot(28,mini?122:162,2)+line(mini?"M12 124 H30":"M12 166 H33"),
    heavy: line("M16 126 L21 138 M23 126 L27 137 M133 125 L138 137"),
  };
  return g(symbols[accent] || "", `class="accent accent-${accent}" stroke-width="2.6"`);
}

function animationCss(duration) {
  const s = duration / 1000;
  const stages = Array.from({length:4}, (_,i) => {
    const start = i*25, end = (i+1)*25;
    const key = i === 0 ? "0%,24.99%{opacity:1}25%,99.99%{opacity:0}100%{opacity:1}" : `0%,${start-.01}%{opacity:0}${start}%,${end-.01}%{opacity:1}${end}%,100%{opacity:0}`;
    return `.stage-${i}{opacity:${i===0?1:0};animation:beat-${i} ${s}s linear infinite}@keyframes beat-${i}{${key}}`;
  }).join("\n");
  const codeTracks = Array.from({length:4},(_,lineIndex) => {
    const keys = [];
    for (let beat=0;beat<4;beat++) {
      const base=beat*25;
      keys.push(`${base}%{scale:0 1}`,`${base+lineIndex*4+1}%{scale:0 1}`,`${base+lineIndex*4+7}%{scale:1 1}`,`${base+24.99}%{scale:1 1}`);
    }
    keys.push("100%{scale:0 1}");
    return `.code-line-${lineIndex}{animation:code-line-${lineIndex} ${s}s linear infinite}@keyframes code-line-${lineIndex}{${keys.join("")}}`;
  }).join("\n");
  const cursorKeys=[];
  for(let beat=0;beat<4;beat++) for(const [time,x,y,opacity] of [[0,0,0,1],[3,10,0,0],[6,27,0,1],[7,0,4,0],[10,12,4,1],[13,25,4,0],[14,0,8,1],[17,16,8,0],[20,31,8,1],[21,0,12,0],[24.99,27,12,1]]) cursorKeys.push(`${beat*25+time}%{translate:${x}px ${y}px;opacity:${opacity}}`);
  cursorKeys.push("100%{translate:0 0;opacity:1}");
  return `${stages}
${codeTracks}
.code-line{transform-box:view-box;transform-origin:60px 133px}
.code-cursor{animation:code-cursor ${s}s linear infinite}@keyframes code-cursor{${cursorKeys.join("")}}
.actor,.limb,.prop,.accent,.eyes{transform-box:view-box}
.actor{transform-origin:80px 150px;animation:act ${s}s ease-in-out infinite}
.prop{transform-origin:80px 136px;animation:prop-act ${s}s ease-in-out infinite}
.accent{animation:accent-act ${s}s ease-in-out infinite}
.eyes{transform-origin:80px 80px;animation:blink ${s}s linear infinite}
.pose-type .limb{animation:typing ${s}s linear infinite}.pose-type .limb-1{animation-name:typing-right}
.pose-kick .limb,.pose-flail .limb{animation:fuss ${s}s ease-in-out infinite}
@keyframes act{0%,25%,50%,75%,100%{translate:0 0}10%,35%,60%,85%{translate:0 -2px}20%,45%,70%,95%{translate:0 1px}}
@keyframes prop-act{0%,25%,50%,75%,100%{translate:0 0}12%,37%,62%,87%{translate:0 -2px}22%,47%,72%,97%{translate:1px 1px}}
@keyframes accent-act{0%,25%,50%,75%,100%{opacity:.7}8%,33%,58%,83%{opacity:1}18%,43%,68%,93%{opacity:.6}}
@keyframes blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
@keyframes typing{0%,4%,8%,12%,16%,20%,25%,29%,33%,37%,41%,45%,50%,54%,58%,62%,66%,70%,75%,79%,83%,87%,91%,95%,100%{translate:0 0}2%,6%,10%,14%,18%,22%,27%,31%,35%,39%,43%,47%,52%,56%,60%,64%,68%,72%,77%,81%,85%,89%,93%,97%{translate:0 2px}}
@keyframes typing-right{0%,4%,8%,12%,16%,20%,25%,29%,33%,37%,41%,45%,50%,54%,58%,62%,66%,70%,75%,79%,83%,87%,91%,95%,100%{translate:0 2px}2%,6%,10%,14%,18%,22%,27%,31%,35%,39%,43%,47%,52%,56%,60%,64%,68%,72%,77%,81%,85%,89%,93%,97%{translate:0 0}}
@keyframes fuss{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{translate:-2px 0}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{translate:2px -2px}}
.pose-step,.pose-side-step{animation:walking ${s}s linear infinite}
.pose-held,.pose-kick{transform-origin:80px 35px;animation:dangle ${s}s ease-in-out infinite}
.pose-flail{animation:panic ${s}s linear infinite}
.pose-wave .limb-1,.pose-juggle .limb{transform-origin:97px 115px;animation:waving ${s}s ease-in-out infinite}
.prop-broom{animation:sweeping ${s}s ease-in-out infinite}
.prop-papers .flying-paper{animation:paperflight ${s}s ease-in-out infinite}
.thrown-item{transform-box:view-box;transform-origin:80px 130px;animation:throwing ${s}s linear infinite}
.thrown-paper{transform-origin:31px 115px}.thrown-cup{transform-origin:129px 114px;animation-name:throw-cup}.thrown-keyboard{transform-origin:75px 138px;animation-name:throw-keyboard}
@keyframes walking{0%,12%,25%,37%,50%,62%,75%,87%,100%{translate:-4px 0;rotate:-3deg}6%,18%,31%,43%,56%,68%,81%,93%{translate:4px -6px;rotate:3deg}}
@keyframes dangle{0%,25%,50%,75%,100%{rotate:-8deg;translate:0 0}12%,37%,62%,87%{rotate:8deg;translate:0 2px}}
@keyframes panic{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{translate:-3px 0;rotate:-4deg}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{translate:3px -6px;rotate:4deg}}
@keyframes waving{0%,25%,50%,75%,100%{rotate:-8deg}8%,33%,58%,83%{rotate:7deg}16%,41%,66%,91%{rotate:-4deg}}
@keyframes sweeping{0%,25%,50%,75%,100%{rotate:-9deg;translate:-4px 0}12%,37%,62%,87%{rotate:6deg;translate:3px 0}}
@keyframes paperflight{0%,25%,50%,75%,100%{translate:0 3px;rotate:-5deg}12%,37%,62%,87%{translate:0 -9px;rotate:5deg}}
@keyframes throwing{0%,49.99%{translate:29px 6px;rotate:0deg}50%{translate:29px 6px;rotate:0deg}55%{translate:9px -31px;rotate:-30deg}61%{translate:0 -14px;rotate:-75deg}68%{translate:6px 23px;rotate:-100deg}71%{translate:4px 14px;rotate:-105deg}74.99%,100%{translate:5px 23px;rotate:-110deg}}
@keyframes throw-cup{0%,49.99%,50%{translate:-29px 9px;rotate:0deg}55%{translate:-7px -27px;rotate:24deg}61%{translate:0 -13px;rotate:60deg}68%{translate:-7px 24px;rotate:83deg}71%{translate:-7px 15px;rotate:86deg}74.99%,100%{translate:-7px 24px;rotate:90deg}}
@keyframes throw-keyboard{0%,49.99%,50%{translate:0 0;rotate:0deg}55%{translate:0 -36px;rotate:13deg}61%{translate:4px -18px;rotate:22deg}68%{translate:4px 18px;rotate:30deg}71%{translate:4px 7px;rotate:32deg}74.99%,100%{translate:4px 18px;rotate:34deg}}
.typing-hand{transform-box:view-box;animation:typing ${s}s linear infinite}.typing-hand-1{animation-name:typing-right}
.typing-style-1 .typing-hand{animation-name:slow-typing}.typing-style-1 .typing-hand-1{animation-name:slow-typing-right}
.typing-style-2 .typing-hand{animation-name:hard-typing}.typing-style-2 .typing-hand-1{animation-name:hard-typing-right}
.typing-key{animation:keypress ${s}s linear infinite}.typing-key.key-1{animation-name:keypress-right}
.typing-style-1 .typing-key{animation-name:slow-keypress}.typing-style-1 .typing-key.key-1{animation-name:slow-keypress-right}
.typing-style-2 .typing-key{animation-name:hard-keypress}.typing-style-2 .typing-key.key-1{animation-name:hard-keypress-right}
@keyframes slow-typing{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{translate:0 -2px}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{translate:0 1px}}
@keyframes slow-typing-right{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{translate:0 1px}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{translate:0 -2px}}
@keyframes hard-typing{0%,3%,6%,9%,12%,15%,18%,21%,25%,28%,31%,34%,37%,40%,43%,46%,50%,53%,56%,59%,62%,65%,68%,71%,75%,78%,81%,84%,87%,90%,93%,96%,100%{translate:0 -2px}1.5%,4.5%,7.5%,10.5%,13.5%,16.5%,19.5%,22.5%,26.5%,29.5%,32.5%,35.5%,38.5%,41.5%,44.5%,47.5%,51.5%,54.5%,57.5%,60.5%,63.5%,66.5%,69.5%,72.5%,76.5%,79.5%,82.5%,85.5%,88.5%,91.5%,94.5%,97.5%{translate:0 1px}}
@keyframes hard-typing-right{0%,3%,6%,9%,12%,15%,18%,21%,25%,28%,31%,34%,37%,40%,43%,46%,50%,53%,56%,59%,62%,65%,68%,71%,75%,78%,81%,84%,87%,90%,93%,96%,100%{translate:0 1px}1.5%,4.5%,7.5%,10.5%,13.5%,16.5%,19.5%,22.5%,26.5%,29.5%,32.5%,35.5%,38.5%,41.5%,44.5%,47.5%,51.5%,54.5%,57.5%,60.5%,63.5%,66.5%,69.5%,72.5%,76.5%,79.5%,82.5%,85.5%,88.5%,91.5%,94.5%,97.5%{translate:0 -2px}}
@keyframes slow-keypress{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{fill:#fffef9}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{fill:#aaa}}
@keyframes slow-keypress-right{0%,8%,16%,25%,33%,41%,50%,58%,66%,75%,83%,91%,100%{fill:#aaa}4%,12%,20%,29%,37%,45%,54%,62%,70%,79%,87%,95%{fill:#fffef9}}
@keyframes hard-keypress{0%,3%,6%,9%,12%,15%,18%,21%,25%,28%,31%,34%,37%,40%,43%,46%,50%,53%,56%,59%,62%,65%,68%,71%,75%,78%,81%,84%,87%,90%,93%,96%,100%{fill:#fffef9}1.5%,4.5%,7.5%,10.5%,13.5%,16.5%,19.5%,22.5%,26.5%,29.5%,32.5%,35.5%,38.5%,41.5%,44.5%,47.5%,51.5%,54.5%,57.5%,60.5%,63.5%,66.5%,69.5%,72.5%,76.5%,79.5%,82.5%,85.5%,88.5%,91.5%,94.5%,97.5%{fill:#aaa}}
@keyframes hard-keypress-right{0%,3%,6%,9%,12%,15%,18%,21%,25%,28%,31%,34%,37%,40%,43%,46%,50%,53%,56%,59%,62%,65%,68%,71%,75%,78%,81%,84%,87%,90%,93%,96%,100%{fill:#aaa}1.5%,4.5%,7.5%,10.5%,13.5%,16.5%,19.5%,22.5%,26.5%,29.5%,32.5%,35.5%,38.5%,41.5%,44.5%,47.5%,51.5%,54.5%,57.5%,60.5%,63.5%,66.5%,69.5%,72.5%,76.5%,79.5%,82.5%,85.5%,88.5%,91.5%,94.5%,97.5%{fill:#fffef9}}
@keyframes keypress{0%,4%,8%,12%,16%,20%,25%,29%,33%,37%,41%,45%,50%,54%,58%,62%,66%,70%,75%,79%,83%,87%,91%,95%,100%{fill:#fffef9}2%,6%,10%,14%,18%,22%,27%,31%,35%,39%,43%,47%,52%,56%,60%,64%,68%,72%,77%,81%,85%,89%,93%,97%{fill:#aaa}}
@keyframes keypress-right{0%,4%,8%,12%,16%,20%,25%,29%,33%,37%,41%,45%,50%,54%,58%,62%,66%,70%,75%,79%,83%,87%,91%,95%,100%{fill:#aaa}2%,6%,10%,14%,18%,22%,27%,31%,35%,39%,43%,47%,52%,56%,60%,64%,68%,72%,77%,81%,85%,89%,93%,97%{fill:#fffef9}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}}
`;
}

function renderSvg(variant, state) {
  const mini = state.startsWith("mini-");
  const story = stories[state][variant.character];
  const duration = actionDurations[`${state}.svg`];
  const stages = story.slice(1).map((beat, i) => {
    const [pose,mood,type,accent] = beat.split("/");
    return g(actor(variant,pose,mood,mini,i===0,i) + prop(type,accent,i,mini,pose) + (pose === "type" ? typingHands(variant,mini,i) : "") + accentArt(accent,mini), `class="stage stage-${i}" aria-label="${["准备", "努力", "意外", "收场"][i]}"`);
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mini ? '0 12 160 118' : '0 0 160 180'}" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · ${story[0]}</title>
<desc id="description">黑白手绘打工人，四段剧情：准备、努力、意外、收场；完整循环 ${duration/1000} 秒。</desc>
<style>${animationCss(duration)}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${stages}
</g>
</svg>\n`;
}

function manifest(variant) {
  const duration = state => actionDurations[`${state}.svg`];
  return {
    schemaVersion: 1, name: variant.name, author: "Mobi Agent Pet", version: "2.0.0", description: variant.description,
    preview: "idle.svg", customization: { petTint: false },
    actionDurations: {...actionDurations},
    actionLabels: Object.fromEntries([...normalStates,...miniStates].map(state => [`${state}.svg`, shortLabels[state][variant.character]])),
    viewBox: { x: 0, y: 0, width: 160, height: 180 },
    layout: { contentBox: { x: 12, y: 20, width: 140, height: 149 }, centerX: 80, baselineY: 164, visibleHeightRatio: .75, baselineBottomRatio: .05 },
    eyeTracking: { enabled: true, states: ["idle"], maxOffset: 3, bodyScale: .16, ids: { eyes: "eyes-js", body: "body-js" } },
    states: Object.fromEntries(normalStates.filter(state => !["building","drag","poke-left","poke-right","double"].includes(state)).map(state => [state,[`${state}.svg`]])),
    sleepSequence: { mode: "full" },
    workingTiers: [{ minSessions: 3, file: "building.svg" }, { minSessions: 2, file: "juggling.svg" }, { minSessions: 1, file: "working.svg" }],
    jugglingTiers: [{ minSessions: 2, file: "building.svg" }, { minSessions: 1, file: "juggling.svg" }],
    timings: { yawnDuration: duration("yawning"), collapseDuration: duration("collapsing"), wakeDuration: duration("waking"), minDisplay: Object.fromEntries([...normalStates,...miniStates].map(state => [state,duration(state)])), autoReturn: Object.fromEntries(["attention","error","sweeping","notification","carrying"].map(state => [state,duration(state)])) },
    hitBoxes: { default: { x: 25, y: 25, w: 110, h: 142 }, wide: { x: 12, y: 8, w: 140, h: 161 }, sleeping: { x: 28, y: 58, w: 105, h: 112 } },
    sleepingHitboxFiles: ["sleeping.svg", "collapsing.svg"],
    wideHitboxFiles: ["juggling.svg", "building.svg", "attention.svg", "notification.svg", "drag.svg", "double.svg"],
    reactions: { drag: { file: "drag.svg", duration: duration("drag") }, clickLeft: { file: "poke-left.svg", duration: duration("poke-left") }, clickRight: { file: "poke-right.svg", duration: duration("poke-right") }, double: { files: ["double.svg"], duration: duration("double") } },
    miniMode: { supported: true, enterDuration: duration("mini-enter"), enterSleepDuration: duration("mini-enter-sleep"), timings: { minDisplay: Object.fromEntries(miniStates.map(state => [state,duration(state)])), autoReturn: { "mini-alert": duration("mini-alert"), "mini-happy": duration("mini-happy") } }, viewBox: { x: 0, y: 12, width: 160, height: 118 }, states: Object.fromEntries(miniStates.map(state => [state,[`${state}.svg`]])) },
    objectScale: { widthRatio: 1, heightRatio: 1, offsetX: 0, offsetY: 0 },
  };
}
function generate() {
  for (const variant of variants) {
    const dir = path.join(root,"runtime","clawd","themes",variant.id);
    fs.mkdirSync(path.join(dir,"assets"),{recursive:true});
    for (const state of [...normalStates,...miniStates]) fs.writeFileSync(path.join(dir,"assets",`${state}.svg`),renderSvg(variant,state));
    fs.writeFileSync(path.join(dir,"theme.json"),JSON.stringify(manifest(variant),null,2)+"\n");
    console.log(`${variant.name}: ${normalStates.length+miniStates.length} authored four-beat office stories`);
  }
}
if (require.main === module) generate();
module.exports = { generate, renderSvg, manifest, variants, actionDurations };
