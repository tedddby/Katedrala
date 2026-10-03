"use strict";

const fs = require("fs");
const path = require("path");

class MemoryStore {
  constructor(file) {
    this.file = file;
    this.items = new Map();
    this.loaded = false;
    this.load();
  }

  load() {
    if (this.file && fs.existsSync(this.file)) {
      for (const item of JSON.parse(fs.readFileSync(this.file, "utf8"))) {
        this.items.set(item.id, item);
      }
    }
    this.loaded = true;
  }

  isLoaded() {
    return this.loaded;
  }

  all() {
    return [...this.items.values()];
  }

  get(id) {
    return this.items.get(id);
  }

  put(item) {
    this.items.set(item.id, item);
    this.flush();
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.all(), null, 2));
  }
}

module.exports = MemoryStore;
