#!/bin/sh
node \
   dst/server/index.mjs -v2 \
   -a 0.0.0.0 -p 12346 \
   -A 10.0.0.21:8099 \
   -B 10.0.0.22:8099
