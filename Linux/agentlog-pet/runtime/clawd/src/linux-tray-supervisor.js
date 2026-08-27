"use strict";

const defaultProtocol = require("./linux-tray-protocol");

const STATES = Object.freeze({
  STOPPED: "stopped",
  STARTING: "starting",
  NATIVE: "native",
  FALLBACK: "electron-fallback",
  NO_HOST: "no-host",
  FAILED: "failed",
});

const RESTART_DELAYS_MS = Object.freeze([250, 1000, 3000]);
const STARTUP_TIMEOUT_MS = 2000;
const HOST_LOSS_DEBOUNCE_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 750;

function createLinuxTraySupervisor(deps) {
  const {
    spawn,
    helperPath,
    iconThemeRoot,
    sessionType,
    fallback,
    getMenuSnapshot,
    productId = "com.agentlog.pet",
    tooltip = "AgentLog Pet",
    timers = globalThis,
    protocol = defaultProtocol,
  } = deps;

  let health = { status: STATES.STOPPED, code: null };
  let active = false;
  let child = null;
  let generation = 0;
  let ready = false;
  let hostRegistered = null;
  let menuSnapshot = null;
  let menuRevision = 0;
  let iconRevision = 0;
  let attention = false;
  let restartAttempts = 0;
  let startupTimer = null;
  let restartTimer = null;
  let hostLossTimer = null;
  let menuOpenedHandler = () => {};
  let operations = Promise.resolve();

  function transition(next, code = null) {
    health = { status: next, code };
  }

  function enqueue(operation) {
    const result = operations.then(operation, operation);
    operations = result.catch(() => {});
    return result;
  }

  function clearTimer(name) {
    const timer = name === "startup"
      ? startupTimer
      : name === "restart"
        ? restartTimer
        : hostLossTimer;
    if (timer !== null) timers.clearTimeout(timer);
    if (name === "startup") startupTimer = null;
    else if (name === "restart") restartTimer = null;
    else hostLossTimer = null;
  }

  function clearNativeTimers() {
    clearTimer("startup");
    clearTimer("host-loss");
  }

  function isCurrent(expectedGeneration, expectedChild = child) {
    return active && generation === expectedGeneration && child === expectedChild;
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.items)) {
      throw new TypeError("tray snapshot must contain items");
    }
    if (!snapshot.commands
      || typeof snapshot.commands.has !== "function"
      || typeof snapshot.commands.execute !== "function") {
      throw new TypeError("tray snapshot must contain a command router");
    }
    return snapshot;
  }

  function writeTo(target, message) {
    const normalized = protocol.validateParentMessage(message, {
      expectedIconThemeRoot: iconThemeRoot,
    });
    target.stdin.write(protocol.encodeMessage(normalized));
  }

  function send(message) {
    if (!child) return false;
    writeTo(child, message);
    return true;
  }

  function initMessage() {
    return {
      version: 1,
      type: "init",
      revision: menuRevision,
      productId,
      tooltip,
      iconThemeRoot,
      icon: attention ? "agentlog-pet-attention" : "agentlog-pet",
      items: menuSnapshot.items,
    };
  }

  async function stopFallback() {
    if (fallback.isActive()) await fallback.stop();
  }

  async function stopNative() {
    const stoppingChild = child;
    if (!stoppingChild) return;

    child = null;
    generation += 1;
    ready = false;
    hostRegistered = null;
    clearNativeTimers();

    if (stoppingChild.exited === true
      || stoppingChild.exitCode !== null && stoppingChild.exitCode !== undefined
      || stoppingChild.signalCode !== null && stoppingChild.signalCode !== undefined) {
      return;
    }

    let resolveExit;
    const exited = new Promise((resolve) => { resolveExit = resolve; });
    const onExit = () => resolveExit();
    stoppingChild.once("exit", onExit);

    try {
      writeTo(stoppingChild, { version: 1, type: "shutdown" });
    } catch (_error) {
      // A closed pipe is already on the way to the desired stopped state.
    }
    try {
      stoppingChild.stdin.end();
    } catch (_error) {
      // Ignore a pipe that the helper closed first.
    }

    const killTimer = timers.setTimeout(() => {
      try {
        stoppingChild.kill("SIGTERM");
      } catch (_error) {
        resolveExit();
      }
    }, SHUTDOWN_TIMEOUT_MS);

    await exited;
    timers.clearTimeout(killTimer);
    stoppingChild.removeListener("exit", onExit);
  }

  async function startFallback(code) {
    await stopNative();
    if (!active) return false;
    try {
      await fallback.start(menuSnapshot);
      transition(STATES.FALLBACK, code);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function attachChild(nextChild, childGeneration) {
    const decoder = protocol.createLineDecoder({
      validate: (message) => protocol.validateHelperMessage(message),
      onMessage: (message) => {
        void enqueue(() => handleHelperMessage(childGeneration, nextChild, message));
      },
    });

    nextChild.stdout.on("data", (chunk) => {
      if (!isCurrent(childGeneration, nextChild)) return;
      try {
        decoder.push(chunk);
      } catch (_error) {
        void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-protocol-error"));
      }
    });
    nextChild.stdout.on("end", () => {
      if (!isCurrent(childGeneration, nextChild)) return;
      try {
        decoder.end();
      } catch (_error) {
        void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-protocol-error"));
        return;
      }
      void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-helper-eof"));
    });
    nextChild.stdin.on("error", () => {
      if (!isCurrent(childGeneration, nextChild)) return;
      void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-helper-error"));
    });
    nextChild.on("error", () => {
      void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-helper-error"));
    });
    nextChild.on("exit", () => {
      void enqueue(() => handleNativeFailure(childGeneration, nextChild, "native-helper-exited"));
    });
  }

  async function spawnNative() {
    await stopFallback();
    if (!active) return false;

    transition(STATES.STARTING, null);
    const childGeneration = generation + 1;
    generation = childGeneration;
    ready = false;
    hostRegistered = null;

    let nextChild;
    try {
      nextChild = spawn(helperPath, [], {
        stdio: ["pipe", "pipe", "ignore"],
        shell: false,
      });
    } catch (_error) {
      return false;
    }
    child = nextChild;
    attachChild(nextChild, childGeneration);

    try {
      send(initMessage());
    } catch (_error) {
      return false;
    }

    startupTimer = timers.setTimeout(() => {
      void enqueue(() => handleNativeFailure(
        childGeneration,
        nextChild,
        "native-startup-timeout"
      ));
    }, STARTUP_TIMEOUT_MS);
    return true;
  }

  function scheduleRestart(code) {
    const delay = RESTART_DELAYS_MS[restartAttempts];
    restartAttempts += 1;
    restartTimer = timers.setTimeout(() => {
      restartTimer = null;
      void enqueue(async () => {
        if (!active) return;
        const spawned = await spawnNative();
        if (!spawned) await handleNativeFailure(generation, child, "native-spawn-failed");
      });
    }, delay);
    if (!fallback.isActive()) transition(STATES.STARTING, code);
  }

  async function handleNativeFailure(expectedGeneration, expectedChild, code) {
    if (!isCurrent(expectedGeneration, expectedChild)) return;

    await stopNative();
    const fallbackStarted = await startFallback(code);
    if (restartAttempts < RESTART_DELAYS_MS.length) {
      scheduleRestart(code);
      return;
    }
    if (fallbackStarted) transition(STATES.FALLBACK, code);
    else transition(STATES.FAILED, "tray-backends-unavailable");
  }

  async function handleNoHost(expectedGeneration, expectedChild) {
    if (!isCurrent(expectedGeneration, expectedChild)) return;
    clearTimer("startup");
    const code = "status-notifier-host-missing";
    if (String(sessionType).toLowerCase() === "x11") {
      const fallbackStarted = await startFallback(code);
      if (!fallbackStarted) transition(STATES.FAILED, "tray-backends-unavailable");
      return;
    }

    await stopNative();
    await stopFallback();
    transition(STATES.NO_HOST, code);
  }

  function scheduleHostLoss(expectedGeneration, expectedChild) {
    clearTimer("host-loss");
    hostLossTimer = timers.setTimeout(() => {
      hostLossTimer = null;
      void enqueue(async () => {
        if (!isCurrent(expectedGeneration, expectedChild) || hostRegistered !== false) return;
        await handleNoHost(expectedGeneration, expectedChild);
      });
    }, HOST_LOSS_DEBOUNCE_MS);
  }

  async function activateNative(expectedGeneration, expectedChild) {
    if (!isCurrent(expectedGeneration, expectedChild) || !ready || hostRegistered !== true) return;
    clearTimer("startup");
    clearTimer("host-loss");
    await stopFallback();
    transition(STATES.NATIVE, null);
  }

  async function dispatchCommand(message) {
    if (health.status !== STATES.NATIVE || message.revision !== menuRevision) return;
    const router = menuSnapshot.commands;
    if (!router.has(message.id)) return;
    await router.execute(message.id);
    if (typeof getMenuSnapshot !== "function") return;
    const freshSnapshot = await getMenuSnapshot();
    if (freshSnapshot) await replaceMenuNow(freshSnapshot);
  }

  async function handleHelperMessage(expectedGeneration, expectedChild, message) {
    if (!isCurrent(expectedGeneration, expectedChild)) return;
    switch (message.type) {
      case "ready":
        ready = true;
        if (hostRegistered === false) {
          await handleNoHost(expectedGeneration, expectedChild);
        } else {
          await activateNative(expectedGeneration, expectedChild);
        }
        break;
      case "host-status":
        hostRegistered = message.registered;
        if (message.registered) {
          clearTimer("host-loss");
          await activateNative(expectedGeneration, expectedChild);
        } else if (ready && health.status === STATES.NATIVE) {
          scheduleHostLoss(expectedGeneration, expectedChild);
        } else if (ready) {
          await handleNoHost(expectedGeneration, expectedChild);
        }
        break;
      case "menu-opened":
        if (health.status === STATES.NATIVE) menuOpenedHandler();
        break;
      case "command":
        await dispatchCommand(message);
        break;
      case "error":
        await handleNativeFailure(expectedGeneration, expectedChild, "native-helper-error");
        break;
      case "stopped":
        break;
      default:
        break;
    }
  }

  async function replaceMenuNow(snapshot) {
    menuSnapshot = validateSnapshot(snapshot);
    menuRevision += 1;
    if (child) {
      send({
        version: 1,
        type: "replace-menu",
        revision: menuRevision,
        items: menuSnapshot.items,
      });
    }
    if (fallback.isActive()) await fallback.replaceMenu(menuSnapshot);
  }

  fallback.onMenuOpened(() => menuOpenedHandler());

  return {
    start(snapshot) {
      return enqueue(async () => {
        if (active) {
          await replaceMenuNow(snapshot);
          return;
        }
        menuSnapshot = validateSnapshot(snapshot);
        menuRevision = 0;
        iconRevision = 0;
        attention = false;
        restartAttempts = 0;
        active = true;
        transition(STATES.STARTING, null);
        const spawned = await spawnNative();
        if (!spawned) await handleNativeFailure(generation, child, "native-spawn-failed");
      });
    },

    replaceMenu(snapshot) {
      return enqueue(() => replaceMenuNow(snapshot));
    },

    setAttention(nextAttention) {
      return enqueue(async () => {
        attention = nextAttention === true;
        iconRevision += 1;
        if (child) {
          send({
            version: 1,
            type: "set-icon",
            revision: iconRevision,
            icon: attention ? "agentlog-pet-attention" : "agentlog-pet",
          });
        }
        if (fallback.isActive()) await fallback.setAttention(attention);
      });
    },

    stop() {
      return enqueue(async () => {
        active = false;
        clearTimer("restart");
        clearNativeTimers();
        await stopNative();
        await stopFallback();
        transition(STATES.STOPPED, null);
      });
    },

    getHealth() {
      if (health.status === STATES.STOPPED) {
        return { status: STATES.STARTING, code: null };
      }
      return { ...health };
    },

    onMenuOpened(handler) {
      menuOpenedHandler = typeof handler === "function" ? handler : () => {};
    },
  };
}

module.exports = {
  STATES,
  RESTART_DELAYS_MS,
  STARTUP_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
  createLinuxTraySupervisor,
};
