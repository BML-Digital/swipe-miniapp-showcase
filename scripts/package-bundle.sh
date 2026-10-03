#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dist_dir="$project_dir/dist"
bundle="$dist_dir/swipe-miniapp-demo.zip"

mkdir -p "$dist_dir"
rm -f "$bundle"
cd "$project_dir/miniapp"
zip -q -r "$bundle" index.html assets

digest=$(openssl dgst -sha384 -binary "$bundle" | openssl base64 -A)
printf 'Created %s\nsha384-%s\n' "$bundle" "$digest"
