#!/bin/sh
cd "$(dirname "$0")"
mkdir -p logs
node chains.mjs 1440 > logs/chains-1440.txt 2>&1
node chains.mjs 1440 reduced > logs/chains-1440-reduced.txt 2>&1
node chains.mjs 390 > logs/chains-390.txt 2>&1
node gravity-check.mjs 1440 > logs/gravity-1440.txt 2>&1
node gravity-check.mjs 390 > logs/gravity-390.txt 2>&1
node cascade-check.mjs 1440 > logs/cascade-1440.txt 2>&1
node cascade-check.mjs 1440 reduced > logs/cascade-1440-reduced.txt 2>&1
node svgtext.mjs 320,360,390,430,520,600,639,640,768,1024,1280,1440,1920 > logs/svgtext.txt 2>&1
node overflow.mjs 320,360,390,414,430 > logs/overflow.txt 2>&1
node reduced-targets.mjs > logs/targets.txt 2>&1
node axe-plates.mjs > logs/axe.txt 2>&1
echo done > logs/DONE
