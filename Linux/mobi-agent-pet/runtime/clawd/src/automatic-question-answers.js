'use strict';
const {prepareElicitationToolInput}=require('./server-permission-utils');
const AGENT_DECIDES_ANSWER='You choose whatever is best.';
const RECOMMENDATION_WORDS='recommended|推荐|推薦|推奨|おすすめ|추천|권장';
const RECOMMENDATION_MARKER=new RegExp('(?:\\(\\s*(?:'+RECOMMENDATION_WORDS+')\\s*\\)|（\\s*(?:'+RECOMMENDATION_WORDS+')\\s*）|\\[\\s*(?:'+RECOMMENDATION_WORDS+')\\s*\\]|【\\s*(?:'+RECOMMENDATION_WORDS+')\\s*】)\\s*$','iu');
function isRecommended(option){
 return option.recommended===true||option.isRecommended===true||RECOMMENDATION_MARKER.test(option.label);
}
function buildAutomaticQuestionAnswers(toolInput){
 const prepared=prepareElicitationToolInput(toolInput);
 if(!prepared.canAnswer)return null;
 return Object.fromEntries(prepared.wireInput.questions.map(question=>{
  const options=Array.isArray(question.options)?question.options:[];
  const recommended=options.filter(isRecommended);
  const canSelect=recommended.length>0&&(question.multiSelect===true||recommended.length===1);
  return [question.question,canSelect?recommended.map(option=>option.label).join(', '):AGENT_DECIDES_ANSWER];
 }));
}
module.exports={buildAutomaticQuestionAnswers,AGENT_DECIDES_ANSWER};
