#!/bin/sh
# Copy the site from the artifact into docs/ and stamp its script and stylesheet
# links with the artifact's commit, so browsers fetch fresh copies after an update
# instead of mixing a new index.html with cached old scripts.
# Usage: ./publish.sh [path to hotnets-artifact]   (then commit and push)
set -e
SRC=${1:-../hotnets-artifact}
cd "$(dirname "$0")"
rsync -a --delete --exclude test --exclude .nojekyll "$SRC/artifact/site/" docs/
V=$(git -C "$SRC" rev-parse --short HEAD)
sed -i -E "s#(src|href)=\"((js|data|content)/[^\"?]+\.js|style\.css)\"#\1=\"\2?v=$V\"#g" docs/index.html
echo "docs/ updated from $SRC at $V"
