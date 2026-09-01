#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
revision="b135b58d1b45c2dc090bbc346a27cfbc6e08b2dd"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ -n "${GODOGPAW_PATCHED_SOURCE:-}" ]]; then
  cp -a "$GODOGPAW_PATCHED_SOURCE" "$work/godogpaw"
else
  mkdir "$work/godogpaw"
  curl --fail --location --retry 3 --retry-all-errors \
    "https://github.com/hmgle/godogpaw/archive/$revision.tar.gz" |
    tar -xz --strip-components=1 -C "$work/godogpaw"
  git -C "$work/godogpaw" apply --unidiff-zero "$root/godogpaw.patch"
fi

(
  cd "$work/godogpaw"
  go test -count=1 ./engine/...
  GOOS=js GOARCH=wasm go build -o "$root/assets/godogpaw.wasm" ./wasm/
)
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$root/js/wasm_exec.js" 2>/dev/null || \
  cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" "$root/js/wasm_exec.js"
cp "$work/godogpaw/LICENSE" "$root/assets/godogpaw-LICENSE.txt"
cp "$(go env GOROOT)/LICENSE" "$root/assets/wasm_exec-LICENSE.txt"

printf 'Built assets/godogpaw.wasm from %s\n' "$revision"
