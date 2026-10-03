"use strict";

exports.liveness = function liveness(req, res) {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
};

exports.readiness = function readiness(store) {
  return function readinessCheck(req, res) {
    const ready = store.isLoaded();
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "loading" });
  };
};
