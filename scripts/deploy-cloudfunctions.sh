#!/usr/bin/env sh

set -eu

FUNCTIONS="contentApi growthApi commerceApi opsApi payApi adminApi"

for fn in $FUNCTIONS; do
  echo "Deploying $fn"
  tcb fn deploy "$fn"
done
