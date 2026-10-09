#!/bin/sh
# Usage: sh diff.sh <recDir> [units]
REC=$1
UNITS=${2:-architecture gravity entropy rules}
BASE=/home/user/Katedrala/handoff/lab/promotion/baseline
for w in 1440 390; do
  for u in $UNITS; do
    for ext in txt aria.yml controls.txt; do
      echo "=== $w $u.$ext"
      diff "$BASE/$w/$u.$ext" "$REC/$w/$u.$ext"
    done
  done
done
