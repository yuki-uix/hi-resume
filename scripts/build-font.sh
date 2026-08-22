#!/usr/bin/env bash
# Build the bundled static CJK fonts (see build-font.py). One-off tooling:
# creates a throwaway venv, installs fontTools, runs the build. The venv is
# gitignored; the produced .woff2 files are committed to the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .fontenv/bin/python ]; then
  python3 -m venv .fontenv
fi

.fontenv/bin/pip install --quiet fonttools brotli
.fontenv/bin/python scripts/build-font.py
