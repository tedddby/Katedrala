"use strict";

// Minimal JSX runtime: babel compiles <div /> to h("div", props, ...children) (see babel.config.json).

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "link", "meta"]);
const Fragment = Symbol.for("todo.fragment");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function h(tag, props, ...children) {
  if (typeof tag === "function") return tag({ ...props, children });
  return { tag, props: props || {}, children: children.flat() };
}

function renderAttributes(props) {
  return Object.entries(props)
    .filter(([name, value]) => name !== "key" && value !== false && value !== null && value !== undefined)
    .map(([name, value]) => {
      const attribute = name === "className" ? "class" : name;
      return value === true ? ` ${attribute}` : ` ${attribute}="${escapeHtml(value)}"`;
    })
    .join("");
}

function renderToString(node) {
  if (node === null || node === undefined || node === false) return "";
  if (Array.isArray(node)) return node.map(renderToString).join("");
  if (typeof node !== "object") return escapeHtml(node);
  if (node.tag === Fragment) return renderToString(node.children);
  const attributes = renderAttributes(node.props);
  if (VOID_ELEMENTS.has(node.tag)) return `<${node.tag}${attributes}>`;
  return `<${node.tag}${attributes}>${renderToString(node.children)}</${node.tag}>`;
}

module.exports = { h, Fragment, renderToString, escapeHtml };
