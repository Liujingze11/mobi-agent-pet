"use strict";

const { normalizeAgentEvent } = require("./normalized-event.cjs");

function createAgentEventStream(options = {}) {
  const capacity = Number.isSafeInteger(options.capacity) && options.capacity > 0
    ? options.capacity
    : 500;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const onError = typeof options.onError === "function" ? options.onError : console.warn;
  const subscribers = new Set();
  const recent = [];
  const seenIds = new Set();
  let sequence = 0;
  const stats = {
    received: 0,
    published: 0,
    duplicates: 0,
    dropped: 0,
    subscriberErrors: 0,
    lastEventAt: null,
    lastEventId: null,
  };

  function publish(input) {
    stats.received += 1;
    let event;
    try {
      event = normalizeAgentEvent(input, { now, sequence: ++sequence });
    } catch (error) {
      stats.dropped += 1;
      try { onError("AgentLog event normalization failed", error); } catch {}
      return null;
    }

    if (seenIds.has(event.id)) {
      stats.duplicates += 1;
      return null;
    }

    seenIds.add(event.id);
    recent.push(event);
    if (recent.length > capacity) {
      const removed = recent.splice(0, recent.length - capacity);
      for (const oldEvent of removed) seenIds.delete(oldEvent.id);
    }
    stats.published += 1;
    stats.lastEventAt = event.receivedAt;
    stats.lastEventId = event.id;

    for (const subscriber of subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        stats.subscriberErrors += 1;
        try { onError("AgentLog event subscriber failed", error); } catch {}
      }
    }
    return event;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") throw new TypeError("subscriber must be a function");
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return Object.freeze({
    publish,
    subscribe,
    getSnapshot: () => recent.slice(),
    getStats: () => ({ ...stats, subscribers: subscribers.size, capacity }),
    clear: () => {
      recent.length = 0;
      seenIds.clear();
    },
  });
}

module.exports = { createAgentEventStream };
