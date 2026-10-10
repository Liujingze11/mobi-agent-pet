"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { launchElectron } = require('../../scripts/launch-electron.cjs');
function harness() {
  const parent = new EventEmitter(), child = new EventEmitter(), signals = [];
  child.kill = signal => { signals.push(signal); return true; };
  let options;
  launchElectron({ root: '/repo', electronPath: '/fake-electron', env: { ELECTRON_RUN_AS_NODE: '1', KEEP: 'yes' }, processRef: parent,
    spawnFn: (file, args, opts) => { options = { file, args, ...opts }; return child; } });
  return { parent, child, signals, options };
}
test('launcher waits for Electron close and releases its signal handlers on application quit', () => {
  const h = harness();
  assert.equal(h.options.file, '/fake-electron');
  assert.equal(h.options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(h.options.env.KEEP, 'yes');
  h.child.emit('exit', 0, null); assert.equal(h.parent.exitCode, undefined);
  h.child.emit('close', 0, null); assert.equal(h.parent.exitCode, 0);
  assert.equal(h.parent.listenerCount('SIGTERM'), 0); assert.equal(h.parent.listenerCount('SIGINT'), 0);
});
test('interrupt targets only the owned Electron child and a signal exit does not resignal the wrapper', () => {
  const h = harness(); h.parent.emit('SIGTERM'); assert.deepEqual(h.signals, ['SIGTERM']);
  h.child.emit('close', null, 'SIGTERM'); assert.equal(h.parent.exitCode, 143);
  assert.equal(h.parent.listenerCount('SIGTERM'), 0);
});
test('failed child start reports failure without retaining the launcher', () => {
  const h = harness(); h.child.emit('error', new Error('cannot start Electron'));
  h.child.emit('close', -2, null); assert.equal(h.parent.exitCode, 1);
  assert.equal(h.parent.listenerCount('SIGTERM'), 0);
});
