"use strict";

// Authored office animations. No external artwork, fonts, or scripting.
// Each action owns one clock: even fast taps/shivers occur inside its long cycle.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { renderConfettiLayer } = require("../runtime/clawd/src/pet-celebration");
const normalStates = ["idle", "thinking", "working", "juggling", "building", "sweeping", "carrying", "attention", "notification", "error", "yawning", "collapsing", "roam", "drag", "poke-right", "double"];
const variants = [
  { id: "mobi-a", name: "莫比", shape: "square", character: 0, idleFile: "standing.svg", thinkingDurationMs: 6000, sweepingDurationMs: 3000, attentionDurationMs: 8000, errorDurationMs: 7500, collapsingDurationMs: 10000, description: "认真又有点冒失，总会努力补救。" },
  { id: "mobi-b", name: "莫莫", shape: "round", character: 1, idleDurationMs: 10000, yawningDurationMs: 5000, attentionDurationMs: 8000, thinkingDurationMs: 6000, sweepingDurationMs: 3000, errorDurationMs: 7500, description: "靠咖啡续命，偶尔偷偷摸鱼。" },
  { id: "mobi-c", name: "比比", shape: "wide", character: 2, idleFallbackState: "thinking", attentionDurationMs: 8000, thinkingDurationMs: 6000, sweepingDurationMs: 3000, errorDurationMs: 10000, description: "急性子爱炸毛，边崩溃边赶工。" },
];

// beat format: pose / expression / prop / visible story accent.
// The prop changes with the beat (screen errors, cup spills, escaping paperwork).
const stories = {
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
  error: [
    ["敲电脑报错慌张后捂脸发愁", "type/focus/laptop/code", "flail/shock/laptop/bug", "cover/worry/laptop/rain"],
    null, // Momo's interrupted coffee break uses a continuous catch-and-type rig.
    null, // Bibi keeps throwing through an extended final beat.
  ],
  collapsing: [
    null, // Mobi opens the box, flattens it, then lies on the cardboard.
    null, // Retired Momo collapsing action.
    ["敲电脑、犯困后原地睡着", "type/grit/laptop/question", "cover/tired/laptop/sigh", "type/sleep/laptop/none"],
  ],
  "poke-right": [
    null, // Retired Mobi right-poke action.
    null, // Retired Momo right-poke action.
    ["生气挥手后继续赶工", "flail/grit/laptop/anger", "type/grit/laptop/question", "fold/grit/laptop/sigh"],
  ],
  double: [
    null, // Retired Mobi double-poke action.
    null, // Retired Momo double-poke action.
    ["连戳气炸又硬撑", "flail/grit/laptop/anger", "kick/grit/laptop/cloud", "cover/worry/laptop/sigh", "type/grit/laptop/code"],
  ],

};
const shortLabels = {"idle": [null, "咖啡续命", null], "thinking": ["认真琢磨", "困倦思索", "急着思索"], "working": ["认真打字", "困倦打字", "猛敲键盘"], "juggling": ["协调任务", "困倦多开", "接住需求"], "building": ["认真搭建", "困倦搭建", "急急搭建"], "sweeping": ["认真清扫", "困倦清扫", "急急清扫"], "carrying": ["小步搬砖", "困倦搬砖", "急急搬砖"], "notification": ["等待回复", "困倦等待", "催促回复"], "error": ["捂脸抢修", "突然来活", "疯狂摔物"], "yawning": [null, "伸腰续命", null], "collapsing": ["纸箱躺平", null, "工位打盹"], "roam": ["撑伞溜达", "咖啡散步", "急急散步"], "drag": ["提起掉落", "提起掉杯", "提起掉包"], "poke-right": [null, null, "右戳急眼"], "double": [null, null, "急眼硬撑"]};
const actionDurations = Object.fromEntries(normalStates.map(state => [`${state}.svg`, state === "poke-right" ? 3000 : state === "double" ? 8000 : ["building", "juggling", "error", "collapsing"].includes(state) ? 6000 : ["idle", "attention"].includes(state) ? 4000 : 5000]));
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
  if (mood === "confused") {
    eyes = `<ellipse cx="60" cy="${y}" rx="5.8" ry="6.6"/><ellipse cx="100" cy="${y}" rx="6.6" ry="7.4"/>` + dot(60,y,2.3) + dot(100,y,2.3);
    brows = line(`M52 ${y-11} Q60 ${y-16} 68 ${y-13} M92 ${y-17} Q100 ${y-21} 108 ${y-16}`);
    mouth = '<ellipse cx="81" cy="99" rx="3.3" ry="4.3" transform="rotate(-10 81 99)"/>';
  }
  if (mood === "surprised") {
    eyes = `<circle cx="60" cy="${y}" r="7.5"/><circle cx="100" cy="${y}" r="7.5"/>` + dot(60,y,2.4) + dot(100,y,2.4);
    brows = line(`M51 ${y-16} Q60 ${y-23} 69 ${y-18} M91 ${y-19} Q100 ${y-25} 109 ${y-18}`);
    mouth = '<ellipse cx="80" cy="99" rx="4.5" ry="6.2"/>';
  }
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
  held:[47,47,111,44], kick:[34,94,129,98],
  hide:[53,121,108,121], peek:[47,116,114,115],
};
const poseTransforms = {
  stand:"", inspect:"rotate(-5 80 140)", scratch:"rotate(-8 80 140)", type:"translate(0 2)",
  flail:"translate(0 -5) rotate(5 80 145)", shrug:"rotate(-3 80 145)", sip:"rotate(-5 80 140)",
  sleep:"translate(0 8) rotate(9 80 142)", slump:"translate(0 5) rotate(8 80 145)", fold:"rotate(-3 80 145)",
  point:"rotate(-5 80 145)", juggle:"translate(0 -2)", hug:"translate(0 3)", build:"rotate(-4 80 145)",
  sweep:"rotate(-9 80 145)", carry:"rotate(5 80 145)", step:"rotate(-7 80 146)", "side-step":"rotate(7 80 146)",
  cheer:"translate(0 -8)", wave:"rotate(-4 80 145)", cover:"translate(0 4)", stretch:"translate(0 -6)",
  curl:"translate(8 30) rotate(21 80 135) scale(.88 .79)", wake:"translate(0 2) rotate(-9 80 145)",
  held:"translate(0 -12)", kick:"rotate(-12 80 80)",
  hide:"translate(0 20)", peek:"translate(0 5) rotate(-7 80 130)",
};
function jugglingPalm(x, y, side) {
  return g(p("M-5 1 Q-8 -4 -4 -6 Q-1 -7 0 -3 Q3 -6 6 -3 Q9 1 5 5 Q0 8 -4 5 Z") + g(line("M-2 2 Q1 0 4 2"), 'stroke-width="1.6"'), `class="juggle-hand" transform="translate(${x} ${y}) scale(${side ? -1 : 1} 1)" stroke-width="3.2"`);
}

function actor(variant, pose, mood, first, beat) {
  const targets = handTargets[pose];
  const refineHands = ["mobi-a", "mobi-b", "mobi-c"].includes(variant.id) && pose === "juggle";
  const mittens = [];
  const arms = [0, 1].map(side => {
    const sx = side ? 97 : 63, ex = targets[side*2], ey = targets[side*2+1], sy = 115;
    if (refineHands) return g(line(`M${sx} ${sy} Q${side ? 116 : 45} 111 ${ex} ${ey}`) + jugglingPalm(ex, ey, side), `class="limb limb-${side}"`);
    mittens.push(`<ellipse cx="${ex}" cy="${ey}" rx="5" ry="5.5"/>`);
    return g(line(`M${sx} ${sy} Q${(sx+ex)/2 + (side ? 8 : -8)} ${(sy+ey)/2} ${ex} ${ey}`) + `<ellipse cx="${ex}" cy="${ey}" rx="5" ry="5.5"/>`, `class="limb limb-${side}"`);
  }).join("");
  const legs = pose === "held" ? line("M69 145 L57 154 L52 148 M91 145 L105 153 L111 147") : pose === "kick" ? line("M70 146 Q60 150 43 153 M90 146 Q106 155 116 162") : pose === "step" || pose === "side-step" ? line("M70 146 L58 162 L49 162 M89 147 L101 159 L111 159") : line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const sweat = ["worry", "shock"].includes(mood) ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : "";
  const headTilt = pose === "slump" || pose === "sleep" ? "rotate(10 80 104)" : pose === "scratch" ? "rotate(-9 80 104)" : pose === "flail" && variant.character === 2 ? "rotate(-9 80 104)" : "";
  if (refineHands) return g(legs + torso + g(head(variant.shape) + face(variant, mood, first) + sweat, `class="head-pose" transform="${headTilt} rotate(${[-2,0,2,-1][beat]} 80 104)"`) + arms, `class="actor pose-${pose}" transform="${poseTransforms[pose]}"`);
  return g((legs + torso) + arms + g(head(variant.shape) + face(variant, mood, first) + sweat, `class="head-pose" transform="${headTilt} rotate(${[-2,0,2,-1][beat]} 80 104)"`) + mittens.join(""), `class="actor pose-${pose}" transform="${poseTransforms[pose]}"`);
}

function screenCode(beat) {
  const lengths = [[27,36,22,31],[34,23,35,27],[36,31,25,34],[29,35,21,30]][beat];
  return g(lengths.map((length,i)=>p(`M60 ${131+i*4} H${60+length}`, `class="code-line code-line-${i}" fill="none"`)).join("") + p("M61 129 V132", 'class="code-cursor" fill="none" stroke-width="1.6"'), 'class="screen-code" stroke-width="1.9"');
}

function prop(type, accent, beat, pose, refinePapers = false) {
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
    const sheet = (x,y,r,index = 0) => {
      const art = p(`M${x} ${y} H${x+23} L${x+30} ${y+7} V${y+38} H${x} Z`) + line(`M${x+23} ${y} V${y+7} H${x+30} M${x+5} ${y+14} H${x+24} M${x+5} ${y+21} H${x+22} M${x+5} ${y+28} H${x+16}`);
      if (refinePapers) return g(g(art, `transform="rotate(${r} ${x+15} ${y+19})"`), `class="flying-paper paper-${index}" style="transform-origin:${x+15}px ${y+19}px" stroke-width="2.6"`);
      return g(art, `class="flying-paper" transform="rotate(${r} ${x+15} ${y+19})" stroke-width="2.6"`);
    };
    result = type === "paper" ? sheet(67,120,tilt) : accent === "fall" ? sheet(22,107,-27)+sheet(64,125,15)+sheet(113,110,32) : sheet(26,84,-15,0)+sheet(67,62,7,1)+sheet(109,85,15,2);
    if (accent === "stack") result = sheet(54,121,-8)+sheet(66,117,7)+sheet(78,121,0);
  }
  if (type === "badge") result = line("M64 111 L80 128 L97 111") + rect(68,123,25,26,3) + dot(80,132,3)+line("M74 141 H87");
  if (type === "phone") result = rect(111,109,22,37,4)+rect(115,115,14,20,1)+dot(122,141,1.5);
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
  if (type === "pillow") result = p("M38 141 Q54 137 70 142 L116 145 Q122 151 116 160 L40 160 Q34 153 38 141 Z")+g(line("M43 147 L49 151 M110 149 L115 155"), 'stroke-width="2"');
  return g(result, `class="prop prop-${type}" transform=" ${pose === 'sip' && type === 'cup' ? 'translate(-24 -19)' : ''} rotate(${tilt} 80 136)"`);
}

function typingHands(variant, beat) {
  const sy = 118;
  const fingers = [0,1].map(side => {
    const sx=side?100:60, ex=side?96:66, elbow=side?113:47;
    return g(line(`M${sx} ${sy} Q${elbow} 138 ${side?106:54} 147 L${ex} 153`) + `<ellipse cx="${ex}" cy="153" rx="6" ry="4.5"/>` + g(line(`M${ex-3} 154 H${ex+3}`),'stroke-width="1.8"'), `class="typing-hand typing-hand-${side}"`);
  }).join("");
  const keys = Array.from({length:6},(_,i)=>g(rect(52+i*8,151,6,5,1),`class="typing-key key-${i%2}" stroke-width="1.3"`)).join("");
  const cup = variant.character===1 ? g(p("M124 139 H137 L135 157 H126 Z")+line("M138 144 Q147 141 144 150 H137"),'stroke-width="2.7"') : "";
  return g(cup+keys+fingers,`class="typing-hands typing-style-${variant.character} typing-beat-${beat}" transform=""`);
}

function accentArt(accent) {
  const y = 18;
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
    cloud: p(`M123 ${y+21} Q118 ${y+10} 129 ${y+8} Q133 ${y-4} 142 ${y+4} Q154 ${y+2} 151 ${y+14} Q156 ${y+22} 143 ${y+24} Z`),
    dust: dot(19,157,2)+dot(28,162,2)+line("M12 166 H33"),
    heavy: line("M16 126 L21 138 M23 126 L27 137 M133 125 L138 137"),
  };
  return g(symbols[accent] || "", `class="accent accent-${accent}" stroke-width="2.6"`);
}

function stageAnimationCss(duration, count = 4) {
  const s = duration / 1000;
  if (count !== 4) return Array.from({length:count}, (_,i) => {
    // Truncate fractional percentages so floating-point rounding cannot delay the cut.
    const boundary = n => Math.floor(n * 100 / count * 1e6) / 1e6;
    const start = boundary(i), end = boundary(i + 1);
    const key = i === 0 ? `0%{opacity:1}${end}%,100%{opacity:0}` : `0%{opacity:0}${start}%{opacity:1}${end}%{opacity:0}${end < 100 ? "100%{opacity:0}" : ""}`;
    return `.stage-${i}{opacity:${i===0?1:0};animation:beat-${i} ${s}s step-end infinite}@keyframes beat-${i}{${key}}`;
  }).join("\n");
  return Array.from({length:4}, (_,i) => {
    const start = i*25, end = (i+1)*25;
    const key = i === 0 ? "0%,24.99%{opacity:1}25%,99.99%{opacity:0}100%{opacity:1}" : `0%,${start-.01}%{opacity:0}${start}%,${end-.01}%{opacity:1}${end}%,100%{opacity:0}`;
    return `.stage-${i}{opacity:${i===0?1:0};animation:beat-${i} ${s}s linear infinite}@keyframes beat-${i}{${key}}`;
  }).join("\n");
}

function animationCss(duration, actorOrigin = "80px 150px", refineJuggling = false, stageCount = 4) {
  const s = duration / 1000;
  const jugglingMotion = refineJuggling ? `.pose-juggle .limb-0{transform-origin:63px 115px;animation:juggle-left ${s}s ease-in-out infinite}
.pose-juggle .limb-1{transform-origin:97px 115px;animation:juggle-right ${s}s ease-in-out infinite;animation-delay:-1s}
.prop-papers .flying-paper{transform-box:view-box}
.prop-papers .paper-1{animation-delay:-.5s}
.prop-papers .paper-2{animation-delay:-1s}
@keyframes juggle-left{0%,25%,50%,75%,100%{rotate:-7deg}12%,37%,62%,87%{rotate:5deg}}
@keyframes juggle-right{0%,25%,50%,75%,100%{rotate:7deg}12%,37%,62%,87%{rotate:-5deg}}
` : "";
  const stages = stageAnimationCss(duration, stageCount);
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
.actor{transform-origin:${actorOrigin};animation:act ${s}s ease-in-out infinite}
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
${jugglingMotion}@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}}
`;
}

function actionFile(variant, state) {
  return state === "idle" ? variant.idleFile || (variant.idleFallbackState ? `${variant.idleFallbackState}.svg` : "idle.svg") : `${state}.svg`;
}

function renderStandingSvg(variant) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 静止站立</title>
<desc id="description">待机默认站姿。</desc>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${actor(variant, "stand", "calm", true, 1)}
</g>
</svg>\n`;
}

function renderThinkingSvg(variant) {
  const seconds = variant.thinkingDurationMs / 1000;
  const hasCup = variant.id === "mobi-b";
  const isBibi = variant.id === "mobi-c";
  const propType = hasCup ? "cup" : "paper";
  const questionBeat = hasCup ? 2 : 0, ideaBeat = hasCup ? 3 : 2;
  const questionPose = isBibi ? "scratch" : "inspect";
  const questionMood = hasCup ? "worry" : isBibi ? "angry" : "focus";
  const question = actor(variant, questionPose, questionMood, questionBeat === 0, questionBeat) + prop(propType, "question", questionBeat, questionPose) + accentArt("question");
  const idea = actor(variant, "point", isBibi ? "grit" : "calm", false, ideaBeat) + prop(propType, "idea", ideaBeat, "point") + accentArt("idea");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 从疑惑到灵感</title>
<desc id="description">保留原来的角色动作：拿${hasCup ? "咖啡杯" : "纸"}疑惑 ${seconds / 2} 秒，随后抬手想到办法 ${seconds / 2} 秒；整轮 ${seconds} 秒。</desc>
<style>
.actor,.limb,.prop,.accent,.eyes{transform-box:view-box}
.actor{transform-origin:80px 150px;animation:act ${seconds}s ease-in-out infinite}
${isBibi ? ".thought-question .actor{transform-origin:0 0}\n" : ""}.prop{transform-origin:80px 136px;animation:prop-act ${seconds}s ease-in-out infinite}
.accent{animation:accent-act ${seconds}s ease-in-out infinite}
.eyes{transform-origin:80px 80px;animation:blink ${seconds}s linear infinite}
.thought-question{opacity:1;animation:thought-question ${seconds}s linear infinite}
.thought-idea{opacity:0;animation:thought-idea ${seconds}s linear infinite}
@keyframes act{0%,25%,50%,75%,100%{translate:0 0}10%,35%,60%,85%{translate:0 -2px}20%,45%,70%,95%{translate:0 1px}}
@keyframes prop-act{0%,25%,50%,75%,100%{translate:0 0}12%,37%,62%,87%{translate:0 -2px}22%,47%,72%,97%{translate:1px 1px}}
@keyframes accent-act{0%,25%,50%,75%,100%{opacity:.7}8%,33%,58%,83%{opacity:1}18%,43%,68%,93%{opacity:.6}}
@keyframes blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
@keyframes thought-question{0%,49.99%{opacity:1}50%,99.99%{opacity:0}100%{opacity:1}}
@keyframes thought-idea{0%,49.99%{opacity:0}50%,99.99%{opacity:1}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.thought-question{opacity:0}.thought-idea{opacity:1}}
</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<g class="stage thought-question" aria-label="问号">${question}</g>
<g class="stage thought-idea" aria-label="灯泡">${idea}</g>
</g>
</svg>\n`;
}

function renderCoffeeSvg(variant) {
  const seconds = variant.idleDurationMs / 1000;
  const cupBody = "M65 137 H88 L85 155 Q76 160 68 154 Z";
  const legs = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const cup = p(cupBody) + g('<rect class="coffee-fill" x="65" y="137" width="23" height="21" fill="#6b4a34" stroke="none"/>', 'clip-path="url(#coffee-cup-clip)"')
    + p(cupBody, 'fill="none"') + line("M65 141 Q53 138 53 147 Q54 152 67 149")
    + g(line("M73 131 Q68 125 73 120 M82 130 Q77 124 82 118"), 'class="coffee-steam" stroke-width="2.1" opacity=".5"')
    + '<ellipse cx="56" cy="146" rx="5" ry="5.5"/>';
  const pot = p("M111 105 Q122 101 135 105 L137 132 Q124 142 112 132 Z")
    + p("M112 109 L95 102 L97 110 L113 120")
    + p("M136 112 Q152 110 152 122 Q152 134 137 130", 'fill="none"')
    + line("M114 103 Q124 97 133 103 M124 99 V94 M117 126 Q125 129 133 126")
    + '<ellipse cx="143" cy="124" rx="5" ry="5.5"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 倒咖啡再慢慢喝</title>
<desc id="description">先用咖啡壶往杯里倒咖啡，再拿起杯子喝。每段 ${seconds / 2} 秒，整轮 ${seconds} 秒。</desc>
<defs><clipPath id="coffee-cup-clip"><path d="${cupBody}"/></clipPath></defs>
<style>
.coffee-body,.coffee-cup,.coffee-pot,.coffee-fill,.eyes{transform-box:view-box}
.coffee-body{animation:coffee-breathe ${seconds}s ease-in-out infinite}
.coffee-cup{transform-origin:76px 137px;animation:coffee-drink ${seconds}s ease-in-out infinite}
.coffee-pot{transform-origin:143px 124px;animation:coffee-pour ${seconds}s ease-in-out infinite}
.coffee-fill{transform-origin:76px 158px;animation:coffee-fill ${seconds}s linear infinite}
.coffee-stream{animation:coffee-stream ${seconds}s linear infinite}
.coffee-left-arm{animation:coffee-left-arm ${seconds}s ease-in-out infinite}
.coffee-right-arm{animation:coffee-right-arm ${seconds}s ease-in-out infinite}
.eyes{transform-origin:80px 78px;animation:coffee-blink ${seconds}s linear infinite}
@keyframes coffee-breathe{0%,50%,100%{translate:0 0}25%,75%{translate:0 -1px}}
@keyframes coffee-pour{0%,50%,100%{translate:0 0;rotate:0deg}10%,42%{translate:0 0;rotate:-22deg}58%,90%{translate:4px 14px;rotate:0deg}}
@keyframes coffee-drink{0%,50%,100%{translate:0 0;rotate:0deg}60%,84%{translate:7px -37px;rotate:-12deg}96%{translate:0 0;rotate:0deg}}
@keyframes coffee-stream{0%,8%,44%,100%{opacity:0}12%,40%{opacity:1}}
@keyframes coffee-fill{0%,8%,96%,100%{scale:1 .05}44%,58%{scale:1 .85}84%{scale:1 .08}}
@keyframes coffee-left-arm{0%,50%,96%,100%{d:path("M63 115 Q47 127 56 146")}60%,84%{d:path("M63 115 Q47 123 64 113")}}
@keyframes coffee-right-arm{0%,50%,100%{d:path("M97 115 Q120 140 143 124")}58%,90%{d:path("M97 115 Q125 146 147 138")}}
@keyframes coffee-blink{0%,18%,21%,70%,73%,100%{scale:1 1}19%,20%,71%,72%{scale:1 .18}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.coffee-stream{opacity:0}.coffee-fill{scale:1 .5}}
</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<g class="coffee-body">
${legs + torso + g(head(variant.shape) + face(variant, "tired", true), 'class="coffee-head"')}
<path class="coffee-left-arm" d="M63 115 Q47 127 56 146" fill="none"/>
<path class="coffee-right-arm" d="M97 115 Q120 140 143 124" fill="none"/>
<g class="coffee-cup" aria-label="咖啡杯">${cup}</g>
<g class="coffee-pot" aria-label="咖啡壶">${pot}</g>
<path class="coffee-stream" d="M90.4 121.6 Q90 128 76.5 139" fill="none" stroke="#6b4a34" stroke-width="3.2" opacity="0"/>
</g>
</g>
</svg>\n`;
}

function renderCastleBuildingSvg(variant) {
  const duration = actionDurations["building.svg"], s = duration / 1000;
  const moods = [["focus","grit","focus","calm"], ["tired","tired","worry","tired"], ["angry","grit","grit","focus"]][variant.character];
  const brickLines = (x, width, rows) => g(rows.map((y, i) => line(`M${x} ${y} H${x+width} M${x+(i%2 ? 7 : 14)} ${y} V${Math.min(y+10,162)}`)).join(""), 'stroke-width="1.3" opacity=".55"');
  const tower = x => p(`M${x} 162 V118 H${x+5} V124 H${x+10} V118 H${x+15} V124 H${x+22} V162 Z`) + brickLines(x,22,[136,149]) + p(`M${x+8} 143 V136 Q${x+11} 130 ${x+14} 136 V143 Z`, 'fill="#deddd7" stroke-width="1.7"');
  const parts = [
    { name: "wall", x: 109, y: 144, art: rect(96,141,30,21,1) + brickLines(96,30,[152]) + p("M103 162 V154 Q103 145 111 145 Q119 145 119 154 V162 Z", 'class="castle-gate" fill="#deddd7" stroke-width="2.2"') },
    { name: "tower-left", x: 88, y: 122, art: tower(77) },
    { name: "tower-right", x: 136, y: 122, art: tower(125) },
    { name: "crown", x: 110, y: 135, art: p("M99 141 V132 H105 V137 H111 V132 H117 V137 H123 V141 Z") },
  ];
  const css = `${stageAnimationCss(duration)}
.castle-builder.actor{animation:castle-bob ${s}s ease-in-out infinite}
.eyes{transform-box:view-box;transform-origin:80px 80px;animation:castle-blink ${s}s linear infinite}
.castle-arm{transform-box:view-box;transform-origin:79px 115px;animation:castle-place ${s}s ease-in-out infinite,castle-bob ${s}s ease-in-out infinite}
.stage-2 .castle-arm{animation-name:castle-place-right,castle-bob}
.castle-carried{animation:castle-release ${s}s linear infinite}
.castle-deposited{animation:castle-settled ${s}s linear infinite}
.castle-flag{animation:castle-finish ${s}s linear infinite}
@keyframes castle-bob{0%,25%,50%,75%,100%{translate:0 0}12%,37%,62%{translate:0 1px}}
@keyframes castle-blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
@keyframes castle-place{0%,25%,50%,75%,100%{rotate:-32deg}15%,40%,65%,90%,99.99%{rotate:0deg}}
@keyframes castle-place-right{0%,25%,50%,75%,100%{rotate:-16deg}15%,40%,65%,90%,99.99%{rotate:0deg}}
@keyframes castle-release{0%,14.99%,25%,39.99%,50%,64.99%,75%,89.99%,100%{opacity:1}15%,24.99%,40%,49.99%,65%,74.99%,90%,99.99%{opacity:0}}
@keyframes castle-settled{0%,14.99%,25%,39.99%,50%,64.99%,75%,89.99%,100%{opacity:0}15%,24.99%,40%,49.99%,65%,74.99%,90%,99.99%{opacity:1}}
@keyframes castle-finish{0%,89.99%,100%{opacity:0}90%,99.99%{opacity:1}}
@media(prefers-reduced-motion:reduce){.stage{animation:none;opacity:0}.stage-3{opacity:1}.eyes{animation:none}.castle-arm,.castle-builder.actor{animation:none;rotate:0deg}.castle-carried{animation:none;opacity:0}.castle-deposited,.castle-flag{animation:none;opacity:1}}
`;
  const stages = parts.map((part, beat) => {
    const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
    const legs = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163");
    const sweat = moods[beat] === "worry" ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : "";
    const body = g(legs + torso + g(head(variant.shape) + face(variant,moods[beat],beat===0) + sweat, `class="head-pose" transform="rotate(${[-2,0,2,-1][beat]} 80 104)"`) + line("M63 115 Q46 125 48 139") + jugglingPalm(48,139,0), 'transform="translate(-18 0)"');
    const castleBase = g(rect(73,162,79,5,1) + g(line("M80 163 V166 M87 163 V166 M94 163 V166 M131 163 V166 M138 163 V166 M145 163 V166"), 'stroke-width="1.1"'), 'class="castle-base"');
    const completed = parts.slice(0,beat).map(previous => g(previous.art, `class="castle-part castle-${previous.name}"`)).join("");
    const placingArm = line(`M79 115 Q${(79+part.x)/2} ${part.y+12} ${part.x-8} ${part.y+3}`) + g(part.art, `class="castle-carried castle-${part.name}" stroke-width="2.6"`) + jugglingPalm(part.x-8,part.y+3,1);
    const flag = beat===3 ? g(line("M136 118 V102") + p("M136 103 Q143 100 150 104 L145 110 Q141 107 136 110 Z"), 'class="castle-flag" stroke-width="2.2"') : "";
    const spareBricks = g(rect(18,152,17,10,1) + rect(27,141,17,10,1) + line("M21 152 V149 H26 V152 M31 141 V138 H36 V141"), 'class="spare-bricks" stroke-width="2.2"');
    return g(g(body, 'class="actor castle-builder"') + spareBricks + g(castleBase + completed + g(part.art, `class="castle-deposited castle-${part.name}"`) + flag, 'class="prop-castle" stroke-width="2.6"') + g(placingArm, 'class="castle-arm"'), `class="stage stage-${beat}" aria-label="${["摆好城门底座","搭起左侧塔楼","搭起右侧塔楼","放上城垛，城堡完成"][beat]}"`);
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 搭建积木城堡</title>
<desc id="description">摆好城门底座，搭起两侧塔楼，放上城垛，展示完整的积木城堡；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${stages}
</g>
</svg>\n`;
}

function renderSweepingSvg(variant) {
  const duration = variant.sweepingDurationMs || actionDurations["sweeping.svg"], s = duration / 1000;
  // Palms travel with the handle. Scaling only the arms' horizontal reach
  // keeps their shoulders fixed and their endpoints on the moving grips.
  const reach = (length, dx) => (length+dx)/length;
  const scraps = [
    { x:106, art:p("M-4 -3 L-1 -6 L4 -3 L3 2 L-2 3 Z") + line("M-1 -6 L0 -1 L3 2 M-4 -3 L0 -1") },
    { x:116, art:p("M-3 -5 H2 L5 -2 V2 H-3 Z") + line("M2 -5 V-2 H5 M-1 -1 H2") },
    { x:127, art:p("M-3 -3 L0 -5 L4 -1 L2 2 L-2 2 Z") + line("M0 -5 L-1 0 L2 2") },
    { x:134, art:dot(-2,0,1.5) + dot(2,-2,1.2) },
  ];
  const sweepPositions = [[0,-24],[5,-24],[18,14],[25,-24],[38,14],[48,-12],[99.99,-12],[100,-24]];
  const motion = value => sweepPositions.map(([time,dx]) => `${time}%{${value(dx)}}`).join("");
  const trashCss = scraps.map((scrap,i) => {
    const contact = 5+(scrap.x-106)/38*13;
    const coast = i<2 ? `18%{translate:${144-scrap.x}px 0}25%,99.99%{translate:${180-scrap.x}px 0}` : `18%,38%{translate:${144-scrap.x}px 0}45%,99.99%{translate:${180-scrap.x}px 0}`;
    return `.trash-${i}{animation:trash-${i} ${s}s linear infinite}@keyframes trash-${i}{0%,${contact}%{translate:0 0}${coast}100%{translate:0 0}}`;
  }).join("\n");
  const css = `${stageAnimationCss(duration)}
.eyes{transform-box:view-box;transform-origin:80px 78px;translate:3px 3px;animation:sweep-blink ${s}s linear infinite}
.stage-3 .eyes{translate:1px 1px}
.sweep-rig{animation:sweep-slide ${s}s linear infinite}
.sweep-arm{transform-box:view-box}
.sweep-arm-right{transform-origin:79px 115px;animation:sweep-right ${s}s linear infinite}
.sweep-arm-left{transform-origin:45px 115px;animation:sweep-left ${s}s linear infinite}
.floor-trash{transform-box:view-box}
.clean-spark{animation:clean-floor ${s}s linear infinite}
${trashCss}
@keyframes sweep-slide{${motion(dx=>`translate:${dx}px 0`)}}
@keyframes sweep-right{${motion(dx=>`scale:${reach(27,dx)} 1`)}}
@keyframes sweep-left{${motion(dx=>`scale:${reach(66,dx)} 1`)}}
@keyframes sweep-blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
@keyframes clean-floor{0%,47.99%,100%{opacity:0}48%,99.99%{opacity:1}}
@media(prefers-reduced-motion:reduce){.stage{animation:none;opacity:0}.stage-3{opacity:1}.eyes{animation:none}.sweep-rig{animation:none;translate:-12px 0}.sweep-arm-right{animation:none;scale:${reach(27,-12)} 1}.sweep-arm-left{animation:none;scale:${reach(66,-12)} 1}.floor-trash{animation:none;opacity:0}.clean-spark{animation:none;opacity:1}}
`;
  const moods = [["focus","grit","focus","calm"], ["tired","tired","worry","tired"], ["angry","grit","grit","focus"]][variant.character];
  const heads = moods.map((mood,i) => {
    const sweat = mood === "worry" ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : "";
    return g(head(variant.shape) + face(variant,mood,i===0) + sweat, `class="stage stage-${i}" aria-label="${["发现地上的纸屑","双手握住扫帚快速清扫","检查地面","地面已经扫干净"][i]}"`);
  }).join("\n");
  const actorBody = g(line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163") + p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z") + heads, 'class="sweeping-actor" transform="translate(-18 0)"');
  const arms = g(line("M45 115 Q48 134 111 136.2"), 'class="sweep-arm sweep-arm-left"') + g(line("M79 115 Q94 116 106 125.2"), 'class="sweep-arm sweep-arm-right"');
  const broom = g(line("M100 112 L120 156") + g(p("M114 153 H124 L130 165 H112 Z") + g(line("M117 157 L115 165 M121 157 V165 M125 157 L127 165"), 'stroke-width="1.4"'), 'class="broom-brush" stroke-width="2.6"'), 'class="held-broom"');
  const hands = g(jugglingPalm(106,125.2,1), 'class="sweep-hand sweep-hand-right"') + g(jugglingPalm(111,136.2,0), 'class="sweep-hand sweep-hand-left"');
  const rubbish = g(scraps.map((scrap,i) => g(scrap.art, `class="floor-trash trash-${i}" transform="translate(${scrap.x} 163)" stroke-width="1.5"`)).join(""), 'class="sweeping-trash" clip-path="url(#sweeping-frame)"');
  const clean = g(line("M105 157 V163 M102 160 H108 M117 154 V158 M115 156 H119"), 'class="clean-spark" stroke-width="1.7"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 握住扫帚清扫纸屑</title>
<desc id="description">双手握住扫帚，快速扫两下，将纸屑扫出画面右侧，最后展示干净的地面；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<defs><clipPath id="sweeping-frame"><rect x="0" y="0" width="160" height="180"/></clipPath></defs>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${g(line("M18 167 H154"), 'class="sweep-floor" stroke-width="1.3" opacity=".35"')}
${actorBody}${rubbish}${arms}${g(broom+hands,'class="sweep-rig"')}${clean}
</g>
</svg>\n`;
}

function renderBrickCarryingSvg(variant) {
  const duration = actionDurations["carrying.svg"], s = duration / 1000;
  const moods = [["focus","grit","worry","focus"], ["tired","tired","worry","tired"], ["angry","grit","grit","focus"]][variant.character];
  const restoreExpression = moods[0] !== moods[3];
  const closingCss = restoreExpression ? `.stage-3{animation-name:carry-last-face}
.carry-loop-face{opacity:0;animation:carry-close-face ${s}s linear infinite}
@keyframes carry-last-face{0%,74.99%,90%,100%{opacity:0}75%,89.99%{opacity:1}}
@keyframes carry-close-face{0%,89.99%,100%{opacity:0}90%,99.99%{opacity:1}}
` : "";
  const brick = (x,y) => {
    const side = p(`M${x} ${y} L${x+12} ${y+6} V${y+17} L${x} ${y+11} Z`, 'fill="#c67f69"');
    const front = p(`M${x+12} ${y+6} H${x+62} V${y+17} H${x+12} Z`, 'fill="#d9947c"');
    const top = p(`M${x} ${y} H${x+50} L${x+62} ${y+6} H${x+12} Z`, 'fill="#e9b09c"');
    const holes = [11,26,41].map(offset => p(`M${x+offset} ${y+2} H${x+offset+6} L${x+offset+10} ${y+4} H${x+offset+4} Z`, 'fill="#925947" stroke-width="1.1"')).join("");
    const texture = g(line(`M${x+20} ${y+10} L${x+22} ${y+11} M${x+48} ${y+13} H${x+53}`), 'stroke-width="1.2" opacity=".5"');
    return g(side+front+top+holes+texture, 'class="held-brick" stroke-width="2.6"');
  };
  const css = `${stageAnimationCss(duration)}
.brick-route{animation:carry-route ${s}s linear infinite}
.brick-carrier{animation:carry-bob ${s}s ease-in-out infinite}
.brick-leg,.eyes{transform-box:view-box}
.brick-leg-left{transform-origin:69px 145px;animation:carry-left-step ${s}s ease-in-out infinite}
.brick-leg-right{transform-origin:91px 145px;animation:carry-right-step ${s}s ease-in-out infinite}
.eyes{transform-origin:80px 78px;animation:carry-blink ${s}s linear infinite}
@keyframes carry-route{0%,50%,100%{translate:0 0}25%{translate:-24px 0}75%{translate:24px 0}}
@keyframes carry-bob{0%,12.5%,25%,37.5%,50%,62.5%,75%,87.5%,100%{translate:0 0}6.25%,18.75%,31.25%,43.75%,56.25%,68.75%,81.25%,93.75%{translate:0 -1.8px}}
@keyframes carry-left-step{0%,12.5%,25%,37.5%,50%,62.5%,75%,87.5%,100%{rotate:0deg}6.25%,31.25%,56.25%,81.25%{rotate:-10deg}18.75%,43.75%,68.75%,93.75%{rotate:10deg}}
@keyframes carry-right-step{0%,12.5%,25%,37.5%,50%,62.5%,75%,87.5%,100%{rotate:0deg}6.25%,31.25%,56.25%,81.25%{rotate:10deg}18.75%,43.75%,68.75%,93.75%{rotate:-10deg}}
@keyframes carry-blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
${closingCss}@media(prefers-reduced-motion:reduce){.stage{animation:none;opacity:0}.stage-3{opacity:1}.brick-route,.brick-carrier,.brick-leg,.eyes{animation:none}}
`;
  const heads = moods.map((mood,i) => {
    const sweat = mood === "worry" ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : "";
    return g(head(variant.shape)+face(variant,mood,i===0)+sweat, `class="stage stage-${i}" aria-label="${["抱起两块砖头","小步搬砖","稳住砖头继续走","把砖头稳稳搬过去"][i]}"`);
  }).join("\n");
  const closingHead = restoreExpression ? g(head(variant.shape)+face(variant,moods[0],false), 'class="stage carry-loop-face" aria-label="恢复起始表情，继续搬砖"') : "";
  const legs = g(line("M69 145 L65 163 L57 163"), 'class="brick-leg brick-leg-left"') + g(line("M91 145 L95 163 L104 163"), 'class="brick-leg brick-leg-right"');
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = g(line("M63 115 Q42 125 49 143"), 'class="carry-arm carry-arm-left"') + g(line("M97 115 Q119 125 111 143"), 'class="carry-arm carry-arm-right"');
  const load = g(brick(48,133)+brick(53,116), 'class="brick-stack"');
  const hands = g(jugglingPalm(49,143,0), 'class="carry-hand carry-hand-left"') + g(jugglingPalm(111,143,1), 'class="carry-hand carry-hand-right"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 小步搬砖</title>
<desc id="description">双手抱住两块叠放的红砖，从中间走向左侧，再走到右侧并返回中间；位置、脚步和表情在循环首尾一致，可以连续播放；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${g(g(legs+torso+heads+closingHead+arms+load+hands,'class="brick-carrier"'),'class="brick-route"')}
</g>
</svg>\n`;
}


function frontWalkLeg(phase,hipX,bob,side,liftHeight = 7.5) {
  const number = n => Number(n.toFixed(4));
  const stance = phase < .5, progress = stance ? phase*2 : (phase-.5)*2;
  const lift = stance ? 0 : liftHeight*Math.sin(progress*Math.PI);
  // A frontal projection lifts each foot in depth without implying lateral travel.
  const x = hipX+side*(5+lift*.1), y = 165-lift;
  const kneeX = hipX+side*(2+lift*.2), kneeY = 154.5-lift*.5+bob*.25;
  return `M${hipX} ${number(145+bob)} L${number(kneeX)} ${number(kneeY)} L${number(x)} ${number(y-1.5)} L${number(x+side*6)} ${number(y)}`;
}

function renderUmbrellaWalkSvg(variant) {
  const duration = actionDurations["roam.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const poses = Array.from({length:65}, (_,i) => {
    const phase = (i%16)/16, bob = -1.25*Math.sin(phase*Math.PI*2)**2;
    return {t:i/64*100,bob:number(bob),wind:number(1.1*Math.sin(i/64*Math.PI*2)),
      left:[number(46+Math.sin(phase*Math.PI*2)),number(136-2*Math.cos(phase*Math.PI*2))],
      legs:[frontWalkLeg(phase,69,bob,-1),frontWalkLeg((phase+.5)%1,91,bob,1)]};
  });
  const arm = pose => `M63 115 Q${number(43+(pose.left[0]-46)*.35)} 124 ${pose.left.join(" ")}`;
  const keys = property => poses.map(pose => `${pose.t}%{${property(pose)}}`).join("");
  const rainKeys = [], rippleKeys = [];
  for (let i=0;i<5;i++) {
    const t=i*20;
    rainKeys.push(`${t}%{translate:0 -12px;opacity:0}`,`${t+1}%{translate:0 -2.3px;opacity:.55}`,`${t+17}%{translate:0 152.9px;opacity:.55}`,`${t+19.99}%{translate:0 182px;opacity:0}`);
    rippleKeys.push(`${t}%{scale:.2;opacity:0}`,`${t+2}%{scale:.3;opacity:.4}`,`${t+15}%,${t+19.99}%{scale:1;opacity:0}`);
  }
  rainKeys.push("100%{translate:0 -12px;opacity:0}");
  rippleKeys.push("100%{scale:.2;opacity:0}");
  const css = `
.rain-walk-body{animation:rain-walk-bob ${s}s linear infinite}
.rain-walk-umbrella,.rain-walk-head,.rain-walk-left-hand,.eyes,.rain-walk-drop,.rain-walk-ripple{transform-box:view-box}
.rain-walk-umbrella{transform-origin:80px 130px;animation:rain-walk-wind ${s}s linear infinite}
.rain-walk-head{transform-origin:80px 108px;animation:rain-walk-look ${s}s ease-in-out infinite}
.rain-walk-leg-0{animation:rain-walk-leg-0 ${s}s linear infinite}
.rain-walk-leg-1{animation:rain-walk-leg-1 ${s}s linear infinite}
.rain-walk-left-arm{animation:rain-walk-left-arm ${s}s linear infinite}
.rain-walk-left-hand{animation:rain-walk-left-hand ${s}s linear infinite}
.eyes{transform-origin:80px 78px;animation:rain-walk-blink ${s}s linear infinite}
.rain-walk-drop{animation:rain-walk-rain ${s}s linear infinite}
.rain-walk-ripple{animation:rain-walk-ripple ${s}s linear infinite}
@keyframes rain-walk-bob{${keys(pose=>`translate:0 ${pose.bob}px`)}}
@keyframes rain-walk-wind{${keys(pose=>`rotate:${pose.wind}deg`)}}
@keyframes rain-walk-leg-0{${keys(pose=>`d:path("${pose.legs[0]}")`)}}
@keyframes rain-walk-leg-1{${keys(pose=>`d:path("${pose.legs[1]}")`)}}
@keyframes rain-walk-left-arm{${keys(pose=>`d:path("${arm(pose)}")`)}}
@keyframes rain-walk-left-hand{${keys(pose=>`translate:${number(pose.left[0]-poses[0].left[0])}px ${number(pose.left[1]-poses[0].left[1])}px`)}}
@keyframes rain-walk-look{0%,50%,100%{rotate:-.4deg}25%,75%{rotate:.4deg}}
@keyframes rain-walk-blink{0%,18%,21%,68%,71%,100%{scale:1 1}19%,20%,69%,70%{scale:1 .13}}
@keyframes rain-walk-rain{${rainKeys.join("")}}
@keyframes rain-walk-ripple{${rippleKeys.join("")}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.rain-walk-drop,.rain-walk-ripple{opacity:0}}
`;
  const canopy = p("M6 22 C17 -6 44 -21 80 -21 C116 -21 143 -6 154 22 Q141 13 126 22 Q110 13 95 22 Q80 13 65 22 Q50 13 34 22 Q20 13 6 22 Z",'class="rain-walk-canopy" fill="#dce8ed" stroke-width="3.2"');
  const panels = g(p("M80 -21 Q45 -9 34 22 Q50 13 65 22 Q69 -7 80 -21 Z",'fill="#c5d9e2" stroke="none"') + p("M80 -21 Q109 -9 126 22 Q141 13 154 22 C143 -6 116 -21 80 -21 Z",'fill="#cadde5" stroke="none"'),'class="rain-walk-canopy-shading"');
  const ribs = g(line("M80 -21 Q44 -7 34 22 M80 -21 Q67 -5 65 22 M80 -21 Q93 -5 95 22 M80 -21 Q116 -7 126 22"),'stroke="#687d87" stroke-width="1.5" fill="none"');
  const canopyOutline = p("M6 22 C17 -6 44 -21 80 -21 C116 -21 143 -6 154 22 Q141 13 126 22 Q110 13 95 22 Q80 13 65 22 Q50 13 34 22 Q20 13 6 22 Z",'fill="none" stroke-width="3.2"');
  const shaft = line("M80 -27 V141 Q80 148 73 148 Q66 148 68 141");
  const umbrella = g(g(shaft,'stroke-width="3.1"')+canopy+panels+ribs+canopyOutline+g(line("M80 -27 V-22"),'stroke-width="3.6"'),'class="rain-walk-umbrella rain-walk-umbrella-back"');
  const foregroundHandle = g(g(line("M80 116 V141 Q80 148 73 148 Q66 148 68 141"),'stroke-width="3.1"'),'class="rain-walk-umbrella rain-walk-handle"');
  const legs = poses[0].legs.map((d,i)=>p(d,`class="rain-walk-leg-${i}" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = p(arm(poses[0]),'class="rain-walk-left-arm" fill="none"') + p("M97 115 Q117 127 80 130",'class="rain-walk-right-arm" fill="none"');
  const hands = g(jugglingPalm(...poses[0].left,0),'class="rain-walk-left-hand"') + g(jugglingPalm(80,130,1),'class="rain-walk-grip"');
  const actorHead = g(head(variant.shape)+face(variant,"calm",true),'class="rain-walk-head"');
  const drops = [9,16,144,151,9,16,144,151,36,60,80,100,124].map((x,i)=>p(`M${x} 0 v5`,`class="rain-walk-drop" style="animation-delay:-${number(i*.137)}s"`)).join("");
  const puddles = [11,149].map((x,i) => `<ellipse cx="${x}" cy="166" rx="6" ry="1.7" fill="#dce8ed" stroke="none" opacity=".5"/><ellipse class="rain-walk-ripple" cx="${x}" cy="166" rx="5" ry="1.5" fill="none" stroke="#7d98a8" stroke-width=".7" style="transform-origin:${x}px 166px;animation-delay:-${i*.37}s"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 撑伞溜达</title>
<desc id="description">正面握住居中的弯柄雨伞，左右脚在各自一侧交替小幅抬起、落下，落地脚固定，脚尖向两侧自然展开，不预设向左或向右走；空手轻摆、偶尔眨眼。伞外两侧垂直落雨，地面出现小涟漪。握点始终贴合手掌，人物和伞完整位于画面内，${s} 秒循环首尾相接。</desc>
<defs><clipPath id="rain-walk-outside"><path d="M4 3 H156 V174 H4 Z M18 49 H142 V174 H18 Z" clip-rule="evenodd"/></clipPath></defs>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${g(drops,'class="rain-walk-rain" clip-path="url(#rain-walk-outside)" fill="none" stroke="#7d98a8" stroke-width="1.1"')}
<ellipse cx="80" cy="166" rx="29" ry="2.1" fill="${stroke}" stroke="none" opacity=".08"/>
${puddles}
${g(legs+g(umbrella+torso+arms+actorHead+foregroundHandle+hands,'class="rain-walk-body"'),'class="rain-walk-character" transform="translate(16 32) scale(.8)"')}
</g>
</svg>\n`;
}

function renderCoffeeWalkSvg(variant) {
  const duration = actionDurations["roam.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const poses = Array.from({length:49}, (_,i) => {
    const phase = (i%16)/16, wave = Math.sin(phase*Math.PI*2), bob = -.9*wave**2;
    return {t:number(i/48*100),bob:number(bob),head:number(.6*Math.sin(i/48*Math.PI*2)),
      left:[number(47+.8*wave),number(138-2*Math.cos(phase*Math.PI*2))],
      cup:[number(.35*wave),number(.45*Math.cos(phase*Math.PI*2)),number(-.5*wave)],
      legs:[frontWalkLeg(phase,69,bob,-1,6),frontWalkLeg((phase+.5)%1,91,bob,1,6)]};
  });
  const arm = (pose,side) => side
    ? `M97 115 Q118 128 ${number(108+pose.cup[0])} ${number(134+pose.cup[1])}`
    : `M63 115 Q44 127 ${pose.left.join(" ")}`;
  const keys = property => poses.map(pose=>`${pose.t}%{${property(pose)}}`).join("");
  const css = `
.coffee-walk-body{animation:coffee-walk-bob ${s}s linear infinite}
.coffee-walk-head,.coffee-walk-left-hand,.coffee-walk-cup-hand,.coffee-walk-steam,.eyes{transform-box:view-box}
.coffee-walk-head{transform-origin:80px 108px;animation:coffee-walk-head ${s}s linear infinite}
.coffee-walk-leg-0{animation:coffee-walk-leg-0 ${s}s linear infinite}
.coffee-walk-leg-1{animation:coffee-walk-leg-1 ${s}s linear infinite}
.coffee-walk-arm-0{animation:coffee-walk-arm-0 ${s}s linear infinite}
.coffee-walk-arm-1{animation:coffee-walk-arm-1 ${s}s linear infinite}
.coffee-walk-left-hand{animation:coffee-walk-left-hand ${s}s linear infinite}
.coffee-walk-cup-hand{transform-origin:108px 134px;animation:coffee-walk-hold ${s}s linear infinite}
.coffee-walk-steam{animation:coffee-walk-steam ${s}s linear infinite;opacity:0}
.coffee-walk-steam-1{animation-delay:-1.25s}
.eyes{transform-origin:80px 78px;animation:coffee-walk-blink ${s}s linear infinite}
@keyframes coffee-walk-bob{${keys(pose=>`translate:0 ${pose.bob}px`)}}
@keyframes coffee-walk-head{${keys(pose=>`rotate:${pose.head}deg`)}}
@keyframes coffee-walk-leg-0{${keys(pose=>`d:path("${pose.legs[0]}")`)}}
@keyframes coffee-walk-leg-1{${keys(pose=>`d:path("${pose.legs[1]}")`)}}
@keyframes coffee-walk-arm-0{${keys(pose=>`d:path("${arm(pose,0)}")`)}}
@keyframes coffee-walk-arm-1{${keys(pose=>`d:path("${arm(pose,1)}")`)}}
@keyframes coffee-walk-left-hand{${keys(pose=>`translate:${number(pose.left[0]-poses[0].left[0])}px ${number(pose.left[1]-poses[0].left[1])}px`)}}
@keyframes coffee-walk-hold{${keys(pose=>`translate:${pose.cup[0]}px ${pose.cup[1]}px;rotate:${pose.cup[2]}deg`)}}
@keyframes coffee-walk-blink{0%,22%,25%,70%,73%,100%{scale:1 1}23%,24%,71%,72%{scale:1 .15}}
@keyframes coffee-walk-steam{0%,50%,100%{translate:0 2px;opacity:0}10%,60%{translate:0 0;opacity:.5}45%,49.99%,95%,99.99%{translate:0 -4px;opacity:0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.coffee-walk-steam{opacity:0}}
`;
  const legs = poses[0].legs.map((d,i)=>p(d,`class="coffee-walk-leg-${i}" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = [0,1].map(side=>p(arm(poses[0],side),`class="coffee-walk-arm-${side}" fill="none"`)).join("");
  const actorHead = g(head(variant.shape)+face(variant,"tired",true),'class="coffee-walk-head"');
  const cupBody = p("M8 -15 H30 L28 10 Q19 15 10 10 Z",'class="coffee-walk-cup-body" fill="#fffaf2"')
    + '<ellipse cx="19" cy="-14" rx="11" ry="2.5" fill="#f4e8d8"/>'
    + '<ellipse cx="19" cy="-13.5" rx="8" ry="1.4" fill="#704c36" stroke="none"/>';
  const handle = p("M8 -10 Q0 -12 0 0 Q0 6 8 3",'class="coffee-walk-cup-handle" fill="none"');
  const steam = ["M22 -20 Q19 -24 23 -29","M29 -20 Q26 -25 30 -32"].map((d,i)=>g(line(d),`class="coffee-walk-steam coffee-walk-steam-${i}" fill="none" stroke="#9a8775" stroke-width="1.6"`)).join("");
  const grip = g(jugglingPalm(0,0,1),'class="coffee-walk-grip"');
  const heldCup = g(g(handle+cupBody+steam+grip,'class="coffee-walk-cup" transform="translate(108 134)" stroke-width="2.7"'),'class="coffee-walk-cup-hand"');
  const leftHand = g(jugglingPalm(...poses[0].left,0),'class="coffee-walk-left-hand"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 咖啡散步</title>
<desc id="description">正面小步散步，左右脚轻轻交替抬起，落地脚位置固定；保留困倦表情，身体和头部轻微起伏，空着的左手自然摆动。右手一直握住咖啡杯柄，杯子随手臂平稳运动，热气缓缓上升。整轮 ${s} 秒，首尾相接，适配不同方向的桌面位移。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="166" rx="27" ry="2.1" fill="${stroke}" stroke="none" opacity=".08"/>
${g(legs+g(torso+arms+actorHead+leftHand+heldCup,'class="coffee-walk-body"'),'class="coffee-walk-character" transform="translate(4 7.25) scale(.95)"')}
</g>
</svg>\n`;
}

function renderBriefcaseWalkSvg(variant) {
  const duration = actionDurations["roam.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const poses = Array.from({length:81}, (_,i) => {
    const phase = (i%16)/16, wave = Math.sin(phase*Math.PI*2), bob = -1.1*wave**2;
    return {t:i/80*100,bob:number(bob),head:number(.35*Math.sin(i/80*Math.PI*2)),
      left:[number(45.5+1.4*wave),number(135-3*Math.cos(phase*Math.PI*2))],
      bag:[number(.6*wave),number(.7*Math.cos(phase*Math.PI*2)),number(1.4*wave)],
      legs:[frontWalkLeg(phase,69,bob,-1,7),frontWalkLeg((phase+.5)%1,91,bob,1,7)]};
  });
  const arm = (pose,side) => side
    ? `M97 115 Q117 132 ${number(131+pose.bag[0])} ${number(127+pose.bag[1])}`
    : `M63 115 Q43 125 ${pose.left.join(" ")}`;
  const keys = property => poses.map(pose=>`${pose.t}%{${property(pose)}}`).join("");
  const css = `
.case-walk-body{animation:case-walk-bob ${s}s linear infinite}
.case-walk-head,.case-walk-left-hand,.case-walk-bag-hand,.eyes{transform-box:view-box}
.case-walk-head{transform-origin:80px 108px;animation:case-walk-head ${s}s linear infinite}
.case-walk-leg-0{animation:case-walk-leg-0 ${s}s linear infinite}
.case-walk-leg-1{animation:case-walk-leg-1 ${s}s linear infinite}
.case-walk-arm-0{animation:case-walk-arm-0 ${s}s linear infinite}
.case-walk-arm-1{animation:case-walk-arm-1 ${s}s linear infinite}
.case-walk-left-hand{animation:case-walk-left-hand ${s}s linear infinite}
.case-walk-bag-hand{transform-origin:131px 127px;animation:case-walk-hold ${s}s linear infinite}
.eyes{transform-origin:80px 82px;animation:case-walk-blink ${s}s linear infinite}
@keyframes case-walk-bob{${keys(pose=>`translate:0 ${pose.bob}px`)}}
@keyframes case-walk-head{${keys(pose=>`rotate:${pose.head}deg`)}}
@keyframes case-walk-leg-0{${keys(pose=>`d:path("${pose.legs[0]}")`)}}
@keyframes case-walk-leg-1{${keys(pose=>`d:path("${pose.legs[1]}")`)}}
@keyframes case-walk-arm-0{${keys(pose=>`d:path("${arm(pose,0)}")`)}}
@keyframes case-walk-arm-1{${keys(pose=>`d:path("${arm(pose,1)}")`)}}
@keyframes case-walk-left-hand{${keys(pose=>`translate:${number(pose.left[0]-poses[0].left[0])}px ${number(pose.left[1]-poses[0].left[1])}px`)}}
@keyframes case-walk-hold{${keys(pose=>`translate:${pose.bag[0]}px ${pose.bag[1]}px;rotate:${pose.bag[2]}deg`)}}
@keyframes case-walk-blink{0%,16%,19%,64%,67%,100%{scale:1 1}17%,18%,65%,66%{scale:1 .15}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
`;
  const legs = poses[0].legs.map((d,i)=>p(d,`class="case-walk-leg-${i}" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = [0,1].map(side=>p(arm(poses[0],side),`class="case-walk-arm-${side}" fill="none"`)).join("");
  const actorHead = g(head(variant.shape)+face(variant,"angry",true),'class="case-walk-head"');
  const handle = p("M-8 10 V4 Q-8 0 -4 0 H4 Q8 0 8 4 V10",'class="case-walk-handle" fill="none"');
  const bagBody = rect(-20,9,40,22,2.8)
    + p("M-20 17 H20",'fill="none"')
    + g(rect(-3,14,6,6,1.1),'class="case-walk-latch" fill="#5c5b56" stroke-width="1.2"')
    + g(line("M-16 27 H15 M16 12 V28"),'fill="none" stroke="#938b7f" stroke-width=".9" opacity=".5"');
  const grip = g(jugglingPalm(0,0,1),'class="case-walk-grip"');
  const heldBag = g(g(g(handle+g(bagBody,'class="case-walk-bag-body"'),'fill="#eee9e0" stroke-width="2.7"')+grip,'class="case-walk-bag" transform="translate(131 127)"'),'class="case-walk-bag-hand"');
  const leftHand = g(jugglingPalm(...poses[0].left,0),'class="case-walk-left-hand"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 急急散步</title>
<desc id="description">保留急躁神态，正面快速小步走，双脚各自在身体一侧交替抬起与落地，支撑脚位置固定，不预设移动方向；空手自然摆动，身体轻微起伏。右手始终抓住公文包提柄，包在身旁跟随手臂轻摆，不挡住双腿。完整循环 ${s} 秒，首尾连续。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="166" rx="29" ry="2.1" fill="${stroke}" stroke="none" opacity=".08"/>
${g(legs+g(torso+arms+actorHead+leftHand+heldBag,'class="case-walk-body"'),'class="case-walk-character" transform="translate(4 7.25) scale(.95)"')}
</g>
</svg>\n`;
}

function renderPhoneWaitingSvg(variant) {
  const duration = actionDurations["notification.svg"], s = duration / 1000, eyeY = variant.shape === "wide" ? 82 : 78;
  const poses = [[0,0,0,0],[14,0,0,0],[30,-3,-12,-7],[60,-3,-12,-7],[78,0,0,0],[100,0,0,0]];
  const keys = property => poses.map(([time,x,y,angle]) => `${time}%{${property(x,y,angle)}}`).join("");
  const css = `${stageAnimationCss(duration)}
.phone-wait-actor{animation:phone-wait-breathe ${s}s ease-in-out infinite}
.phone-arm-right,.phone-hand-right,.phone-thumb,.phone-wait-head,.eyes{transform-box:view-box}
.phone-arm-right{transform-origin:97px 115px;animation:phone-wait-arm ${s}s ease-in-out infinite}
.phone-hand-right{transform-origin:114px 134px;animation:phone-wait-hold ${s}s ease-in-out infinite}
.phone-thumb{transform-origin:114px 134px;animation:phone-wait-tap ${s}s ease-in-out infinite}
.phone-wait-head{transform-origin:80px 105px;animation:phone-wait-look ${s}s ease-in-out infinite}
.eyes{transform-origin:80px ${eyeY}px;animation:phone-wait-gaze ${s}s ease-in-out infinite,phone-wait-blink ${s}s linear infinite}
.accent-question{animation:phone-wait-question ${s}s ease-in-out infinite}
.waiting-dot{animation:phone-wait-dot ${s}s linear infinite}
@keyframes phone-wait-breathe{0%,14%,78%,100%{translate:0 0}30%,60%{translate:0 -1px}}
@keyframes phone-wait-arm{${keys((x,y)=>`scale:${(17+x)/17} ${(19+y)/19}`)}}
@keyframes phone-wait-hold{${keys((x,y,angle)=>`translate:${x}px ${y}px;rotate:${angle}deg`)}}
@keyframes phone-wait-tap{0%,43%,56%,100%{rotate:0deg}49%{rotate:14deg}}
@keyframes phone-wait-look{0%,14%,78%,100%{rotate:-2deg}30%,60%{rotate:5deg}}
@keyframes phone-wait-gaze{0%,14%,78%,100%{translate:0 0}30%,60%{translate:3px 1px}}
@keyframes phone-wait-blink{0%,17%,20%,83%,86%,100%{scale:1 1}18%,19%,84%,85%{scale:1 .12}}
@keyframes phone-wait-question{0%,14%,85%,100%{opacity:.75}30%,65%{opacity:0}}
@keyframes phone-wait-dot{0%,20%,78%,100%{opacity:.45}36%,60%{opacity:1}}
@media(prefers-reduced-motion:reduce){.stage,.phone-wait-actor,.phone-arm-right,.phone-hand-right,.phone-thumb,.phone-wait-head,.eyes,.accent-question,.waiting-dot{animation:none}}
`;
  const moods = variant.id === "mobi-b" ? ["tired","confused","confused","tired"] : variant.id === "mobi-c" ? ["angry","confused","grit","angry"] : ["confused","surprised","surprised","confused"];
  const heads = moods.map((mood,i) => g(head(variant.shape) + face(variant,mood,i===0), `class="stage stage-${i}" aria-label="${mood === "tired" ? "困倦地等待回复" : ["angry","grit"].includes(mood) ? "不耐烦地等待回复" : mood === "surprised" ? "惊讶地查看手机" : "疑惑地等待回复"}"`)).join("");
  const legs = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = g(line("M63 115 Q46 124 48 137"),'class="phone-arm-left"') + g(line("M97 115 Q111 128 114 134"),'class="phone-arm-right"');
  const phone = g(rect(113,107,23,39,4.5) + rect(117,113,15,24,2,'class="phone-screen" fill="#edf1f5" stroke-width="1.4"') + g(line("M121 110 H127"),'stroke-width="1.2"') + dot(124.5,142,1.2) + [120.5,124.5,128.5].map(x => `<circle class="waiting-dot" cx="${x}" cy="125" r="1.15" fill="#65727d" stroke="none"/>`).join(""),'class="held-phone" stroke-width="2.8"');
  const grip = g(p("M-4 -2 Q-8 -4 -6 -8 Q-4 -10 -2 -7 L1 -3 L4 -5 Q7 -5 7 -2 L5 3 Q2 7 -3 4 Q-6 3 -4 -2 Z"),'class="phone-grip" transform="translate(114 134)" stroke-width="2.8"');
  const thumb = g(p("M113 135 Q117 129 120 129 Q123 130 120 133 L117 137",'stroke-width="2.4"'),'class="phone-thumb"');
  const hands = g(phone+grip+thumb,'class="phone-hand-right"') + g(jugglingPalm(48,137,0),'class="phone-hand-left"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · ${["等待回复","困倦等待","催促回复"][variant.character]}</title>
<desc id="description">${variant.id === "mobi-b" ? "困倦地等待回复，抬近手机时疑惑地睁开眼睛" : variant.id === "mobi-c" ? "急躁地等待回复，抬近手机查看后皱眉轻点屏幕" : "歪头疑惑地等待，抬近手机时睁大眼睛、抬眉微张嘴"}；右手始终握住手机，拇指轻点一下后再放下等待。问号轻轻出现，手机和手同步移动。完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${g(legs+torso+arms+g(heads,'class="phone-wait-head"')+hands+accentArt("question"),'class="phone-wait-actor"')}
</g>
</svg>\n`;
}

function renderCelebrationSvg(variant, screen = false) {
  const duration = variant.attentionDurationMs || actionDurations["attention.svg"], s = duration / 1000;
  const pose = [[0,0],[12.5,0],[18.75,1],[90,1],[97,0],[100,0]];
  const poseKeys = value => pose.map(([time,amount])=>`${time}%{${value(amount)}}`).join("");
  const leftPose = [[0,111,140],[2.5,111,140],[10,90,149],[12.5,90,149],[18.75,32,95],[90,32,95],[97,111,140],[100,111,140]];
  const leftKeys = value => leftPose.map(([time,x,y])=>`${time}%{${value(x,y)}}`).join("");
  const pullPose = [[0,0],[2.5,0],[10,1],[12.5,1],[97,0],[100,0]];
  const jumpKeys = ["0%{translate:0 0}"], legKeys = ["0%{rotate:0deg}"];
  for(let hop=0;hop<8;hop++){
    const start=15+hop*9.375;
    jumpKeys.push(`${start}%{translate:0 0}`,`${start+1.2}%{translate:0 2px}`,`${start+4.3}%{translate:0 -14px}`,`${start+8}%{translate:0 0}`);
    legKeys.push(`${start}%{rotate:0deg}`,`${start+4.3}%{rotate:13deg}`,`${start+8}%{rotate:0deg}`);
  }
  jumpKeys.push("90%,100%{translate:0 0}");
  legKeys.push("90%,100%{rotate:0deg}");
  const confetti = screen ? { css: "", markup: "" } : renderConfettiLayer(160, 180, duration);
  const css=`.party-actor{animation:party-jump ${s}s ease-in-out infinite}
.party-arm,.party-leg,.eyes,.confetti{transform-box:view-box}
.party-arm-left{transform-origin:63px 115px;animation:party-left-arm ${s}s ease-in-out infinite}
.party-arm-right{transform-origin:97px 115px;animation:party-right-arm ${s}s ease-in-out infinite}
.party-hand-left{animation:party-left-hand ${s}s ease-in-out infinite}
.party-hand-right{animation:party-right-hand ${s}s ease-in-out infinite}
.party-pull-cord{transform-box:view-box;transform-origin:114px 135px;animation:party-pull ${s}s ease-in-out infinite,party-cord-visible ${s}s linear infinite}
.party-loose-cord{opacity:0;animation:party-loose-visible ${s}s linear infinite}
.party-leg-left{transform-origin:69px 145px;animation:party-kick ${s}s ease-in-out infinite}
.party-leg-right{transform-origin:91px 145px;animation:party-kick-right ${s}s ease-in-out infinite}
.eyes{transform-origin:80px ${variant.shape === "wide" ? 82 : 78}px;animation:party-blink ${s}s linear infinite}
.confetti{opacity:0;transform-origin:132px 108px}
@keyframes party-jump{${jumpKeys.join("")}}
@keyframes party-left-arm{${leftKeys((x,y)=>`scale:${(x-63)/48} ${(y-115)/25}`)}}
@keyframes party-right-arm{${poseKeys(a=>`scale:${1+a*13/18} ${1-a*37/17}`)}}
@keyframes party-left-hand{${leftKeys((x,y)=>`translate:${x-111}px ${y-140}px`)}}
@keyframes party-right-hand{${poseKeys(a=>`translate:${13*a}px ${-37*a}px`)}}
@keyframes party-pull{${pullPose.map(([time,a])=>`${time}%{scale:${1+7*a} ${1+1.8*a}}`).join("")}}
@keyframes party-cord-visible{0%,12.5%,97%,100%{opacity:1}12.51%,96.99%{opacity:0}}
@keyframes party-loose-visible{0%,12.5%,97%,100%{opacity:0}12.51%,96.99%{opacity:1}}
@keyframes party-kick{${legKeys.join("")}}
@keyframes party-kick-right{${legKeys.map(key=>key.replace("rotate:13deg","rotate:-13deg")).join("")}}
@keyframes party-blink{0%,18%,21%,43%,46%,68%,71%,93%,96%,100%{scale:1 1}19%,20%,44%,45%,69%,70%,94%,95%{scale:1 .12}}
${confetti.css}
@media(prefers-reduced-motion:reduce){.party-actor,.party-arm,.party-hand-left,.party-hand-right,.party-leg,.party-pull-cord,.party-loose-cord,.eyes,.confetti{animation:none}.confetti,.party-loose-cord{opacity:0}}
`;
  const legs=g(line("M69 145 L65 163 L57 163"),'class="party-leg party-leg-left"')+g(line("M91 145 L95 163 L104 163"),'class="party-leg party-leg-right"');
  const torso=p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms=g(line("M63 115 Q81 130 111 140"),'class="party-arm party-arm-left"')+g(line("M97 115 Q118 125 115 132"),'class="party-arm party-arm-right"');
  const pullCord=p("M114 135 Q112 137 111 140",'class="party-pull-cord" fill="none" stroke-width="1.8" vector-effect="non-scaling-stroke"');
  const looseCord=p("M114 135 Q112 141 116 145 Q120 146 119 142",'class="party-loose-cord" fill="none" stroke-width="1.3"');
  const popper=g(p("M114 135 L125 103 Q136 101 140 113 Z",'fill="#efbb9b"')+g(line("M119 123 L128 130 M122 115 L134 122"),'stroke="#efc05c" stroke-width="3"')+'<ellipse cx="132" cy="108" rx="9" ry="4" transform="rotate(35 132 108)" fill="#f5d784"/>'+looseCord,'class="party-popper" stroke-width="2.2"');
  const hands=g(jugglingPalm(111,140,0),'class="party-hand party-hand-left"')+g(popper+jugglingPalm(115,132,1),'class="party-hand party-hand-right"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · ${screen ? "整屏彩纸雨" : "框内彩纸雨"}</title>
<desc id="description">右手握住礼花筒，左手向左下方拉开拉绳，${screen ? "彩纸从显示器顶部进入，由上往下铺满整个屏幕" : "彩纸从表情框的整个顶边分批飘落，由上往下铺满表情框并落出下沿"}；随后开心举手连跳八下，跳跃持续约六秒，最后回到起始姿势；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${g(legs+torso+arms+head(variant.shape)+face(variant,"happy",true)+pullCord+hands,'class="party-actor"')}
${confetti.markup}
</g>
</svg>\n`;
}

function renderInterruptedCoffeeSvg(variant) {
  const duration = variant.errorDurationMs, s = duration / 1000;
  const left = [[0,55,108],[6,55,108],[12,56,105],[21,56,105],[29,55,108],[33.333333,50,128],[38,31,143],[42,22,150],[44,22,150],[49,46,158],[54,53,158],[100,53,158]];
  const cup = [...left.filter(([t]) => t <= 44), [100,22,150]];
  const right = [[0,113,137],[29,113,137],[33.333333,120,125],[38,131,121],[42,136,128],[44,131,138],[46,133,143],[49,130,140],[54,119,154],[60,99,154],[66.666666,96,154]];
  for (let t = 68; t <= 98; t += 2) right.push([t,96,t % 4 === 0 ? 151 : 154]);
  right.push([100,96,154]);
  const palmMotion = (points,x,y) => points.map(([t,px,py]) => `${t}%{translate:${px-x}px ${py-y}px}`).join("");
  const armPath = (side,x,y) => `M${side ? 97 : 63} 115 Q${((side ? 97 : 63)+x)/2+(side ? 8 : -8)} ${(115+y)/2} ${x} ${y}`;
  const armMotion = (points,side) => points.map(([t,x,y]) => `${t}%{d:path("${armPath(side,x,y)}")}`).join("");
  const laptopPositions = [[0,130,-65,-24],[33.333333,130,-65,-24],[38,58,-38,-15],[42,26,-24,-6],[44,12,-16,0],[46,14,-11,0],[49,11,-14,0],[54,0,0,0],[100,0,0,0]];
  const css = `${stageAnimationCss(duration,3)}
.interrupt-arm,.interrupt-hand,.interrupt-cup,.interrupt-laptop,.interrupt-head,.eyes{transform-box:view-box}
.interrupt-arm-left{animation:interrupt-left-arm ${s}s linear infinite}
.interrupt-arm-right{animation:interrupt-right-arm ${s}s linear infinite}
.interrupt-hand-left{animation:interrupt-left-hand ${s}s linear infinite}
.interrupt-hand-right{animation:interrupt-right-hand ${s}s linear infinite}
.interrupt-cup{animation:interrupt-cup ${s}s linear infinite}
.interrupt-cup-tilt{transform-origin:0 0;animation:interrupt-sip ${s}s ease-in-out infinite}
.interrupt-steam{animation:interrupt-steam ${s}s linear infinite}
.interrupt-laptop{transform-origin:80px 145px;animation:interrupt-laptop ${s}s linear infinite,interrupt-laptop-visible ${s}s step-end infinite;opacity:0}
.interrupt-head{transform-origin:80px 104px;animation:interrupt-head ${s}s ease-in-out infinite}
.eyes{transform-origin:80px 78px;animation:interrupt-blink ${s}s linear infinite}
.stage-1 .eyes{translate:3px 2px}.stage-2 .eyes{translate:1px 3px}
.interrupt-code{transform-box:view-box;transform-origin:60px 130px;animation:interrupt-code ${s}s linear infinite}
.interrupt-cursor{animation:interrupt-cursor ${s}s step-end infinite}
.interrupt-key{animation:interrupt-key ${s}s step-end infinite}
@keyframes interrupt-left-arm{${armMotion(left,0)}}
@keyframes interrupt-right-arm{${armMotion(right,1)}}
@keyframes interrupt-left-hand{${palmMotion(left,55,108)}}
@keyframes interrupt-right-hand{${palmMotion(right,119,154)}}
@keyframes interrupt-cup{${palmMotion(cup,55,108)}}
@keyframes interrupt-sip{0%,6%,29%{rotate:-8deg}12%,21%{rotate:-14deg}38%,100%{rotate:0deg}}
@keyframes interrupt-steam{0%,12%,24%{opacity:.5}6%,18%{opacity:.85}33.333333%,100%{opacity:0}}
@keyframes interrupt-laptop{${laptopPositions.map(([t,x,y,angle]) => `${t}%{translate:${x}px ${y}px;rotate:${angle}deg}`).join("")}}
@keyframes interrupt-laptop-visible{0%{opacity:0}33.333333%{opacity:1}100%{opacity:0}}
@keyframes interrupt-head{0%,29%{rotate:-3deg}35%,42%{rotate:4deg}46%{rotate:-3deg}54%,100%{rotate:1deg}}
@keyframes interrupt-blink{0%,18%,21%,32%,65%,68%,87%,90%,100%{scale:1 1}19%,20%,66%,67%,88%,89%{scale:1 .15}}
@keyframes interrupt-code{0%,60%{scale:0 1}68%{scale:.25 1}78%{scale:.55 1}88%,100%{scale:1 1}}
@keyframes interrupt-cursor{0%,60%,70%,78%,86%,94%{opacity:0}64%,74%,82%,90%,98%,100%{opacity:1}}
@keyframes interrupt-key{0%,66.666666%,70%,74%,78%,82%,86%,90%,94%,98%,100%{fill:${paper}}68%,72%,76%,80%,84%,88%,92%,96%{fill:#c8c8c2}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}.interrupt-laptop{opacity:0}.interrupt-code{scale:0 1}}
`;
  const heads = ["tired","shock","tired"].map((mood,i) => g(head(variant.shape) + face(variant,mood,i===0) + (i===1 ? p("M119 84 Q130 97 123 99 Q116 99 119 84 Z", 'stroke-width="2.3"') : ""), `class="stage stage-${i}" aria-label="${["正在喝咖啡","突然接住飞来的电脑","托住电脑敲键盘"][i]}"`)).join("");
  const body = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163") + p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = p(armPath(0,55,108),'class="interrupt-arm interrupt-arm-left" fill="none"') + p(armPath(1,113,137),'class="interrupt-arm interrupt-arm-right" fill="none"');
  const cupArt = p("M7 -11 H27 L25 8 Q17 14 9 8 Z") + p("M7 -6 Q-6 -9 -4 2 Q-3 8 8 4",'fill="none"') + '<ellipse cx="17" cy="-8" rx="7.5" ry="2" fill="#6b4a34" stroke-width="1.2"/>' + g(line("M13 -17 Q8 -23 14 -28 M23 -18 Q18 -24 24 -30"),'class="interrupt-steam" stroke-width="1.8"');
  const coffeeCup = g(g(cupArt,'class="interrupt-cup-tilt"'), 'class="interrupt-cup" transform="translate(55 108)" stroke-width="2.7" aria-label="放在身旁的咖啡杯"');
  const keyboard = [56,64,72,80,88,96].map(x => rect(x,151,5.5,3,1)).join("");
  const screen = g(line("M60 130 H88 M60 134 H98 M60 138 H83 M60 142 H93"),'class="interrupt-code" stroke-width="1.7" fill="none"') + p("M96 141 V144",'class="interrupt-cursor" stroke-width="1.5" fill="none"');
  const laptop = g(p("M48 121 H111 L106 148 H53 Z") + rect(54,125,50,20,2) + screen + p("M53 148 H106 L119 158 H41 Z") + g(keyboard,'class="interrupt-key" stroke-width="1"'), 'class="interrupt-laptop" stroke-width="3" aria-label="从右侧飞来的电脑"');
  const hands = g(jugglingPalm(55,108,0),'class="interrupt-hand interrupt-hand-left"') + g(jugglingPalm(119,154,1),'class="interrupt-hand interrupt-hand-right"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 突然来活</title>
<desc id="description">正在喝咖啡，电脑突然从右侧飞来；放下杯子并伸手接住，随后左手托着电脑、右手敲键盘。喝咖啡、接电脑、敲键盘各约 ${s/3} 秒，整轮 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${body}${arms}${g(heads,'class="interrupt-head"')}${coffeeCup}${laptop}${hands}
</g>
</svg>\n`;
}

function renderRageThrowingSvg(variant) {
  const duration = variant.errorDurationMs, s = duration / 1000;
  const destinations = [[-35,35],[195,25],[-45,150],[195,160],[45,-45],[120,-45],[-40,205],[195,205],[-35,-35],[195,80],[68,-45],[195,190],[-35,205]];
  const kinds = ["paper","cup","keyboard","folder","book","paper","mouse","cup","book","pen","folder","keyboard","paper"];
  const items = destinations.map(([x,y],i) => ({i,side:i%2,start:50+i*3,release:53+i*3,end:62+i*3,x,y,kind:kinds[i]}));
  const pickup = side => [side ? 112 : 48,139], wind = side => [side ? 105 : 55,146], release = side => [side ? 139 : 21,107];
  const hands = [
    [[0,53,150],[20,53,150],[25,25,108],[28,23,96],[32,31,115],[36,22,99],[40,29,114],[44,22,100],[48,48,139]],
    [[0,107,150],[20,107,150],[25,135,108],[28,129,115],[32,137,97],[36,130,114],[40,138,98],[44,131,115],[48,112,139]],
  ];
  for (const item of items) hands[item.side].push([item.start,...pickup(item.side)],[item.start+1.2,...wind(item.side)],[item.release,...release(item.side)],[item.release+1.5,...pickup(item.side)]);
  hands.forEach((points,side) => points.push([100,...pickup(side)]));
  const armPath = (side,x,y) => `M${side ? 97 : 63} 115 Q${((side ? 97 : 63)+x)/2+(side ? 8 : -8)} ${(115+y)/2} ${x} ${y}`;
  const handCss = hands.map((points,side) => {
    const [x,y] = side ? [107,150] : [53,150];
    return `.rage-arm-${side}{animation:rage-arm-${side} ${s}s linear infinite}.rage-hand-${side}{animation:rage-hand-${side} ${s}s linear infinite}
@keyframes rage-arm-${side}{${points.map(([t,px,py]) => `${t}%{d:path("${armPath(side,px,py)}")}`).join("")}}
@keyframes rage-hand-${side}{${points.map(([t,px,py]) => `${t}%{translate:${px-x}px ${py-y}px}`).join("")}}`;
  }).join("\n");
  const itemArt = kind => {
    if (kind === "cup") return p("M-7 -9 H7 L6 8 Q0 12 -6 8 Z") + p("M7 -5 Q17 -7 15 1 Q14 5 7 4",'fill="none"') + line("M-5 -5 H5");
    if (kind === "keyboard") return rect(-15,-5,30,10,2) + g(line("M-11 -1 H11 M-9 2 H9 M-7 -3 V-1 M0 -3 V-1 M7 -3 V-1"),'stroke-width="1.1"');
    if (kind === "folder") return p("M-12 -7 H-3 L0 -10 H11 V9 H-12 Z") + line("M-8 -2 H7");
    if (kind === "book") return rect(-9,-12,18,24,1) + line("M-5 -11 V11 M-1 -5 H5 M-1 -1 H5");
    if (kind === "mouse") return p("M-5 -2 Q-5 -10 0 -10 Q6 -10 6 -2 V5 Q6 10 0 10 Q-5 10 -5 5 Z") + line("M0 -7 V-2");
    if (kind === "pen") return p("M-13 -2 H9 L14 0 L9 2 H-13 Z") + line("M8 -2 V2");
    return p("M-8 -11 H3 L9 -5 V11 H-8 Z") + line("M3 -11 V-5 H9 M-4 -1 H5 M-4 4 H3");
  };
  const itemCss = items.map(item => {
    const start = pickup(item.side), back = wind(item.side), origin = release(item.side), sign = item.side ? 1 : -1;
    const points = [[0,...start,0],[item.start,...start,0],[item.start+1.2,...back,sign*-18],[item.release,...origin,sign*24]];
    for (const u of [.22,.55,1]) points.push([item.release+(item.end-item.release)*u,origin[0]+(item.x-origin[0])*u,origin[1]+(item.y-origin[1])*u-4*(item.y>150 ? 23 : 13)*u*(1-u),sign*(24+u*(290+item.i*19))]);
    points.push([100,item.x,item.y,sign*(314+item.i*19)]);
    return `.rage-item-${item.i}{animation:rage-flight-${item.i} ${s}s linear infinite,rage-visible-${item.i} ${s}s step-end infinite}
@keyframes rage-flight-${item.i}{${points.map(([t,x,y,angle]) => `${t}%{translate:${x}px ${y}px;rotate:${angle}deg}`).join("")}}
@keyframes rage-visible-${item.i}{0%{opacity:0}${item.start}%{opacity:1}${item.end}%,100%{opacity:0}}`;
  }).join("\n");
  const css = `.stage-0{opacity:1;animation:rage-discover ${s}s step-end infinite}.stage-1{opacity:0;animation:rage-wave ${s}s step-end infinite}.stage-2{opacity:0;animation:rage-throw ${s}s step-end infinite}
@keyframes rage-discover{0%{opacity:1}25%,100%{opacity:0}}
@keyframes rage-wave{0%{opacity:0}25%{opacity:1}50%,100%{opacity:0}}
@keyframes rage-throw{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
.rage-arm,.rage-hand,.rage-head,.rage-item,.eyes{transform-box:view-box}
.rage-head{transform-origin:80px 104px;animation:rage-head ${s}s ease-in-out infinite}
.eyes{transform-origin:80px 82px;animation:rage-blink ${s}s linear infinite}
.rage-item{transform-origin:0 0;opacity:0}
${handCss}
${itemCss}
@keyframes rage-head{0%,20%{rotate:-3deg}25%,32%,40%,48%{rotate:3deg}28%,36%,44%{rotate:-3deg}50%,56%,62%,68%,74%,80%,86%,92%,100%{rotate:-2deg}53%,59%,65%,71%,77%,83%,89%,95%{rotate:2deg}}
@keyframes rage-blink{0%,16%,19%,39%,42%,64%,67%,88%,91%,100%{scale:1 1}17%,18%,40%,41%,65%,66%,89%,90%{scale:1 .15}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}.rage-item{opacity:0}}
`;
  const heads = ["angry","rage","rage"].map((mood,i) => g(head(variant.shape) + face(variant,mood,i===0), `class="stage stage-${i}" aria-label="${["发现电脑报错","气得挥手","双手交替把东西到处扔"][i]}"`)).join("");
  const body = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163") + p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = hands.map((points,side) => p(armPath(side,points[0][1],points[0][2]),`class="rage-arm rage-arm-${side}" fill="none"`)).join("");
  const palms = hands.map((points,side) => g(jugglingPalm(points[0][1],points[0][2],side),`class="rage-hand rage-hand-${side}"`)).join("");
  const desk = g(line("M37 160 H123 M44 161 V169 M116 161 V169"),'class="rage-desk" stroke-width="2.4"');
  const laptop = g(p("M48 123 H110 L106 150 H53 Z") + rect(54,127,50,18,2) + line("M74 131 L87 142 M87 131 L74 142") + p("M53 150 H106 L119 159 H41 Z") + g(line("M57 154 H101"),'stroke-width="1.8"'),'class="rage-laptop" stroke-width="3"');
  const flying = items.map(item => g(itemArt(item.kind),`class="rage-item rage-item-${item.i}" aria-label="${item.kind}" stroke-width="2.2"`)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 疯狂摔物</title>
<desc id="description">发现报错 ${s/4} 秒、气得挥手 ${s/4} 秒，随后持续 ${s/2} 秒双手交替乱扔纸张、杯子、键盘、文件夹、书、鼠标和笔；十三件物品从手上甩出，旋转飞向画面各处，没有低头收场；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${body}${arms}${g(heads,'class="rage-head"')}${desk}${laptop}${flying}${palms}
</g>
</svg>\n`;
}

function renderStretchCoffeeSvg(variant) {
  const duration = variant.yawningDurationMs, s = duration / 1000;
  const left = [[0,46,136],[12,22,54],[36,22,54],[50,46,136],[100,46,136]];
  const right = [[0,111,137],[12,140,53],[36,140,53],[50,146,128],[56,146,128],[68,109,111],[82,109,111],[90,146,128],[94,146,128],[98,111,137],[100,111,137]];
  const cupPositions = [[0,146,128],[56,146,128],[68,109,111],[82,109,111],[90,146,128],[100,146,128]];
  const armPath = (side,x,y) => `M${side ? 97 : 63} 115 Q${((side ? 97 : 63)+x)/2+(side ? 8 : -8)} ${(115+y)/2} ${x} ${y}`;
  const motion = [left,right].map((points,side) => {
    const [x,y] = side ? [111,137] : [46,136];
    return `.refill-arm-${side}{animation:refill-arm-${side} ${s}s linear infinite}.refill-hand-${side}{animation:refill-hand-${side} ${s}s linear infinite}
@keyframes refill-arm-${side}{${points.map(([t,px,py]) => `${t}%{d:path("${armPath(side,px,py)}")}`).join("")}}
@keyframes refill-hand-${side}{${points.map(([t,px,py]) => `${t}%{translate:${px-x}px ${py-y}px}`).join("")}}`;
  }).join("\n");
  const css = `${stageAnimationCss(duration,2)}
.refill-arm,.refill-hand,.refill-cup,.refill-head,.eyes{transform-box:view-box}
${motion}
.refill-head{transform-origin:80px 104px;animation:refill-head ${s}s ease-in-out infinite}
.eyes{transform-origin:80px 78px;animation:refill-blink ${s}s linear infinite}
.refill-cup{animation:refill-cup ${s}s linear infinite}
.refill-cup-tilt{transform-box:view-box;transform-origin:0 0;animation:refill-sip ${s}s ease-in-out infinite}
.refill-steam{animation:refill-steam ${s}s ease-in-out infinite}
@keyframes refill-cup{${cupPositions.map(([t,x,y]) => `${t}%{translate:${x-146}px ${y-128}px}`).join("")}}
@keyframes refill-head{0%,50%,94%,100%{rotate:0deg}12%,36%{rotate:-4deg}68%,82%{rotate:-3deg}}
@keyframes refill-sip{0%,56%,90%,100%{rotate:0deg}68%,82%{rotate:-10deg}}
@keyframes refill-blink{0%,16%,19%,46%,49%,83%,86%,100%{scale:1 1}17%,18%,47%,48%,84%,85%{scale:1 .15}}
@keyframes refill-steam{0%,50%,100%{opacity:.45}25%,75%{opacity:.8}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}}
`;
  const heads = ["tired","tired"].map((mood,i) => g(head(variant.shape) + face(variant,mood,i===0), `class="stage stage-${i}" aria-label="${["空手伸懒腰","从桌上拿起咖啡喝"][i]}"`)).join("");
  const body = line("M69 145 L65 163 L57 163 M91 145 L95 163 L104 163") + p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = p(armPath(0,46,136),'class="refill-arm refill-arm-0" fill="none"') + p(armPath(1,111,137),'class="refill-arm refill-arm-1" fill="none"');
  const cupArt = p("M-27 -14 H-7 L-9 8 Q-17 14 -25 8 Z") + p("M-7 -9 Q6 -12 6 -2 Q5 6 -8 4",'fill="none"') + '<ellipse cx="-17" cy="-11" rx="7.5" ry="2" fill="#6b4a34" stroke-width="1.2"/>' + g(line("M-22 -20 Q-27 -26 -21 -33 M-13 -20 Q-18 -27 -12 -35"),'class="refill-steam" stroke-width="1.8"');
  const cup = g(g(cupArt,'class="refill-cup-tilt"'),'class="refill-cup" transform="translate(146 128)" stroke-width="2.7" aria-label="从桌上拿起并放回的咖啡杯"');
  const table = g(rect(111,140,44,4,2)+line("M116 145 V166 M151 145 V166 M116 158 H151"),'class="refill-table" stroke-width="2.6" aria-label="放咖啡的小桌子"');
  const hands = g(jugglingPalm(46,136,0),'class="refill-hand refill-hand-0"') + g(jugglingPalm(111,137,1),'class="refill-hand refill-hand-1"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 伸腰续命</title>
<desc id="description">先空手伸懒腰，再从身旁桌上握住杯柄、端起咖啡喝，喝完放回桌上并松手；每段约 ${s/2} 秒，整轮 ${s} 秒。杯子在伸懒腰期间始终放在桌上，拿起和放下时与右手同步，首尾回到相同姿势。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${body}${arms}${g(heads,'class="refill-head"')}${table}${cup}${hands}
</g>
</svg>\n`;
}

function renderCardboardRestSvg(variant) {
  const baseDuration = actionDurations["collapsing.svg"];
  const duration = variant.collapsingDurationMs || baseDuration, s = duration / 1000;
  // Preserve the opening and lying-down speed; add time only to the final rest.
  const at = percent => percent === 100 ? 100 : Number((percent * baseDuration / duration).toFixed(6));
  // One pose drives the body, shoulders and palms, including the crouch and roll.
  const poses = [
    {t:0,x:-18,y:0,a:0,shift:0,l:[100,134],r:[130,123],legs:[69,145,65,163,57,163,91,145,95,163,104,163]},
    {t:6,x:-18,y:0,a:0,shift:0,l:[100,134],r:[124,129],legs:[69,145,65,163,57,163,91,145,95,163,104,163]},
    {t:12,x:-18,y:0,a:0,shift:0,l:[100,134],r:[146,111],legs:[69,145,65,163,57,163,91,145,95,163,104,163]},
    {t:20,x:-7,y:8,a:0,shift:0,l:[60,114],r:[149,104],legs:[69,145,65,155,57,155,91,145,95,155,104,155]},
    {t:40,x:6,y:14,a:0,shift:0,l:[16,152],r:[142,151],legs:[69,145,55,150,47,150,91,145,105,150,113,150]},
    {t:48,x:38,y:-8,a:-28,shift:-6,l:null,r:[120,140],legs:[63,145,51,152,43,154,85,145,91,154,86,157]},
    {t:53,x:44,y:-18,a:-48,shift:-11.5,l:null,r:[93,137.5],legs:[57.5,145,49,154.5,40,156.5,79.5,145,76,155.5,66.5,159.5]},
    {t:58,x:50,y:-28,a:-68,shift:-17,l:null,r:[66,135],legs:[52,145,47,157,37,159,74,145,61,157,47,162]},
    {t:66,x:50,y:-23,a:-90,shift:-20,l:[38,103],r:[58,133],legs:[49,145,45,159,37,159,71,145,53,158,37,163]},
    {t:100,x:50,y:-23,a:-90,shift:-20,l:[38,103],r:[58,133],legs:[49,145,45,159,37,159,71,145,53,158,37,163]},
  ].map(pose => ({ ...pose, t: at(pose.t) }));
  // Plant the supporting palm on the board while the body turns above it.
  for (const pose of poses) if (!pose.l) {
    const angle = -pose.a * Math.PI / 180, dx = 83-pose.x-80, dy = 165-pose.y-145;
    pose.l = [80+Math.cos(angle)*dx-Math.sin(angle)*dy,145+Math.sin(angle)*dx+Math.cos(angle)*dy];
  }
  const torso = dx => `M${65+dx} 106 Q${58+dx} 118 ${60+dx} 143 Q${60+dx} 149 ${70+dx} 148 L${91+dx} 148 Q${101+dx} 149 ${101+dx} 140 Q${101+dx} 119 ${95+dx} 107 Z`;
  const legs = values => `M${values[0]} ${values[1]} L${values[2]} ${values[3]} L${values[4]} ${values[5]} M${values[6]} ${values[7]} L${values[8]} ${values[9]} L${values[10]} ${values[11]}`;
  const arm = (pose,side) => {
    const [x,y] = side ? pose.r : pose.l, sx = (side ? 97 : 63)+pose.shift;
    return `M${sx} 115 Q${(sx+x)/2+(side ? 8 : -8)} ${(115+y)/2} ${x} ${y}`;
  };
  const panelData = [
    {name:"front",fill:"#e1bf93",closed:"M70 132 L101 143 L101 168 L70 157 Z",open:"M70 132 L101 143 L104 160 L69 160 Z",flat:"M22 166 L79 166 L79 173 L17 173 Z"},
    {name:"right",fill:"#d4ae7b",closed:"M101 143 L131 132 L131 157 L101 168 Z",open:"M101 143 L139 136 L147 159 L104 160 Z",flat:"M79 166 L143 166 L152 173 L79 173 Z"},
    {name:"flap-left",fill:"#efd6b0",closed:"M70 132 L101 122 L116 127 L85 138 Z",open:"M70 132 L101 122 L80 108 L53 122 Z",flat:"M8 165 L32 159 L79 166 L22 166 Z"},
    {name:"flap-right",fill:"#e9cda3",closed:"M85 138 L116 127 L131 132 L101 143 Z",open:"M85 138 L116 127 L142 112 L132 139 Z",flat:"M79 166 L133 159 L148 165 L143 166 Z"},
  ];
  const phaseCss = [[0,20],[20,40],[40,66],[66,100]].map(bounds => bounds.map(at)).map(([start,end],i) => {
    const key = i===0 ? `0%{opacity:1}${end}%,100%{opacity:0}` : `0%{opacity:0}${start}%{opacity:1}${end}%,100%{opacity:0}`;
    return `.stage-${i}{opacity:${i===0?1:0};animation:cardboard-phase-${i} ${s}s step-end infinite}@keyframes cardboard-phase-${i}{${key}}`;
  }).join("\n");
  const handCss = [0,1].map(side => {
    const base = side ? poses[0].r : poses[0].l;
    return `.cardboard-arm-${side}{animation:cardboard-arm-${side} ${s}s linear infinite}.cardboard-hand-${side}{animation:cardboard-hand-${side} ${s}s linear infinite}
@keyframes cardboard-arm-${side}{${poses.map(pose => `${pose.t}%{d:path("${arm(pose,side)}")}`).join("")}}
@keyframes cardboard-hand-${side}{${poses.map(pose => {const [x,y]=side ? pose.r : pose.l;return `${pose.t}%{translate:${x-base[0]}px ${y-base[1]}px}`;}).join("")}}`;
  }).join("\n");
  const panelCss = panelData.map(panel => `.cardboard-${panel.name}{animation:cardboard-${panel.name} ${s}s linear infinite}@keyframes cardboard-${panel.name}{0%,${at(12)}%{d:path("${panel.closed}")}${at(20)}%{d:path("${panel.open}")}${at(40)}%,100%{d:path("${panel.flat}")}}`).join("\n");
  const sleepStart = baseDuration * .66, zzzLifetime = 1800, zzzInterval = 600;
  const zzzStarts = Array.from({length: Math.floor((duration-sleepStart-zzzLifetime)/zzzInterval)+1}, (_,i) => sleepStart+i*zzzInterval);
  const percent = ms => Number((ms/duration*100).toFixed(6));
  const zzzCss = zzzStarts.map((start,i) => `.cardboard-zzz-${i}{animation:cardboard-zzz-${i} ${s}s linear infinite}
@keyframes cardboard-zzz-${i}{0%,${percent(start)}%{opacity:0;translate:0 0;scale:.65}${percent(start+180)}%{opacity:.85;translate:2px -3px;scale:.75}${percent(start+900)}%{opacity:.75;translate:8px -14px;scale:1}${percent(start+zzzLifetime)}%,100%{opacity:0;translate:16px -28px;scale:1.25}}`).join("\n");
  const css = `${phaseCss}
.cardboard-pose,.cardboard-arm,.cardboard-hand,.cardboard-torso,.cardboard-legs,.eyes{transform-box:view-box}
.cardboard-pose{transform-origin:80px 145px;animation:cardboard-pose ${s}s linear infinite}
.cardboard-torso{animation:cardboard-torso ${s}s linear infinite}
.cardboard-legs{animation:cardboard-legs ${s}s linear infinite}
.eyes{transform-origin:80px 78px;animation:cardboard-blink ${s}s linear infinite}
.cardboard-cover{animation:cardboard-cover ${s}s linear infinite}
.cardboard-tape{animation:cardboard-tape ${s}s linear infinite}
.cardboard-zzz-glyph{transform-box:view-box;transform-origin:26px 73px;opacity:0}
${handCss}
${panelCss}
${zzzCss}
@keyframes cardboard-pose{${poses.map(pose => `${pose.t}%{translate:${pose.x}px ${pose.y}px;rotate:${pose.a}deg}`).join("")}}
@keyframes cardboard-torso{${poses.map(pose => `${pose.t}%{d:path("${torso(pose.shift)}")}`).join("")}}
@keyframes cardboard-legs{${poses.map(pose => `${pose.t}%{d:path("${legs(pose.legs)}")}`).join("")}}
@keyframes cardboard-blink{0%,${at(7)}%,${at(11)}%,${at(27)}%,${at(31)}%,100%{scale:1 1}${at(8)}%,${at(10)}%,${at(28)}%,${at(30)}%{scale:1 .15}}
@keyframes cardboard-cover{0%,${at(30)}%{opacity:1}${at(40)}%,100%{opacity:0}}
@keyframes cardboard-tape{0%,${at(6)}%{opacity:1}${at(12)}%,100%{opacity:0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.stage{opacity:0}.stage-0{opacity:1}.cardboard-zzz{opacity:0}.cardboard-pose{translate:-18px 0;rotate:0deg}}
`;
  const heads = ["focus","focus","tired","sleep"].map((mood,i) => g(head(variant.shape)+face(variant,mood,i===0),`class="stage stage-${i}" aria-label="${["打开纸箱","沿折痕拆开铺平","慢慢侧躺下","躺在纸板上休息"][i]}"`)).join("");
  const panels = panelData.map(panel => p(panel.closed,`class="cardboard-${panel.name}" fill="${panel.fill}"`)).join("") + p("M82 134 L113 123",'class="cardboard-tape" fill="none" stroke="#b68c59" stroke-width="4"');
  const body = p(legs(poses[0].legs),'class="cardboard-legs" fill="none"') + p(torso(0),'class="cardboard-torso"') + [0,1].map(side=>p(arm(poses[0],side),`class="cardboard-arm cardboard-arm-${side}" fill="none"`)).join("") + heads;
  const hands = [0,1].map(side=>g(jugglingPalm(...(side ? poses[0].r : poses[0].l),side),`class="cardboard-hand cardboard-hand-${side}"`)).join("");
  const zzz = g(zzzStarts.map((_,i) => g(line("M22 69 H30 L22 77 H30"),`class="cardboard-zzz-glyph cardboard-zzz-${i}"`)).join(""),'class="cardboard-zzz" fill="none" stroke-width="2.5"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 拆开纸箱再躺平</title>
<desc id="description">先打开纸箱，把四块箱板沿折痕展开铺平；随后慢慢侧躺到纸板上，一只手垫在头边，另一只手放在身前，安静休息约 ${Math.round((duration-baseDuration*.66)/1000)} 秒，睡眠符号接连浮起、放大并淡出；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="173" rx="70" ry="2.5" fill="${stroke}" stroke="none" opacity=".08"/>
${g(panels,'class="cardboard-panels" stroke-width="2.5"')}
${g(body,'class="cardboard-pose cardboard-body-rig"')}
${g(panels,'class="cardboard-cover" stroke-width="2.5"')}
${g(hands,'class="cardboard-pose cardboard-hand-rig"')}
${zzz}
</g>
</svg>\n`;
}

function renderDeskSleepSvg(variant) {
  const duration = actionDurations["collapsing.svg"], s = duration/1000;
  const story = stories.collapsing[variant.character];
  const percent = ms => Number((ms/duration*100).toFixed(6));
  const zzzStarts = Array.from({length:5}, (_,i) => duration*.5+i*450);
  const zzzCss = zzzStarts.map((start,i) => `.desk-zzz-${i}{animation:desk-zzz-${i} ${s}s linear infinite}
@keyframes desk-zzz-${i}{0%,${percent(start)}%{opacity:0;translate:0 0;scale:.7}${percent(start+150)}%{opacity:.85;translate:1px -2px;scale:.8}${percent(start+600)}%{opacity:.75;translate:4px -10px;scale:1}${percent(start+1200)}%,100%{opacity:0;translate:8px -20px;scale:1.2}}`).join("\n");
  const zzz = g(zzzStarts.map((_,i) => g(line("M131 26 H139 L131 34 H139"),`class="desk-zzz-glyph desk-zzz-${i}"`)).join(""),'class="desk-zzz" fill="none" stroke-width="2.5"');
  const labels = ["敲电脑","捂脸犯困","原地闭眼睡觉"];
  const stages = story.slice(1).map((beat,i) => {
    const [pose,mood,type,accent] = beat.split("/");
    const art = actor(variant,pose,mood,i===0,i) + prop(type,accent,i,pose) + (pose === "type" ? typingHands(variant,i) : "") + (i===2 ? zzz : accentArt(accent));
    return g(art,`class="stage stage-${i}" aria-label="${labels[i]}"`);
  }).join("\n");
  const css = `${animationCss(duration)}
.stage-2{animation:desk-sleep-rest ${s}s step-end infinite}
@keyframes desk-sleep-rest{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
.stage-2 .actor,.stage-2 .prop,.stage-2 .eyes,.stage-2 .limb,.stage-2 .typing-hand,.stage-2 .typing-key,.stage-2 .typing-key.key-1{animation:none}
.stage-2 .head-pose{transform:none}
.stage-2 .code-line{animation:none;scale:1 1}
.stage-2 .code-cursor{animation:none;opacity:0}
.desk-zzz-glyph{transform-box:view-box;transform-origin:135px 30px;opacity:0}
${zzzCss}
@media(prefers-reduced-motion:reduce){.stage-2,.desk-zzz{opacity:0}}
`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · 工位打盹</title>
<desc id="description">保留敲电脑、捂脸犯困两段原动作，各约 ${s/4} 秒；随后在电脑前原地闭眼睡 ${s/2} 秒，身体不倾斜、不蜷缩，双手停止打字，Zzz 接连浮起并淡出；完整循环 ${s} 秒。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${stages}
</g>
</svg>\n`;
}

function renderLiftDropSvg(variant) {
  const duration = actionDurations["drag.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const arm = (side,x,y) => `M${side ? 97 : 63} 115 Q${side ? 120 : 40} 127 ${x} ${y}`;
  const pulse = (t,start,end) => t > start && t < end ? Math.sin((t-start)/(end-start)*Math.PI)**2 : 0;
  const pose = t => {
    const wave = Math.sin(t/100*Math.PI*2);
    const leftKick = 5*pulse(t,12,28), rightKick = 4*pulse(t,60,76);
    return {
      t, hands:[[number(48+.7*wave),number(139+.8*Math.sin(t/100*Math.PI*4))],
        [number(112+.7*wave),number(140-.8*Math.sin(t/100*Math.PI*4))]],
      legs:[`M69 145 L${number(68-leftKick*.3)} ${number(157-leftKick*.6)} L${number(62-leftKick*.6)} ${number(166-leftKick)} L${number(57-leftKick*.6)} ${number(164-leftKick)}`,
        `M91 145 L${number(94+rightKick*.3)} ${number(157-rightKick*.6)} L${number(98+rightKick*.6)} ${number(166-rightKick)} L${number(104+rightKick*.6)} ${number(164-rightKick)}`],
    };
  };
  const poses = Array.from({length:51},(_,i)=>pose(i*2));
  const entry = [
    {t:0,hands:[[45,142],[111,150]]}, {t:1.6,hands:[[45,142],[111,150]]},
    {t:4,hands:[[37,126],[122,130]]}, {t:8,hands:[[37,125],[125,126]]},
    {t:12,hands:[[43,134],[119,135]]}, {t:18,hands:[[48,139],[112,140]]},
    ...poses.filter(pose=>pose.t>=20),
  ];
  const handCss = [0,1].map(side=>{
    const start = entry[0].hands[side];
    return `.lift-arm-${side}{animation:lift-arm-loop-${side} ${s}s linear infinite,lift-arm-entry-${side} ${s}s linear 1}
.lift-hand-${side}{animation:lift-hand-loop-${side} ${s}s linear infinite,lift-hand-entry-${side} ${s}s linear 1}
@keyframes lift-arm-loop-${side}{${poses.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes lift-arm-entry-${side}{${entry.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes lift-hand-loop-${side}{${poses.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-start[0])}px ${number(pose.hands[side][1]-start[1])}px}`).join("")}}
@keyframes lift-hand-entry-${side}{${entry.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-start[0])}px ${number(pose.hands[side][1]-start[1])}px}`).join("")}}
.lift-leg-${side}{animation:lift-leg-${side} ${s}s linear infinite}
@keyframes lift-leg-${side}{${poses.map(pose=>`${pose.t}%{d:path("${pose.legs[side]}")}`).join("")}}`;
  }).join("\n");
  const sheets = [
    {x:44,y:128,angle:-9,dx:-20,end:34,turn:-65},
    {x:51,y:126,angle:7,dx:7,end:35,turn:48},
    {x:58,y:128,angle:18,dx:36,end:37,turn:95},
  ];
  const paperCss = sheets.map((sheet,i)=>`.lift-sheet-${i}{transform-origin:0 0;animation:lift-sheet-${i} ${s}s linear 1 forwards}
@keyframes lift-sheet-${i}{0%{translate:0 0;rotate:${sheet.angle}deg;opacity:1}1.6%{translate:0 -4.5px;rotate:${sheet.angle}deg}5%{translate:${number(sheet.dx*.12)}px -5px;rotate:${sheet.angle+sheet.turn*.12}deg}10%{translate:${number(sheet.dx*.38)}px 7px;rotate:${sheet.angle+sheet.turn*.35}deg}16%{translate:${number(sheet.dx*.65)}px 29px;rotate:${sheet.angle+sheet.turn*.65}deg}23%{translate:${number(sheet.dx*.85)}px 65px;rotate:${sheet.angle+sheet.turn*.85}deg}${sheet.end}%{translate:${sheet.dx}px 100px;rotate:${sheet.angle+sheet.turn}deg;opacity:1}${sheet.end+.01}%,100%{translate:${sheet.dx}px 100px;rotate:${sheet.angle+sheet.turn}deg;opacity:0}}`).join("\n");
  const returnPoints = [
    [[8,54,169],[16,52,151],[20,52,150],[24,52,151],[100,52,151]],
    [[8,110,169],[16,108,151],[20,108,150],[24,108,151],[100,108,151]],
  ];
  const returnCss = [0,1].map(side=>{
    const start = entry[0].hands[side];
    const leg = side ? "M91 145 L93 155 L95 163 L104 163" : "M69 145 L67 155 L65 163 L57 163";
    return `.pet-released .lift-arm-${side}{animation:lift-return-arm-${side} ${s}s linear 1 forwards}
.pet-released .lift-hand-${side}{animation:lift-return-hand-${side} ${s}s linear 1 forwards}
.pet-released .lift-leg-${side}{animation:lift-land-leg-${side} ${s}s linear 1 forwards}
@keyframes lift-return-arm-${side}{0%{d:var(--held-d)}${returnPoints[side].map(([t,x,y])=>`${t}%{d:path("${arm(side,x,y)}")}`).join("")}}
@keyframes lift-return-hand-${side}{0%{translate:var(--held-translate)}${returnPoints[side].map(([t,x,y])=>`${t}%{translate:${x-start[0]}px ${y-start[1]}px}`).join("")}}
@keyframes lift-land-leg-${side}{0%{d:var(--held-d)}6%,100%{d:path("${leg}")}}`;
  }).join("\n");
  const css = `
.lift-entry{animation:lift-entry ${s}s linear 1 forwards}
.lift-sway,.lift-hand,.lift-sheet,.lift-laptop,.eyes{transform-box:view-box}
.lift-sway{transform-origin:80px 28px;animation:lift-sway ${s}s ease-in-out infinite}
.lift-laptop{transform-origin:0 0;animation:lift-laptop ${s}s linear 1 forwards}
.lift-shock{animation:lift-shock ${s}s step-end 1 forwards}
.lift-worry{opacity:0;animation:lift-worry ${s}s step-end 1 forwards}
.eyes{transform-origin:80px 78px;animation:lift-blink ${s}s linear infinite}
.lift-worry .eyes{translate:0 2px}
.lift-relief{opacity:0}
${handCss}
${paperCss}
@keyframes lift-entry{0%{translate:0 0}4%{translate:0 -10px}8%{translate:0 -14px}12%,100%{translate:0 -12px}}
@keyframes lift-sway{0%,50%,100%{rotate:0deg}25%{rotate:1.7deg}75%{rotate:-1.7deg}}
@keyframes lift-laptop{0%{translate:0 0;rotate:0deg;opacity:1}1.6%{translate:0 -4.5px;rotate:0deg}6%{translate:1px -4px;rotate:5deg}10%{translate:3px 6px;rotate:10deg}14%{translate:6px 20px;rotate:17deg}18%{translate:8px 39px;rotate:23deg}22%{translate:11px 67px;rotate:31deg}26%{translate:13px 90px;rotate:37deg;opacity:1}26.01%,100%{translate:13px 90px;rotate:37deg;opacity:0}}
@keyframes lift-shock{0%{opacity:1}12%,100%{opacity:0}}
@keyframes lift-worry{0%{opacity:0}12%,100%{opacity:1}}
@keyframes lift-blink{0%,34%,37%,80%,83%,100%{scale:1 1}35%,36%,81%,82%{scale:1 .13}}
.pet-released .lift-entry{animation:lift-land ${s}s linear 1 forwards}
.pet-released .lift-sway{animation:lift-settle ${s}s linear 1 forwards}
.pet-released .lift-laptop{animation:lift-return-laptop ${s}s linear 1 forwards}
.pet-released .lift-sheet,.pet-released .lift-shock{animation:none;opacity:0}
.pet-released .lift-worry{animation:lift-return-worry ${s}s step-end 1 forwards}
.pet-released .lift-relief{animation:lift-return-relief ${s}s step-end 1 forwards}
${returnCss}
@keyframes lift-land{0%{translate:var(--held-translate)}6%,100%{translate:0 0}}
@keyframes lift-settle{0%{rotate:var(--held-rotate)}6%,100%{rotate:0deg}}
@keyframes lift-return-laptop{0%{translate:var(--held-translate);rotate:var(--held-rotate);opacity:1}8%{translate:-6px 18px;rotate:0deg}16%{translate:-8px 0;rotate:0deg}20%{translate:-8px -1px;rotate:0deg}24%,100%{translate:-8px 0;rotate:0deg}}
@keyframes lift-return-worry{0%{opacity:1}16%,100%{opacity:0}}
@keyframes lift-return-relief{0%{opacity:0}16%,100%{opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.lift-entry{translate:0 -12px}.lift-laptop,.lift-sheet,.lift-shock{opacity:0}.lift-worry{opacity:1}.lift-hand-0{translate:3px -3px}.lift-hand-1{translate:1px -10px}.lift-arm-0{d:path("${arm(0,48,139)}")}.lift-arm-1{d:path("${arm(1,112,140)}")}}
@media(prefers-reduced-motion:reduce){.pet-released .lift-entry{translate:0 0}.pet-released .lift-laptop{opacity:1;translate:-8px 0;rotate:0deg}.pet-released .lift-hand-0{translate:7px 9px}.pet-released .lift-hand-1{translate:-3px 1px}.pet-released .lift-arm-0{d:path("${arm(0,52,151)}")}.pet-released .lift-arm-1{d:path("${arm(1,108,151)}")}.pet-released .lift-worry{opacity:0}.pet-released .lift-relief{opacity:1}}
`;
  const legs = poses[0].legs.map((d,i)=>p(d,`class="lift-leg-${i}" data-held-release-pose="" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = entry[0].hands.map(([x,y],side)=>p(arm(side,x,y),`class="lift-arm-${side}" data-held-release-pose="" fill="none"`)).join("");
  const faces = g(face(variant,"shock",true),'class="lift-shock"') + g(face(variant,"worry",false),'class="lift-worry"') + g(face(variant,"calm",false),'class="lift-relief"');
  const sweat = p("M119 84 Q128 94 122 96 Q117 96 119 84 Z",'stroke-width="2.1"');
  const palms = entry[0].hands.map(([x,y],side)=>g(jugglingPalm(x,y,side),`class="lift-hand lift-hand-${side}" data-held-release-pose=""`)).join("");
  const character = g(g(legs+torso+arms+head(variant.shape)+faces+sweat,'class="lift-sway" data-held-release-pose=""'),'class="lift-entry" data-held-release-pose=""');
  const hands = g(g(palms,'class="lift-sway" data-held-release-pose=""'),'class="lift-entry" data-held-release-pose=""');
  const laptopArt = p("M-28 -16 H28 L24 9 H-24 Z") + rect(-23,-12,46,16,1.4)
    + g(line("M-18 -7 H7 M-18 -2 H16 M-18 2 H2"),'stroke-width="1.4" fill="none"')
    + p("M-24 9 H24 L34 18 H-34 Z") + g(line("M-18 12 H17 M-8 15 H8"),'stroke-width="1.3" fill="none"');
  const laptop = g(g(g(laptopArt,'transform="scale(.82)"'),'class="lift-laptop" data-held-release-pose=""'),'transform="translate(88 137)" stroke-width="2.8" aria-label="提起掉落、松开接回的电脑"');
  const sheetArt = p("M-9 -13 H4 L10 -7 V13 H-9 Z") + line("M4 -13 V-7 H10 M-5 -2 H5 M-5 3 H5 M-5 8 H1");
  const fallingPapers = sheets.map((sheet,i)=>g(g(sheetArt,`class="lift-sheet lift-sheet-${i}"`),`transform="translate(${sheet.x} ${sheet.y})" stroke-width="1.9" aria-label="掉落的文件"`)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description" data-held-release="true">
<title id="title">${variant.name} · 提起掉落</title>
<desc id="description">刚提起来，电脑和三张文件从手中脱落并加速掉出画面；随后一直悬空，身体轻晃、双腿偶尔扑腾，露出无助表情。物品只掉落一次，悬空姿态每 ${s} 秒连续循环。松开时从当前姿势落地，双手接回电脑，随后恢复当前动作。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="168" rx="24" ry="1.7" fill="${stroke}" stroke="none" opacity=".045"/>
${character}${fallingPapers}${laptop}${hands}
</g>
</svg>\n`;
}

function renderLiftCoffeeSvg(variant) {
  const duration = actionDurations["drag.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const arm = (side,x,y) => `M${side ? 97 : 63} 115 Q${side ? 119 : 41} 127 ${x} ${y}`;
  const pulse = (t,start,end) => t > start && t < end ? Math.sin((t-start)/(end-start)*Math.PI)**2 : 0;
  const poses = Array.from({length:51},(_,i)=>{
    const t = i*2, wave = Math.sin(t/100*Math.PI*2);
    const leftKick = 3.5*pulse(t,18,34), rightKick = 3*pulse(t,62,78);
    return {t,hands:[[number(48+.5*wave),number(140+.6*Math.sin(t/100*Math.PI*4))],
      [number(112+.5*wave),number(140-.6*Math.sin(t/100*Math.PI*4))]],
      legs:[`M69 145 L${number(68-leftKick*.3)} ${number(157-leftKick*.6)} L${number(62-leftKick*.6)} ${number(166-leftKick)} L${number(57-leftKick*.6)} ${number(164-leftKick)}`,
        `M91 145 L${number(94+rightKick*.3)} ${number(157-rightKick*.6)} L${number(98+rightKick*.6)} ${number(166-rightKick)} L${number(104+rightKick*.6)} ${number(164-rightKick)}`]};
  });
  const entry = [
    {t:0,hands:[[47,139],[108,134]]}, {t:1.6,hands:[[47,139],[108,134]]},
    {t:4,hands:[[42,129],[120,127]]}, {t:8,hands:[[42,130],[121,128]]},
    {t:12,hands:[[46,137],[116,136]]}, {t:18,hands:[[48,140],[112,140]]},
    ...poses.filter(pose=>pose.t>=20),
  ];
  const returning = [
    [[8,45,143],[16,47,139],[20,47,139],[24,47,139],[100,47,139]],
    [[8,105,164],[16,108,134],[20,108,133],[24,108,134],[100,108,134]],
  ];
  const limbCss = [0,1].map(side=>{
    const [sx,sy] = entry[0].hands[side];
    const leg = side ? "M91 145 L93 155 L95 163 L104 163" : "M69 145 L67 155 L65 163 L57 163";
    return `.cup-lift-arm-${side}{animation:cup-lift-arm-loop-${side} ${s}s linear infinite,cup-lift-arm-entry-${side} ${s}s linear 1}
.cup-lift-hand-${side}{animation:cup-lift-hand-loop-${side} ${s}s linear infinite,cup-lift-hand-entry-${side} ${s}s linear 1}
.cup-lift-leg-${side}{animation:cup-lift-leg-${side} ${s}s linear infinite}
@keyframes cup-lift-arm-loop-${side}{${poses.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes cup-lift-arm-entry-${side}{${entry.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes cup-lift-hand-loop-${side}{${poses.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-sx)}px ${number(pose.hands[side][1]-sy)}px}`).join("")}}
@keyframes cup-lift-hand-entry-${side}{${entry.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-sx)}px ${number(pose.hands[side][1]-sy)}px}`).join("")}}
@keyframes cup-lift-leg-${side}{${poses.map(pose=>`${pose.t}%{d:path("${pose.legs[side]}")}`).join("")}}
.pet-released .cup-lift-arm-${side}{animation:cup-return-arm-${side} ${s}s linear 1 forwards}
.pet-released .cup-lift-hand-${side}{animation:cup-return-hand-${side} ${s}s linear 1 forwards}
.pet-released .cup-lift-leg-${side}{animation:cup-land-leg-${side} ${s}s linear 1 forwards}
@keyframes cup-return-arm-${side}{0%{d:var(--held-d)}${returning[side].map(([t,x,y])=>`${t}%{d:path("${arm(side,x,y)}")}`).join("")}}
@keyframes cup-return-hand-${side}{0%{translate:var(--held-translate)}${returning[side].map(([t,x,y])=>`${t}%{translate:${x-sx}px ${y-sy}px}`).join("")}}
@keyframes cup-land-leg-${side}{0%{d:var(--held-d)}6%,100%{d:path("${leg}")}}`;
  }).join("\n");
  const css = `
.cup-lift-entry{animation:cup-lift-entry ${s}s linear 1 forwards}
.cup-lift-sway,.cup-lift-hand,.cup-lift-cup,.cup-lift-steam,.eyes{transform-box:view-box}
.cup-lift-sway{transform-origin:80px 30px;animation:cup-lift-sway ${s}s ease-in-out infinite}
.cup-lift-cup{transform-origin:0 0;animation:cup-lift-fall ${s}s linear 1 forwards}
.cup-lift-tired{animation:cup-lift-tired ${s}s step-end 1 forwards}
.cup-lift-startled{opacity:0;animation:cup-lift-startled ${s}s step-end 1 forwards}
.cup-lift-steam{animation:cup-lift-steam ${s}s linear 1 forwards}
.eyes{transform-origin:80px 78px;animation:cup-lift-blink ${s}s linear infinite}
${limbCss}
@keyframes cup-lift-entry{0%{translate:0 0}4%{translate:0 -10px}8%{translate:0 -13px}12%,100%{translate:0 -12px}}
@keyframes cup-lift-sway{0%,2%,50%,100%{rotate:0deg}25%{rotate:1.1deg}75%{rotate:-1.1deg}}
@keyframes cup-lift-fall{0%{translate:0 0;rotate:0deg;opacity:1}1.6%{translate:0 -4px;rotate:0deg}6%{translate:1px -3px;rotate:3deg}10%{translate:3px 7px;rotate:6deg}14%{translate:4px 21px;rotate:9deg}18%{translate:6px 40px;rotate:12deg}22%{translate:8px 68px;rotate:16deg}26%{translate:10px 96px;rotate:20deg;opacity:1}26.01%,100%{translate:10px 96px;rotate:20deg;opacity:0}}
@keyframes cup-lift-tired{0%{opacity:1}2%{opacity:0}12%,100%{opacity:1}}
@keyframes cup-lift-startled{0%{opacity:0}2%{opacity:1}12%,100%{opacity:0}}
@keyframes cup-lift-steam{0%{opacity:.5;translate:0 0}4%{opacity:.25;translate:0 -2px}8%,100%{opacity:0;translate:0 -5px}}
@keyframes cup-lift-blink{0%,34%,37%,80%,83%,100%{scale:1 1}35%,36%,81%,82%{scale:1 .2}}
.pet-released .cup-lift-entry{animation:cup-return-land ${s}s linear 1 forwards}
.pet-released .cup-lift-sway{animation:cup-return-settle ${s}s linear 1 forwards}
.pet-released .cup-lift-cup{animation:cup-return-cup ${s}s linear 1 forwards}
.pet-released .cup-lift-steam{animation:cup-return-steam ${s}s linear 1 forwards}
.pet-released .cup-lift-startled{animation:none;opacity:0}
.pet-released .cup-lift-tired{animation:none;opacity:1}
@keyframes cup-return-land{0%{translate:var(--held-translate)}6%,100%{translate:0 0}}
@keyframes cup-return-settle{0%{rotate:var(--held-rotate)}6%,100%{rotate:0deg}}
@keyframes cup-return-cup{0%{translate:var(--held-translate);rotate:var(--held-rotate);opacity:1}8%{translate:-3px 30px;rotate:0deg}16%{translate:0 0;rotate:0deg}20%{translate:0 -1px;rotate:0deg}24%,100%{translate:0 0;rotate:0deg}}
@keyframes cup-return-steam{0%,16%{opacity:0;translate:0 0}20%{opacity:.5;translate:0 -1px}32%{opacity:.3;translate:0 -5px}40%,100%{opacity:0;translate:0 -8px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.cup-lift-entry{translate:0 -12px}.cup-lift-cup,.cup-lift-startled,.cup-lift-steam{opacity:0}.cup-lift-tired{opacity:1}.cup-lift-hand-0{translate:1px 1px}.cup-lift-hand-1{translate:4px 6px}.cup-lift-arm-0{d:path("${arm(0,48,140)}")}.cup-lift-arm-1{d:path("${arm(1,112,140)}")}.pet-released .cup-lift-entry{translate:0 0}.pet-released .cup-lift-cup{opacity:1;translate:0 0;rotate:0deg}.pet-released .cup-lift-hand-0{translate:0 0}.pet-released .cup-lift-hand-1{translate:0 0}.pet-released .cup-lift-arm-0{d:path("${arm(0,47,139)}")}.pet-released .cup-lift-arm-1{d:path("${arm(1,108,134)}")}}
`;
  const legs = poses[0].legs.map((d,i)=>p(d,`class="cup-lift-leg-${i}" data-held-release-pose="" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = entry[0].hands.map(([x,y],side)=>p(arm(side,x,y),`class="cup-lift-arm-${side}" data-held-release-pose="" fill="none"`)).join("");
  const faces = g(face(variant,"tired",true),'class="cup-lift-tired"') + g(face(variant,"shock",false),'class="cup-lift-startled"');
  const palms = entry[0].hands.map(([x,y],side)=>g(jugglingPalm(x,y,side),`class="cup-lift-hand cup-lift-hand-${side}" data-held-release-pose=""`)).join("");
  const character = g(g(legs+torso+arms+head(variant.shape)+faces,'class="cup-lift-sway" data-held-release-pose=""'),'class="cup-lift-entry" data-held-release-pose=""');
  const hands = g(g(palms,'class="cup-lift-sway" data-held-release-pose=""'),'class="cup-lift-entry" data-held-release-pose=""');
  const handle = p("M8 -10 Q0 -12 0 0 Q0 6 8 3",'class="cup-lift-handle" fill="none"');
  const cupBody = p("M8 -15 H30 L28 10 Q19 15 10 10 Z",'class="cup-lift-cup-body" fill="#fffaf2"')
    + '<ellipse cx="19" cy="-14" rx="11" ry="2.5" fill="#f4e8d8"/>'
    + '<ellipse cx="19" cy="-13.5" rx="8" ry="1.4" fill="#704c36" stroke="none"/>';
  const steam = g(g(line("M22 -20 Q19 -24 23 -29 M29 -20 Q26 -25 30 -32"),'fill="none" stroke="#9a8775" stroke-width="1.6"'),'class="cup-lift-steam"');
  const cup = g(g(handle+cupBody+steam,'class="cup-lift-cup" data-held-release-pose=""'),'transform="translate(108 134)" stroke-width="2.7" aria-label="提起掉落、松开握柄接回的咖啡杯"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description" data-held-release="true">
<title id="title">${variant.name} · 提起掉杯</title>
<desc id="description">原本握着咖啡杯，被提起来时杯子脱手、加速掉出画面；短暂惊讶后恢复困倦神态，一直悬空轻晃，双脚偶尔轻轻扑腾。杯子只掉落一次，悬空姿态每 ${s} 秒连续循环。松开时从当前姿势落地，右手握住杯柄接回咖啡，热气重新升起，再恢复当前动作。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="168" rx="24" ry="1.7" fill="${stroke}" stroke="none" opacity=".045"/>
${character}${cup}${hands}
</g>
</svg>\n`;
}

function renderLiftBriefcaseSvg(variant) {
  const duration = actionDurations["drag.svg"], s = duration/1000;
  const number = n => Number(n.toFixed(4));
  const arm = (side,x,y) => `M${side ? 97 : 63} 115 Q${side ? 123 : 39} 126 ${x} ${y}`;
  const poses = Array.from({length:101},(_,i)=>{
    const t = i, phase = t/100*Math.PI*8, wave = Math.sin(t/100*Math.PI*4);
    const leftKick = 10*Math.max(0,Math.sin(phase))**2, rightKick = 10*Math.max(0,-Math.sin(phase))**2;
    return {t,hands:[[number(43+2.2*wave),number(128-2*Math.cos(t/100*Math.PI*4))],
      [number(118-2.2*wave),number(128+2*Math.cos(t/100*Math.PI*4))]],
      legs:[`M69 145 L${number(68-leftKick*.45)} ${number(157-leftKick*.45)} L${number(62-leftKick*.6)} ${number(166-leftKick)} L${number(57-leftKick*.9)} ${number(164-leftKick)}`,
        `M91 145 L${number(94+rightKick*.45)} ${number(157-rightKick*.45)} L${number(98+rightKick*.6)} ${number(166-rightKick)} L${number(104+rightKick*.9)} ${number(164-rightKick)}`]};
  });
  const entry = [
    {t:0,hands:[[45,137],[131,127]]}, {t:1.6,hands:[[45,137],[131,127]]},
    {t:4,hands:[[34,122],[142,119]]}, {t:8,hands:[[36,123],[139,120]]},
    {t:12,hands:[[42,129],[121,129]]},
    ...poses.filter(pose=>pose.t>=18),
  ];
  const returning = [
    [[8,43,142],[16,45,137],[20,45,137],[24,45,137],[100,45,137]],
    [[8,129,139],[16,131,127],[20,131,126],[24,131,127],[100,131,127]],
  ];
  const limbCss = [0,1].map(side=>{
    const [sx,sy] = entry[0].hands[side];
    const leg = side ? "M91 145 L93 155 L95 163 L104 163" : "M69 145 L67 155 L65 163 L57 163";
    return `.case-lift-arm-${side}{animation:case-lift-arm-loop-${side} ${s}s linear infinite,case-lift-arm-entry-${side} ${s}s linear 1}
.case-lift-hand-${side}{animation:case-lift-hand-loop-${side} ${s}s linear infinite,case-lift-hand-entry-${side} ${s}s linear 1}
.case-lift-leg-${side}{animation:case-lift-leg-${side} ${s}s linear infinite}
@keyframes case-lift-arm-loop-${side}{${poses.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes case-lift-arm-entry-${side}{${entry.map(pose=>`${pose.t}%{d:path("${arm(side,...pose.hands[side])}")}`).join("")}}
@keyframes case-lift-hand-loop-${side}{${poses.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-sx)}px ${number(pose.hands[side][1]-sy)}px}`).join("")}}
@keyframes case-lift-hand-entry-${side}{${entry.map(pose=>`${pose.t}%{translate:${number(pose.hands[side][0]-sx)}px ${number(pose.hands[side][1]-sy)}px}`).join("")}}
@keyframes case-lift-leg-${side}{${poses.map(pose=>`${pose.t}%{d:path("${pose.legs[side]}")}`).join("")}}
.pet-released .case-lift-arm-${side}{animation:case-return-arm-${side} ${s}s linear 1 forwards}
.pet-released .case-lift-hand-${side}{animation:case-return-hand-${side} ${s}s linear 1 forwards}
.pet-released .case-lift-leg-${side}{animation:case-land-leg-${side} ${s}s linear 1 forwards}
@keyframes case-return-arm-${side}{0%{d:var(--held-d)}${returning[side].map(([t,x,y])=>`${t}%{d:path("${arm(side,x,y)}")}`).join("")}}
@keyframes case-return-hand-${side}{0%{translate:var(--held-translate)}${returning[side].map(([t,x,y])=>`${t}%{translate:${x-sx}px ${y-sy}px}`).join("")}}
@keyframes case-land-leg-${side}{0%{d:var(--held-d)}6%,100%{d:path("${leg}")}}`;
  }).join("\n");
  const css = `
.case-lift-entry{animation:case-lift-entry ${s}s linear 1 forwards}
.case-lift-sway,.case-lift-hand,.case-lift-bag,.eyes{transform-box:view-box}
.case-lift-sway{transform-origin:80px 41px;animation:case-lift-sway ${s}s ease-in-out infinite}
.case-lift-bag{transform-origin:0 0;animation:case-lift-fall ${s}s linear 1 forwards}
.case-lift-angry{animation:case-lift-angry-loop ${s}s linear infinite,case-lift-angry-entry ${s}s linear 1}
.case-lift-startled{opacity:0;animation:case-lift-startled ${s}s step-end 1 forwards}
.case-lift-grit{opacity:0;animation:case-lift-grit ${s}s linear infinite}
.eyes{transform-origin:80px 82px;animation:case-lift-blink ${s}s linear infinite}
${limbCss}
@keyframes case-lift-entry{0%{translate:0 0}4%{translate:0 -10px}8%{translate:0 -15px}12%,100%{translate:0 -12px}}
@keyframes case-lift-sway{0%,2%,25%,50%,75%,100%{rotate:0deg}12.5%,62.5%{rotate:2.2deg}37.5%,87.5%{rotate:-2.2deg}}
@keyframes case-lift-fall{0%{translate:0 0;rotate:0deg;opacity:1}1.6%{translate:0 -4px;rotate:0deg}6%{translate:-1px -2px;rotate:-3deg}10%{translate:-2px 8px;rotate:-6deg}14%{translate:-3px 23px;rotate:-10deg}18%{translate:-4px 43px;rotate:-14deg}22%{translate:-5px 69px;rotate:-18deg}26%{translate:-5px 96px;rotate:-22deg;opacity:1}26.01%,100%{translate:-5px 96px;rotate:-22deg;opacity:0}}
@keyframes case-lift-angry-loop{0%,27%{opacity:1}28%,41%{opacity:0}42%,67%{opacity:1}68%,81%{opacity:0}82%,100%{opacity:1}}
@keyframes case-lift-angry-entry{0%,1.99%{opacity:1}2%,11.99%{opacity:0}12%,27%{opacity:1}28%,41%{opacity:0}42%,67%{opacity:1}68%,81%{opacity:0}82%,100%{opacity:1}}
@keyframes case-lift-startled{0%{opacity:0}2%{opacity:1}12%,100%{opacity:0}}
@keyframes case-lift-grit{0%,27%{opacity:0}28%,41%{opacity:1}42%,67%{opacity:0}68%,81%{opacity:1}82%,100%{opacity:0}}
@keyframes case-lift-blink{0%,22%,25%,58%,61%,90%,93%,100%{scale:1 1}23%,24%,59%,60%,91%,92%{scale:1 .15}}
.pet-released .case-lift-entry{animation:case-return-land ${s}s linear 1 forwards}
.pet-released .case-lift-sway{animation:case-return-settle ${s}s linear 1 forwards}
.pet-released .case-lift-bag{animation:case-return-bag ${s}s linear 1 forwards}
.pet-released .case-lift-startled,.pet-released .case-lift-grit{animation:none;opacity:0}
.pet-released .case-lift-angry{animation:none;opacity:1}
@keyframes case-return-land{0%{translate:var(--held-translate)}6%,100%{translate:0 0}}
@keyframes case-return-settle{0%{rotate:var(--held-rotate)}6%,100%{rotate:0deg}}
@keyframes case-return-bag{0%{translate:var(--held-translate);rotate:var(--held-rotate);opacity:1}8%{translate:-2px 12px;rotate:0deg}16%{translate:0 0;rotate:0deg}20%{translate:0 -1px;rotate:0deg}24%,100%{translate:0 0;rotate:0deg}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.case-lift-entry{translate:0 -12px}.case-lift-bag,.case-lift-startled,.case-lift-grit{opacity:0}.case-lift-angry{opacity:1}.case-lift-hand-0{translate:-2px -11px}.case-lift-hand-1{translate:-13px 3px}.case-lift-arm-0{d:path("${arm(0,43,126)}")}.case-lift-arm-1{d:path("${arm(1,118,130)}")}.pet-released .case-lift-entry{translate:0 0}.pet-released .case-lift-bag{opacity:1;translate:0 0;rotate:0deg}.pet-released .case-lift-hand-0,.pet-released .case-lift-hand-1{translate:0 0}.pet-released .case-lift-arm-0{d:path("${arm(0,45,137)}")}.pet-released .case-lift-arm-1{d:path("${arm(1,131,127)}")}}
`;
  const legs = poses[0].legs.map((d,i)=>p(d,`class="case-lift-leg-${i}" data-held-release-pose="" fill="none"`)).join("");
  const torso = p("M65 106 Q58 118 60 143 Q60 149 70 148 L91 148 Q101 149 101 140 Q101 119 95 107 Z");
  const arms = entry[0].hands.map(([x,y],side)=>p(arm(side,x,y),`class="case-lift-arm-${side}" data-held-release-pose="" fill="none"`)).join("");
  const teeth = g(rect(70,96,20,11,3)+line("M72 101.5 H88 M77 97 V106 M83 97 V106"),'stroke-width="2.1"');
  const faces = g(face(variant,"angry",true),'class="case-lift-angry"') + g(face(variant,"shock",false),'class="case-lift-startled"') + g(face(variant,"grit",false)+teeth,'class="case-lift-grit"');
  const palms = entry[0].hands.map(([x,y],side)=>g(jugglingPalm(x,y,side),`class="case-lift-hand case-lift-hand-${side}" data-held-release-pose=""`)).join("");
  const character = g(g(legs+torso+arms+head(variant.shape)+faces,'class="case-lift-sway" data-held-release-pose=""'),'class="case-lift-entry" data-held-release-pose=""');
  const hands = g(g(palms,'class="case-lift-sway" data-held-release-pose=""'),'class="case-lift-entry" data-held-release-pose=""');
  const handle = p("M-8 10 V4 Q-8 0 -4 0 H4 Q8 0 8 4 V10",'class="case-lift-handle" fill="none"');
  const bagBody = rect(-20,9,40,22,2.8)+line("M-20 17 H20")
    + g(rect(-3,14,6,6,1.1),'fill="#5c5b56" stroke-width="1.2"')
    + g(line("M-16 27 H15 M16 12 V28"),'fill="none" stroke="#938b7f" stroke-width=".9" opacity=".5"');
  const bag = g(g(handle+g(bagBody,'class="case-lift-bag-body"'),'class="case-lift-bag" data-held-release-pose=""'),'transform="translate(131 127)" fill="#eee9e0" stroke-width="2.7" aria-label="提起掉落、松开握柄接回的公文包"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description" data-held-release="true">
<title id="title">${variant.name} · 提起掉包</title>
<desc id="description">原本握着身旁的公文包，被提起来时包脱手、加速掉出画面；短暂惊讶后急躁地悬空挣扎，双腿在各自一侧快速交替蹬动，握拳并不时咬牙。公文包只掉落一次，悬空姿态每 ${s} 秒连续循环。松开时从当前姿势落地，右手抓住提柄接回公文包，再恢复当前动作。</desc>
<style>${css}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
<ellipse cx="80" cy="168" rx="24" ry="1.7" fill="${stroke}" stroke="none" opacity=".045"/>
${character}${bag}${hands}
</g>
</svg>\n`;
}

function renderSvg(variant, state) {
  if (state === "idle" && variant.idleFallbackState) return renderSvg(variant, variant.idleFallbackState);
  if (state === "idle" && variant.idleFile) return renderStandingSvg(variant);
  if (state === "idle" && variant.id === "mobi-b") return renderCoffeeSvg(variant);
  if (state === "thinking" && variant.thinkingDurationMs) return renderThinkingSvg(variant);
  if (state === "building") return renderCastleBuildingSvg(variant);
  if (state === "sweeping") return renderSweepingSvg(variant);
  if (state === "carrying") return renderBrickCarryingSvg(variant);
  if (state === "roam" && variant.id === "mobi-a") return renderUmbrellaWalkSvg(variant);
  if (state === "roam" && variant.id === "mobi-b") return renderCoffeeWalkSvg(variant);
  if (state === "roam" && variant.id === "mobi-c") return renderBriefcaseWalkSvg(variant);
  if (state === "notification" && ["mobi-a","mobi-b","mobi-c"].includes(variant.id)) return renderPhoneWaitingSvg(variant);
  if (state === "error" && variant.id === "mobi-b") return renderInterruptedCoffeeSvg(variant);
  if (state === "error" && variant.id === "mobi-c") return renderRageThrowingSvg(variant);
  if (state === "yawning" && variant.id === "mobi-b") return renderStretchCoffeeSvg(variant);
  if (state === "collapsing" && variant.id === "mobi-a") return renderCardboardRestSvg(variant);
  if (state === "collapsing" && variant.id === "mobi-c") return renderDeskSleepSvg(variant);
  if (state === "drag" && variant.id === "mobi-a") return renderLiftDropSvg(variant);
  if (state === "drag" && variant.id === "mobi-b") return renderLiftCoffeeSvg(variant);
  if (state === "drag" && variant.id === "mobi-c") return renderLiftBriefcaseSvg(variant);
  if (["attention", "celebration-screen"].includes(state)) return renderCelebrationSvg(variant, state === "celebration-screen");
  const story = stories[state][variant.character];
  const duration = state === "error" && variant.errorDurationMs ? variant.errorDurationMs : actionDurations[`${state}.svg`];
  const refineJuggling = ["mobi-a", "mobi-b", "mobi-c"].includes(variant.id) && state === "juggling";
  const trimmedRightPoke = state === "poke-right" && variant.id === "mobi-c";
  const stageLabels = state === "error" && variant.id === "mobi-a" ? ["敲电脑", "报错慌张", "捂脸发愁"] : trimmedRightPoke ? ["生气挥手", "敲电脑疑惑", "抱臂叹气"] : state === "double" ? ["生气挥手", "急躁蹬腿", "捂脸发愁", "继续敲电脑"] : ["准备", "努力", "意外", "收场"];
  const stages = story.slice(1).map((beat, i) => {
    const [pose,mood,type,accent] = beat.split("/");
    const sourceBeat = i + (trimmedRightPoke ? 1 : 0);
    return g(actor(variant,pose,mood,i===0,sourceBeat) + prop(type,accent,sourceBeat,pose,refineJuggling) + (pose === "type" ? typingHands(variant,sourceBeat) : "") + accentArt(accent), `class="stage stage-${i}" aria-label="${stageLabels[i]}"`);
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-labelledby="title description">
<title id="title">${variant.name} · ${story[0]}</title>
<desc id="description">${story.length === 4 || state === "double" ? `${stageLabels.join("、")}，每段 ${duration / (story.length - 1) / 1000} 秒` : "黑白手绘打工人，四段剧情：准备、努力、意外、收场"}；完整循环 ${duration/1000} 秒。</desc>
<style>${animationCss(duration, "80px 150px", refineJuggling, story.length - 1)}</style>
<g fill="${paper}" stroke="${stroke}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round" id="body-js">
${stages}
</g>
</svg>\n`;
}

function activeNormalStates(variant) {
  return normalStates.filter(state => !(variant.id !== "mobi-b" && state === "yawning") && !(variant.id === "mobi-b" && state === "collapsing") && !(variant.id !== "mobi-c" && state === "poke-right") && !(variant.id !== "mobi-c" && state === "double"));
}

function assetStates(variant) {
  return [...activeNormalStates(variant).filter(state => !(state === "idle" && variant.idleFallbackState)), "celebration-screen"];
}

function manifest(variant) {
  const duration = state => state === "idle" && variant.idleFallbackState ? duration(variant.idleFallbackState) : state === "celebration-screen" ? variant.attentionDurationMs : state === "idle" && variant.idleDurationMs ? variant.idleDurationMs : state === "thinking" && variant.thinkingDurationMs ? variant.thinkingDurationMs : state === "sweeping" && variant.sweepingDurationMs ? variant.sweepingDurationMs : state === "attention" && variant.attentionDurationMs ? variant.attentionDurationMs : state === "error" && variant.errorDurationMs ? variant.errorDurationMs : state === "yawning" && variant.yawningDurationMs ? variant.yawningDurationMs : state === "collapsing" && variant.collapsingDurationMs ? variant.collapsingDurationMs : actionDurations[`${state}.svg`];
  return {
    schemaVersion: 1, name: variant.name, author: "Mobi Agent Pet", version: "2.0.0", description: variant.description,
    preview: actionFile(variant, "idle"), customization: { petTint: false },
    actionDurations: Object.fromEntries(assetStates(variant).map(state => [actionFile(variant, state), duration(state)])),
    actionLabels: Object.fromEntries(assetStates(variant).map(state => [actionFile(variant, state), state === "celebration-screen" ? "整屏彩纸雨" : state === "attention" ? "框内彩纸雨" : state === "idle" && variant.idleFile ? "静止站立" : shortLabels[state][variant.character]])),
    actionLibrary: ["celebration-screen.svg"],
    defaultActions: {
      idle: actionFile(variant, "idle"), roam: "roam.svg", working: "working.svg",
      waiting: "notification.svg", complete: "attention.svg", error: "error.svg", held: "drag.svg",
    },
    viewBox: { x: 0, y: 0, width: 160, height: 180 },
    layout: { contentBox: { x: 12, y: 20, width: 140, height: 149 }, centerX: 80, baselineY: 164, visibleHeightRatio: .75, baselineBottomRatio: .05 },
    eyeTracking: { enabled: true, states: ["idle"], maxOffset: 3, bodyScale: .16, ids: { eyes: "eyes-js", body: "body-js" } },
    states: {
      ...Object.fromEntries(activeNormalStates(variant).filter(state => !["building","drag","poke-right","double"].includes(state)).map(state => [state,[actionFile(variant, state)]])),
      // Full sleep bindings stay valid without restoring retired sleep visuals.
      ...(variant.id !== "mobi-b" ? { yawning: [actionFile(variant, "idle")] } : {}),
      dozing: [actionFile(variant, "idle")],
      ...(variant.id === "mobi-b" ? { collapsing: [actionFile(variant, "idle")] } : {}),
      sleeping: [actionFile(variant, variant.id === "mobi-b" ? "idle" : "collapsing")],
      waking: [actionFile(variant, "idle")],
    },
    sleepSequence: { mode: "full" },
    workingTiers: [{ minSessions: 3, file: "building.svg" }, { minSessions: 2, file: "juggling.svg" }, { minSessions: 1, file: "working.svg" }],
    jugglingTiers: [{ minSessions: 2, file: "building.svg" }, { minSessions: 1, file: "juggling.svg" }],
    timings: { ...(activeNormalStates(variant).includes("yawning") ? { yawnDuration: duration("yawning") } : {}), ...(activeNormalStates(variant).includes("collapsing") ? { collapseDuration: duration("collapsing") } : {}), minDisplay: Object.fromEntries(activeNormalStates(variant).map(state => [state,duration(state)])), autoReturn: Object.fromEntries(["attention","error","sweeping","notification","carrying"].filter(state => activeNormalStates(variant).includes(state)).map(state => [state,duration(state)])) },
    hitBoxes: { default: { x: 25, y: 25, w: 110, h: 142 }, wide: { x: 12, y: 8, w: 140, h: 161 }, sleeping: { x: 28, y: 58, w: 105, h: 112 } },
    sleepingHitboxFiles: activeNormalStates(variant).includes("collapsing") ? [actionFile(variant, "collapsing")] : [],
    wideHitboxFiles: ["juggling.svg", "building.svg", "attention.svg", "notification.svg", "drag.svg", "double.svg", "celebration-screen.svg"].filter(file => !(file === "double.svg" && !activeNormalStates(variant).includes("double"))),
    reactions: { drag: { file: "drag.svg", duration: duration("drag"), releaseDuration: 1600 }, ...(activeNormalStates(variant).includes("poke-right") ? { clickRight: { file: "poke-right.svg", duration: duration("poke-right") } } : {}), ...(activeNormalStates(variant).includes("double") ? { double: { files: ["double.svg"], duration: duration("double") } } : {}) },
    objectScale: { widthRatio: 1, heightRatio: 1, offsetX: 0, offsetY: 0 },
  };
}
function generate() {
  for (const variant of variants) {
    const dir = path.join(root,"runtime","clawd","themes",variant.id);
    fs.mkdirSync(path.join(dir,"assets"),{recursive:true});
    for (const state of assetStates(variant)) fs.writeFileSync(path.join(dir,"assets",actionFile(variant,state)),renderSvg(variant,state));
    for (const state of ["dozing", "sleeping", "waking", "poke-left", ...normalStates.filter(state => !activeNormalStates(variant).includes(state))]) fs.rmSync(path.join(dir,"assets",actionFile(variant,state)),{force:true});
    // Remove retired mini artwork left by older generated theme versions.
    for (const file of fs.readdirSync(path.join(dir,"assets"))) if (file.startsWith("mini-") && file.endsWith(".svg")) fs.rmSync(path.join(dir,"assets",file));
    if (variant.idleFile || variant.idleFallbackState) fs.rmSync(path.join(dir,"assets","idle.svg"),{force:true});
    if (variant.idleFallbackState) fs.rmSync(path.join(dir,"assets","standing.svg"),{force:true});
    fs.writeFileSync(path.join(dir,"theme.json"),JSON.stringify(manifest(variant),null,2)+"\n");
    console.log(`${variant.name}: ${assetStates(variant).length} role assets`);
  }
}
if (require.main === module) generate();
module.exports = { generate, renderSvg, manifest, variants, actionDurations };
