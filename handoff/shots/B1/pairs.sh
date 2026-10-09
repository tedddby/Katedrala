#!/bin/bash
# usage: pairs.sh <refDir> <newDir> <prefix> <out> <tags...>   (each row: reference left, new right, scaled to 640 wide)
ref=$1; new=$2; prefix=$3; out=$4; shift 4
inputs=(); filters=""; i=0
for tag in "$@"; do
  inputs+=(-i "$ref/$prefix-$tag.png" -i "$new/$prefix-$tag.png")
  a=$((i*2)); b=$((i*2+1))
  filters+="[$a:v]scale=640:-1,pad=iw+8:ih:0:0:color=0x303030[l$i];[$b:v]scale=640:-1[r$i];[l$i][r$i]hstack=inputs=2,pad=iw:ih+8:0:0:color=0x303030[row$i];"
  i=$((i+1))
done
rows=""; for ((k=0;k<i;k++)); do rows+="[row$k]"; done
filters+="${rows}vstack=inputs=$i[out]"
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$filters" -map "[out]" "$out"
