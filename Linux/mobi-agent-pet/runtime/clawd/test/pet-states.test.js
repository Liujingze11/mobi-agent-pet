'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/pet-action-plan');
test('canonical state inputs select their own configured groups', () => {
  for (const id of ['idle','roam','working','waiting','complete','error','held']) assert.equal(model.groupForState(id), id);
});
test('legacy inputs including mini views map to seven groups and unknown inputs stay rejected', () => {
  for (const [input, expected] of [['thinking','working'],['juggling','working'],['sweeping','working'],['carrying','working'],['notification','waiting'],['attention','complete'],['sleeping','idle'],['dizzy','idle'],['mini-working','working'],['mini-alert','waiting'],['mini-happy','complete'],['mini-crabwalk','roam'],['mini-enter','idle']]) assert.equal(model.groupForState(input), expected);
  assert.equal(model.groupForState('invented'), null);
});
