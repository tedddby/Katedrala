"use strict";

const fs = require("fs");
const path = require("path");

function auditLog(app, { config }) {
  const file = path.join(path.dirname(config.dataFile), "audit.log");
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      res.on("finish", () => {
        const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode}\n`;
        fs.appendFile(file, line, () => {});
      });
    }
    next();
  });
}

module.exports = auditLog;
