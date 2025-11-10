#!/usr/bin/env bash
set -euo pipefail

OUTPUT="build.zip"
INCLUDE_ITEMS=(
  "image"
  "js"
  "manifest.json"
)

rm -f "$OUTPUT"
zip -r "$OUTPUT" "${INCLUDE_ITEMS[@]}" -x "*.DS_Store"

echo "Created $OUTPUT"