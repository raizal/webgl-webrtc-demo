#!/bin/sh
set -e

# Print colorful messages
green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
red() { printf "\033[0;31m%s\033[0m\n" "$1"; }

# Print header
green "====================================="
green "      ODDBIT APPLICATION STARTUP     "
green "====================================="

# Print environment details
yellow "Environment:"
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "DEBUG: $DEBUG"

# Check if public directory exists and has content
yellow "Checking public directory..."
if [ -d "./public" ] && [ "$(ls -A ./public)" ]; then
  green "✓ Public directory exists and contains files"
  ls -la ./public | head -n 10
  
  # Count files to verify frontend build
  file_count=$(find ./public -type f | wc -l)
  green "  Total files: $file_count"
else
  red "✗ Public directory is missing or empty"
  mkdir -p ./public
fi

# Check if dist directory exists and has content
yellow "Checking dist directory..."
if [ -d "./dist" ] && [ "$(ls -A ./dist)" ]; then
  green "✓ Dist directory exists and contains files"
  find ./dist -name "*.js" -not -path "*/node_modules/*" | sort | head -n 10
else
  red "✗ Dist directory is missing or empty"
  ls -la ./
  exit 1
fi

# Find main file with clear logging
yellow "Locating main file..."
if [ -f "dist/main.js" ]; then
  green "✓ Starting dist/main.js"
  exec node dist/main.js
elif [ -f "dist/src/main.js" ]; then
  green "✓ Starting dist/src/main.js"
  exec node dist/src/main.js
else
  yellow "Searching for main file..."
  MAIN_FILE=$(find dist -name "*.js" | grep -i main | head -1)
  if [ -n "$MAIN_FILE" ]; then
    green "✓ Starting $MAIN_FILE"
    exec node "$MAIN_FILE"
  else
    red "ERROR: Could not find main file to execute"
    red "Contents of dist directory:"
    ls -la dist
    exit 1
  fi
fi 