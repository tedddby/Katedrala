"use strict";

const fs = require("fs");
const path = require("node:path");
const defaults = require("./defaults.json");

function readOverrides(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveDataFile(file) {
  return path.isAbsolute(file) ? file : path.join(__dirname, "..", file);
}

function loadConfig(env = process.env) {
  const overrides = readOverrides(path.resolve(env.TODO_CONFIG || "todo.config.json"));
  const config = { ...defaults, ...overrides };
  if (env.PORT) config.port = Number(env.PORT);
  if (env.TODO_PLUGINS !== undefined) config.plugins = env.TODO_PLUGINS.split(",").filter(Boolean);
  config.dataFile = resolveDataFile(config.dataFile);
  return config;
}

module.exports = { loadConfig, resolveDataFile };
