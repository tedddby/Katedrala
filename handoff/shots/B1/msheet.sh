#!/bin/bash
# usage: msheet.sh <refDir> <newDir> <out> <tags...>  phone pairs: reference then new, side by side, 6 pairs a row
ref=$1; new=$2; out=$3; shift 3
inputs=(); filters=""; i=0
for tag in "$@"; do
  r="$ref/m-$tag.png"; [ -f "$r" ] || r="$ref/m-p1000.png"
  inputs+=(-i "$r" -i "$new/m-$tag.png")
  a=$((i*2)); b=$((i*2+1))
  filters+="[$a:v]scale=260:-1,pad=iw+4:ih:0:0:color=0x303030[l$i];[$b:v]scale=260:-1,pad=iw+14:ih:0:0:color=0x303030[r$i];"
  i=$((i+1))
done
cells=""; for ((k=0;k<i;k++)); do cells+="[l$k][r$k]"; done
filters+="${cells}hstack=inputs=$((i*2))[out]"
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$filters" -map "[out]" "$out"
