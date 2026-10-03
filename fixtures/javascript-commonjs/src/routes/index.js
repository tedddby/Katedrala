"use strict";

const { listTodos, createTodo, completeTodo } = require("../services/todo-service");
const health = require("./health.js");
const { renderTodoPage } = require("../views/todo-page");

function wantsHtml(req) {
  return req.accepts(["json", "html"]) === "html";
}

function registerRoutes(app, { store, config }) {
  app.get("/healthz", health.liveness);
  app.get("/readyz", health.readiness(store));

  app.get("/", async (req, res, next) => {
    try {
      // dates.mjs is an ES module, so CommonJS code loads it with a dynamic import.
      const { formatDue, isOverdue } = await import("../lib/dates.mjs");
      const now = new Date();
      const todos = listTodos(store, { limit: config.pageSize }).map((todo) => {
        const due = todo.dueAt ? new Date(todo.dueAt) : null;
        return {
          ...todo,
          dueLabel: due ? formatDue(due, now) : "",
          overdue: due ? !todo.done && isOverdue(due, now) : false,
        };
      });
      res.type("html").send(renderTodoPage(todos));
    } catch (error) {
      next(error);
    }
  });

  app.post("/todos", (req, res) => {
    let todo;
    try {
      todo = createTodo(store, req.body.title, req.body.dueAt);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (wantsHtml(req)) return res.redirect(303, "/");
    return res.status(201).json(todo);
  });

  app.post("/todos/:id/complete", (req, res) => {
    const todo = completeTodo(store, req.params.id);
    if (!todo) return res.status(404).json({ error: "not found" });
    if (wantsHtml(req)) return res.redirect(303, "/");
    return res.json(todo);
  });
}

module.exports = registerRoutes;
