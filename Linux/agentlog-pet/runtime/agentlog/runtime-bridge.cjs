"use strict";

const { createAgentEventStream } = require("./events/event-stream.cjs");

const stream = createAgentEventStream({
  capacity: 500,
  onError: (message, error) => {
    console.warn(`${message}:`, error && error.message ? error.message : error);
  },
});

let hostActions = Object.freeze({});

function publishUpstreamEvent(input) {
  return stream.publish(input);
}

function registerHostActions(next) {
  hostActions = Object.freeze({ ...hostActions, ...next });
}

function invokeHostAction(name, ...args) {
  if (typeof hostActions[name] !== "function") {
    throw new Error(`AgentLog host action unavailable: ${name}`);
  }
  return hostActions[name](...args);
}

module.exports = Object.freeze({
  publishUpstreamEvent,
  subscribeToAgentEvents: (listener) => stream.subscribe(listener),
  getRecentAgentEvents: () => stream.getSnapshot(),
  getAgentEventStats: () => stream.getStats(),
  clearRecentAgentEvents: () => stream.clear(),
  registerHostActions,
  invokeHostAction,
});
