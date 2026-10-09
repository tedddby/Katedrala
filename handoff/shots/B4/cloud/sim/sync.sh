#!/bin/sh
# Copies the demo sources with explicit .ts imports, so Node can run them with --experimental-strip-types.
cd "$(dirname "$0")"
for f in system metrics plan entropy impact layout; do
  sed -E 's#from "\./([a-z]+)"#from "./\1.ts"#' /home/user/Katedrala/site/lib/demo/$f.ts > $f.ts
done
