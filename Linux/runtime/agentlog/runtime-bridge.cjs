"use strict";

const { createAgentEventStream } = require("./events/event-stream.cjs");

const stream = createAgentEventStream({
  capacity: 500,
  onError: (message, error) => {
    console.warn(`${message}:`, error && error.message ? error.message : error);
  },
});

function publishUpstreamEvent(input) {
  return stream.publish(input);
}

module.exports = Object.freeze({
  publishUpstreamEvent,
  subscribeToAgentEvents: (listener) => stream.subscribe(listener),
  getRecentAgentEvents: () => stream.getSnapshot(),
  getAgentEventStats: () => stream.getStats(),
  clearRecentAgentEvents: () => stream.clear(),
});
