#!/bin/bash
# PuzzleWork バックエンド起動スクリプト
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
cd "$(dirname "$0")"

# バンドルが古い or 存在しない場合のみリビルド
if [ ! -f dist/bundle.js ] || [ src/server.ts -nt dist/bundle.js ]; then
  echo "Building bundle..."
  node_modules/.bin/esbuild src/server.ts \
    --bundle --platform=node --target=node22 \
    --outfile=dist/bundle.js --external:pg-native --external:bcrypt 2>&1
fi

echo "Starting backend..."
exec node dist/bundle.js
