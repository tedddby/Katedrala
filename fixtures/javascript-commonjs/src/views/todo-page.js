"use strict";

const { h, Fragment, renderToString } = require("../lib/html.cjs");
const { Layout } = require("./layout");

function TodoItem({ todo }) {
  return (
    <li className={todo.done ? "todo done" : "todo"}>
      <form method="post" action={`/todos/${todo.id}/complete`}>
        <button type="submit" disabled={todo.done}>
          Done
        </button>
      </form>
      <span className="title">{todo.title}</span>
      {todo.dueLabel ? (
        <>
          {" "}
          <small className={todo.overdue ? "due overdue" : "due"}>{todo.dueLabel}</small>
        </>
      ) : null}
    </li>
  );
}

function renderTodoPage(todos) {
  const open = todos.filter((todo) => !todo.done).length;
  const page = (
    <Layout title={`To-do (${open} open)`}>
      <form method="post" action="/todos" className="new-todo">
        <input name="title" placeholder="What needs to be done?" required />
        <input name="dueAt" type="date" />
        <button type="submit">Add</button>
      </form>
      <ul className="todos">
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </ul>
    </Layout>
  );
  return `<!doctype html>${renderToString(page)}`;
}

module.exports = { renderTodoPage, TodoItem };
