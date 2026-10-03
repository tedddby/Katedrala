"use strict";

const { h } = require("../lib/html.cjs");

function Layout({ title, children }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{title}</title>
        <link rel="stylesheet" href="/static/app.css" />
      </head>
      <body>
        <header>
          <h1>{title}</h1>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

module.exports = { Layout };
