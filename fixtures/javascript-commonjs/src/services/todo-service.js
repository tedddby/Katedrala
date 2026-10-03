"use strict";

const crypto = require("crypto");
const { validateTitle, MAX_TITLE_LENGTH } = require("../lib/validation");

function listTodos(store, { limit = 50, includeDone = true } = {}) {
  return store
    .all()
    .filter((todo) => includeDone || !todo.done)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

function createTodo(store, title, dueAt) {
  const problem = validateTitle(title);
  if (problem) throw new Error(problem);
  const todo = {
    id: crypto.randomUUID(),
    title: title.trim().slice(0, MAX_TITLE_LENGTH),
    done: false,
    createdAt: new Date().toISOString(),
    dueAt: dueAt || null,
  };
  store.put(todo);
  return todo;
}

function completeTodo(store, id) {
  const todo = store.get(id);
  if (!todo) return null;
  const updated = { ...todo, done: true, completedAt: new Date().toISOString() };
  store.put(updated);
  return updated;
}

exports.listTodos = listTodos;
exports.createTodo = createTodo;
module.exports.completeTodo = completeTodo;
