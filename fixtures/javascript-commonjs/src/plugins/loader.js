"use strict";

const path = require("path");

const PLUGIN_NAME = /^[a-z][a-z0-9-]*$/;

function loadPlugin(name) {
  if (!PLUGIN_NAME.test(name)) {
    throw new Error(`Invalid plugin name "${name}"`);
  }
  // Plugins are optional modules next to this file, selected by configuration at runtime.
  const pluginPath = path.join(__dirname, name);
  const plugin = require(pluginPath);
  if (typeof plugin !== "function") {
    throw new TypeError(`Plugin "${name}" must export a function`);
  }
  return plugin;
}

function loadPlugins(names = []) {
  return names.map((name) => loadPlugin(name));
}

module.exports = { loadPlugin, loadPlugins };
