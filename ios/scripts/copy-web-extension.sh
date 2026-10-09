#!/bin/bash
# Xcode pre-build phase of the ThriftExtension target.
#
# Copies the Safari web build (extension/.output/safari-mv3/, produced by
# `pnpm --filter @thrift/extension build:safari`) into the root of
# ThriftExtension.appex, which is where Safari looks for manifest.json.
#
# Why a script and not a folder reference: a folder reference would land in a
# subfolder of the .appex (e.g. ThriftExtension.appex/WebExtension/manifest.json),
# where Safari does not find it. Copying straight into the bundle root avoids
# that and keeps the Xcode project free of per-file references to build output.
set -euo pipefail

: "${SRCROOT:?run from Xcode}"
: "${TARGET_BUILD_DIR:?run from Xcode}"
: "${UNLOCALIZED_RESOURCES_FOLDER_PATH:?run from Xcode}"

SRC="${WEB_EXTENSION_DIR:-$SRCROOT/../extension/.output/safari-mv3}"
DEST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
LIST="${DERIVED_FILE_DIR:-$TARGET_TEMP_DIR}/web-extension-files.txt"

if [ ! -f "$SRC/manifest.json" ]; then
  echo "error: Safari web extension build not found (expected $SRC/manifest.json)."
  echo "error: From the repository root run: pnpm install && pnpm --filter @thrift/extension build:safari — then build again."
  exit 1
fi

mkdir -p "$DEST" "$(dirname "$LIST")"

# Remove files copied by the previous build, so deleted/renamed bundle files don't linger.
if [ -f "$LIST" ]; then
  while IFS= read -r rel; do
    if [ -n "$rel" ]; then rm -f "$DEST/$rel"; fi
  done < "$LIST"
fi

(cd "$SRC" && find . -type f ! -name '.DS_Store' | sed 's|^\./||') > "$LIST"
cp -Rp "$SRC/." "$DEST/"
find "$DEST" -name '.DS_Store' -delete

echo "Copied Safari web extension from $SRC to $DEST ($(wc -l < "$LIST" | tr -d ' ') files)."
