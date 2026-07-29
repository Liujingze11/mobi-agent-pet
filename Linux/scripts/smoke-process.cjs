"use strict";

function stopChild(child, timeoutMs = 8_000) {
  if (!child || child.exitCode != null) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      reject(new Error("first instance did not exit after SIGTERM"));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve();
    };

    child.once("exit", onExit);
    child.kill("SIGTERM");
  });
}

function stopPid(pid, options = {}) {
  const kill = options.kill || process.kill;
  const pollMs = options.pollMs || 25;
  const timeoutMs = options.timeoutMs || 8_000;

  try {
    kill(pid, "SIGTERM");
  } catch (error) {
    if (error && error.code === "ESRCH") return Promise.resolve();
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const inspect = () => {
      try {
        kill(pid, 0);
      } catch (error) {
        if (error && error.code === "ESRCH") {
          resolve();
          return;
        }
        reject(error);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`process ${pid} did not exit after SIGTERM`));
        return;
      }
      setTimeout(inspect, pollMs);
    };
    inspect();
  });
}

module.exports = { stopChild, stopPid };
