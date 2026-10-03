"use strict";

const express = require("express");
const registerRoutes = require("./routes");
const { loadConfig } = require("./config");
const { loadPlugins } = require("./plugins/loader");
const MemoryStore = require("./store/memory-store");

function createServer(config = loadConfig()) {
  const app = express();
  const store = new MemoryStore(config.dataFile);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  for (const plugin of loadPlugins(config.plugins)) {
    plugin(app, { store, config });
  }
  registerRoutes(app, { store, config });
  return app;
}

if (require.main === module) {
  const config = loadConfig();
  createServer(config).listen(config.port, () => {
    console.log(`todo-server listening on http://localhost:${config.port}`);
  });
}

module.exports = { createServer };
