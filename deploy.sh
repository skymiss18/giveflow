#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter web build
pm2 list
pm2 restart giveflow
