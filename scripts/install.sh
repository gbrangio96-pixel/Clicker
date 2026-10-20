#!/bin/sh
set -eu
cd /workspace/Clicker
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) { console.error("Use Node.js 24.x"); process.exit(1); }'
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run prepare:demo
