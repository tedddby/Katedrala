#!/usr/bin/env node
import { runApp } from "./app";

process.exitCode = runApp(process.argv.slice(2), {
  currency: process.env.EXPENSE_CURRENCY ?? "EUR",
  logLevel: process.env.DEBUG ? "debug" : "info",
});
