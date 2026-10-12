'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildAutomaticQuestionAnswers,AGENT_DECIDES_ANSWER}=require('../src/automatic-question-answers');
const input=(question,options,extra={})=>({questions:[{question,options,...extra}]});

test('single choice returns the explicitly recommended option, even when it is not first',()=>{
 const data=input('Pick an approach',[{label:'A'},{label:'B (Recommended)',description:'Best fit'},{label:'C'}]);
 assert.deepEqual(buildAutomaticQuestionAnswers(data),{'Pick an approach':'B (Recommended)'});
 assert.deepEqual(data.questions[0].options.map(o=>o.label),['A','B (Recommended)','C']);
});
test('recognizes explicit recommendation flags and localized label markers',()=>{
 for(const label of ['B（推荐）','B [推薦]','B (Recommended)','B（推奨）','B (추천)'])
  assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',[{label:'A'},{label}])),{Q:label});
 for(const flag of ['recommended','isRecommended'])
  assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',[{label:'A'},{label:'B',[flag]:true}])),{Q:'B'});
});
test('multiple choice joins every explicitly recommended option in original order',()=>{
 assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',[{label:'A（推荐）'},{label:'B'},{label:'C (Recommended)'}],{multiSelect:true})),{Q:'A（推荐）, C (Recommended)'});
});
test('no or ambiguous recommendation delegates to the Agent instead of choosing the first',()=>{
 for(const options of [[{label:'A'},{label:'B'}],[{label:'A（推荐）'},{label:'B（推荐）'}],[]])
  assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',options)),{Q:AGENT_DECIDES_ANSWER});
});
test('negative recommendation text and string flags are not explicit recommendations',()=>{
 assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',[{label:'A (Not recommended)',recommended:'true'},{label:'B（不推荐）'},{label:'C',description:'Do not choose the recommended database.'}])),{Q:AGENT_DECIDES_ANSWER});
});
test('preserves exact wire question and choice labels, including long questions and prototype-shaped keys',()=>{
 const q='  '+ 'Question '.repeat(50)+'  ';
 const answers=buildAutomaticQuestionAnswers(input(q,[{label:'A'},{label:'B（推荐）'}]));assert.equal(answers[q],'B（推荐）');
 const special=buildAutomaticQuestionAnswers(input('__proto__',[{label:'B（推荐）'}]));assert.equal(Object.hasOwn(special,'__proto__'),true);assert.equal(special.__proto__,'B（推荐）');
});
test('rejects invalid question sets without sending partial or empty answers',()=>{
 for(const data of [{}, {questions:[]},{questions:[{question:'Q'},{}]},{questions:[{question:'Q'},{question:'Q'}]},input('Q',[{label:'A'},{label:'A'}]),input('Q',[{label:''}])])
  assert.equal(buildAutomaticQuestionAnswers(data),null);
});

test('non-array options cannot crash an otherwise valid free-text question',()=>{
 for(const options of [null,{},'A'])assert.deepEqual(buildAutomaticQuestionAnswers(input('Q',options)),{Q:AGENT_DECIDES_ANSWER});
});
