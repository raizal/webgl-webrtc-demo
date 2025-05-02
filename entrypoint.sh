#!/bin/sh
set -e

echo "=== Environment ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "=== Application files ==="
find ./dist -type f | sort

echo "=== Checking for main file ==="
if [ -f "dist/main.js" ]; then
  echo "Starting dist/main.js"
  exec node dist/main.js
elif [ -f "dist/src/main.js" ]; then
  echo "Starting dist/src/main.js"
  exec node dist/src/main.js
else
  echo "Searching for main file..."
  MAIN_FILE=$(find dist -name "*.js" | grep -i main | head -1)
  if [ -n "$MAIN_FILE" ]; then
    echo "Starting $MAIN_FILE"
    exec node "$MAIN_FILE"
  else
    echo "ERROR: Could not find main file to execute"
    echo "Contents of dist directory:"
    ls -la dist
    exit 1
  fi
fi 