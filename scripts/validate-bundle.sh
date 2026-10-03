#!/bin/sh
set -eu
bundle=${1:-dist/swipe-miniapp-demo.zip}
test -f "$bundle" || { echo "Bundle not found: $bundle" >&2; exit 1; }
files=$(unzip -Z1 "$bundle")
printf '%s\n' "$files" | grep -qx 'index.html' || { echo 'index.html must be at the archive root' >&2; exit 1; }
if printf '%s\n' "$files" | grep -Eq '(^|/)(\.env|\.dev\.vars|worker|server|node_modules)(/|$|\.)|\.map$'; then
  echo 'Bundle contains a forbidden file' >&2
  exit 1
fi
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT INT TERM
unzip -q "$bundle" -d "$tmp_dir"
if grep -R -n -E '<base[ >]|<script[^>]*>[^<]+</script>| on[a-z]+=' "$tmp_dir" --include='*.html'; then
  echo 'Bundle contains HTML blocked by the runtime CSP' >&2
  exit 1
fi
if grep -R -n -E '(src|href|action|poster)="/' "$tmp_dir" --include='*.html'; then
  echo 'Bundle contains an absolute asset path' >&2
  exit 1
fi
echo "Bundle contract checks passed: $bundle"
