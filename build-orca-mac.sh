#!/usr/bin/env bash
set -e
pnpm install:release && pnpm -C mobile install --frozen-lockfile
SHELL=/bin/zsh pnpm run build:desktop
pnpm run build:computer-macos
pnpm run build:keyboard-layout-macos
pnpm run build:process-footprint-macos
pnpm run build:notification-status-macos
pnpm run ensure:electron-runtime
SHELL=/bin/zsh pnpm exec electron-builder --config config/electron-builder.config.cjs --mac dmg zip --arm64
