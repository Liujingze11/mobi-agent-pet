"use strict";
(function(root) {
  // Shared by the desktop pet overview and every Agent bubble.
  const PALETTES = {
    'claude-code': ['claude', 'Claude Code', '#c77954', '#eedbcf', '#fcf5f0'],
    codex: ['codex', 'Codex', '#27836e', '#d2e9e0', '#f1faf6'],
    'gemini-cli': ['gemini', 'Gemini', '#6678c7', '#dce0f4', '#f5f5fd'],
    'antigravity-cli': ['antigravity', 'Antigravity', '#4479aa', '#d6e4f1', '#f3f8fc'],
    'cursor-agent': ['cursor', 'Cursor Agent', '#535d72', '#dce0e8', '#f5f6f8'],
    opencode: ['opencode', 'opencode', '#985dba', '#e9daf1', '#faf5fc'],
    mimocode: ['mimocode', 'MiMo Code', '#a05e91', '#ecd9e7', '#fcf5fa'],
  };
  const LABELS = {'copilot-cli':'Copilot','kiro-cli':'Kiro','kimi-cli':'Kimi','qwen-code':'Qwen Code',codebuddy:'CodeBuddy',workbuddy:'WorkBuddy',pi:'Pi',openclaw:'OpenClaw',hermes:'Hermes'};
  function getAgentCardStyle(agentId) {
    const id=typeof agentId==='string'?agentId:'';
    const entry=Object.hasOwn(PALETTES,id)?PALETTES[id]:null;
    if(entry) {const [theme,label,accent,border,tint]=entry;return {theme,label,accent,border,tint};}
    if(!id)return {theme:'default',label:'Agent',accent:'#6b8cb8',border:'#d9e4f0',tint:'#f3f7fc'};
    let hash=0;for(const char of id)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
    const hue=hash%360;
    return {theme:'default',label:Object.hasOwn(LABELS,id)?LABELS[id]:id,accent:`hsl(${hue} 38% 40%)`,border:`hsl(${hue} 48% 85%)`,tint:`hsl(${hue} 55% 97%)`};
  }
  function applyAgentCardStyle(element,agentId) {
    const style=getAgentCardStyle(agentId);
    element.style.setProperty('--card-accent',style.accent);
    element.style.setProperty('--card-border',style.border);
    element.style.setProperty('--card-tint',style.tint);
    return style;
  }
  const api={getAgentCardStyle,applyAgentCardStyle};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MobiAgentCardStyle=api;
})(globalThis);
