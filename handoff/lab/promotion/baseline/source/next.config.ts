import type { NextConfig } from "next";

/** Static export: the site is plain HTML, CSS and a little JavaScript, deployable on any static host. */
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  // Do not write AGENTS.md / CLAUDE.md into the project on `next dev`.
  agentRules: false,
  devIndicators: false,
};

export default config;
