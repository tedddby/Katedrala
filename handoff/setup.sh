#!/usr/bin/env bash
# Prepares a cloud session (Ubuntu, root) to continue the Katedrala build. Safe to run again.
# Needs the environment's network access set to "Full": the Playwright browser download and Microsoft's Edge
# package are not on the default trusted list.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Katedrala checkout: $REPO"

# Node 22.12 or later (vitest 5 and commander 15 need it).
node -e 'const [a, b] = process.versions.node.split(".").map(Number);
if (a < 22 || (a === 22 && b < 12)) { console.error("Node " + process.versions.node + " is too old: Katedrala needs 22.12 or later"); process.exit(1); }'

# pnpm, pinned by both package.json files ("packageManager": "pnpm@11.21.0").
if ! (corepack enable && corepack prepare pnpm@11.21.0 --activate) >/dev/null 2>&1; then npm install -g pnpm@11.21.0; fi
pnpm --version

# The engine workspace and the site (a separate pnpm project with its own lockfile).
(cd "$REPO" && pnpm install --frozen-lockfile)
(cd "$REPO/site" && pnpm install --frozen-lockfile)

# The harness scripts in handoff/shots refer to the checkout as /katedrala.
ln -sfn "$REPO" /katedrala

# CodeVerse at the commit the site's numbers were computed from, with its dependencies installed as they were on
# the machine that produced those numbers (its install scripts are not needed for analysis).
if [ ! -d /codeverse/.git ]; then git clone --quiet https://github.com/tedddby/CodeVerse.git /codeverse; fi
git -C /codeverse checkout --quiet 6b942bc
(cd /codeverse && pnpm install --frozen-lockfile --ignore-scripts)

# The Impeccable design skill at the version used so far (its rules, references and detector).
if [ ! -d /opt/impeccable/.git ]; then
  git clone --quiet --depth 1 --branch skill-v4.5.0 https://github.com/pbakaus/impeccable.git /opt/impeccable
fi

# The screenshot and accessibility harness. Its scripts launch Edge (channel "msedge"); Chromium is the fallback.
cd "$REPO/handoff/shots"
npm install --no-audit --no-fund
npx playwright-core install --with-deps chromium
npx playwright-core install msedge || echo 'Edge did not install: remove channel: "msedge" from the launch calls to use Chromium.'

echo "Ready."
