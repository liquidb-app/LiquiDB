#!/bin/bash

# Generate release notes from template
# Usage: ./scripts/generate-release-notes.sh <version> <previous_version> <repo>

set -e

VERSION="${1:-}"
PREVIOUS_VERSION="${2:-}"
REPO="${3:-liquid/LiquiDB}"

if [ -z "$VERSION" ]; then
  echo "Error: Version is required"
  echo "Usage: $0 <version> [previous_version] [repo]"
  exit 1
fi

# If previous version is not provided, try to get it from git tags
if [ -z "$PREVIOUS_VERSION" ]; then
  PREVIOUS_VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "")
  if [ -z "$PREVIOUS_VERSION" ]; then
    PREVIOUS_VERSION="1.0.0"
  fi
fi

TEMPLATE_FILE=".github/RELEASE_NOTES_TEMPLATE.md"
OUTPUT_FILE=".github/RELEASE_NOTES.md"

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: Template file not found: $TEMPLATE_FILE"
  exit 1
fi

# Replace placeholders in template
sed -e "s/\${VERSION}/$VERSION/g" \
    -e "s/\${PREVIOUS_VERSION}/$PREVIOUS_VERSION/g" \
    -e "s|\${REPO}|$REPO|g" \
    "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "Release notes generated: $OUTPUT_FILE"
cat "$OUTPUT_FILE"

