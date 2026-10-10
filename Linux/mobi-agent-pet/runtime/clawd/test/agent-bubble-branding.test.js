"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=path.join(__dirname,'../src');
function fixture(){
  const dom=new JSDOM(fs.readFileSync(path.join(src,'bubble.html'),'utf8'),{runScripts:'outside-only',pretendToBeVisual:true});
  let show;const decisions=[];const w=dom.window;
  w.bubbleAPI={onPermissionShow:fn=>{show=fn},onPermissionHide:()=>{},reportHeight:()=>{},setImeEditing:()=>{},decide:value=>decisions.push(value)};
  for(const file of ['agent-card-style.js','bubble-format.js','bubble-renderer.js'])if(fs.existsSync(path.join(src,file)))w.eval(fs.readFileSync(path.join(src,file),'utf8'));
  return {dom,w,show,decisions};
}
test('Agent identity determines card color regardless of tool and resets on each request',()=>{
  const h=fixture();try{
    for(const [agentId,toolName,want] of [['codex','Bash','#27836e'],['claude-code','Edit','#c77954'],['gemini-cli','Bash','#6678c7']]) {
      h.show({agentId,toolName,toolInput:{command:'echo preview'},lang:'zh'});
      assert.equal(h.w.document.getElementById('card').style.getPropertyValue('--card-accent'),want);
    }
  }finally{h.dom.window.close();}
});
test('notification cards remain acknowledge-only, and selectable questions retain their answer controls',()=>{
  const h=fixture();try{
    h.show({agentId:'codex',toolName:'CodexExec',toolInput:{command:'echo preview'},lang:'zh'});
    assert.equal(h.w.document.getElementById('card').style.getPropertyValue('--card-accent'),'#27836e');
    assert.match(h.w.document.querySelector('.header-title').textContent,/通知/);
    assert.equal(h.w.document.getElementById('btnDeny').style.display,'none');
    h.w.document.getElementById('btnAllow').click();assert.deepEqual(h.decisions,['allow']);
    h.show({agentId:'claude-code',lang:'zh',toolName:'AskUserQuestion',toolInput:{questions:[{id:'0',question:'选择需要的项目',multiSelect:true,options:[{label:'A'},{label:'B'}]}]},interaction:{intent:'human-question',capabilities:{answerQuestions:true}}});
    const inputs=h.w.document.querySelectorAll('.option-item input[type="checkbox"]');
    inputs[0].click();inputs[1].click();h.w.document.getElementById('btnAllow').click();
    assert.equal(h.decisions[1].type,'elicitation-submit');assert.equal(h.decisions[1].answers['0'],'A, B');
  }finally{h.dom.window.close();}
});
test('cards show the Agent name once and hide redundant single-question navigation',()=>{
  const h=fixture();try{
    h.show({agentId:'codex',toolName:'CodexExec',toolInput:{command:'echo preview'},lang:'zh'});
    assert.equal(h.w.document.querySelector('.header-title').textContent,'通知');
    assert.equal(h.w.document.getElementById('agentLabel').textContent,'Codex');
    assert.equal(h.w.document.getElementById('toolPill').style.display,'none');
    h.show({agentId:'claude-code',lang:'zh',toolName:'AskUserQuestion',toolInput:{questions:[{id:'0',header:'颜色',question:'选择颜色',multiSelect:false,options:[{label:'蓝色'}]}]},interaction:{intent:'human-question',capabilities:{answerQuestions:true}}});
    assert.equal(h.w.document.getElementById('elicitationProgress').classList.contains('visible'),false);
    assert.equal(h.w.document.getElementById('btnDeny').style.display,'none');
    assert.equal(h.w.document.querySelector('.question-header'),null);
  }finally{h.dom.window.close();}
});
