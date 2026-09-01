#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 6 ]]; then
  echo "用法: $0 <包名> <服务端文件> <引擎文件> <上游目录> <输出目录> <tar.gz|zip>" >&2
  exit 2
fi

package_name=$1
server_binary=$2
engine_binary=$3
upstream_dir=$4
output_dir=$5
archive_format=$6

for required in "$server_binary" "$engine_binary" "$upstream_dir/pikafish.nnue" \
  "$upstream_dir/Copying.txt" "$upstream_dir/NNUE-License.md"; do
  if [[ ! -f "$required" ]]; then
    echo "缺少打包文件: $required" >&2
    exit 1
  fi
done

package_dir="$output_dir/$package_name"
if [[ -e "$package_dir" ]]; then
  echo "输出目录已存在，请先清理: $package_dir" >&2
  exit 1
fi

mkdir -p "$package_dir/pikafish" "$package_dir/licenses"
cp "$server_binary" "$package_dir/"
engine_target=pikafish
if [[ "$server_binary" == *.exe ]]; then
  engine_target=pikafish.exe
fi
cp "$engine_binary" "$package_dir/pikafish/$engine_target"
if [[ "$server_binary" != *.exe ]]; then
  chmod +x "$package_dir/$(basename "$server_binary")" "$package_dir/pikafish/$engine_target"
fi
cp "$upstream_dir/pikafish.nnue" "$package_dir/pikafish/"
cp "$upstream_dir/Copying.txt" "$package_dir/pikafish/"
cp "$upstream_dir/NNUE-License.md" "$package_dir/pikafish/"
cp "$upstream_dir/AUTHORS" "$package_dir/pikafish/"
cp third_party/pikafish/SOURCE.md "$package_dir/pikafish/"
cp LICENSE README.md DISTRIBUTION-NOTICE.md "$package_dir/"
cp LICENSES/MIT-tsonglew.txt "$package_dir/licenses/"
cp assets/godogpaw-LICENSE.txt "$package_dir/licenses/"
cp assets/wasm_exec-LICENSE.txt "$package_dir/licenses/"
cp vendor/three/LICENSE "$package_dir/licenses/Three.js-LICENSE.txt"

case "$archive_format" in
  tar.gz)
    tar -C "$output_dir" -czf "$output_dir/$package_name.tar.gz" "$package_name"
    ;;
  zip)
    (cd "$output_dir" && 7z a -bd -tzip "$package_name.zip" "$package_name" >/dev/null)
    ;;
  *)
    echo "不支持的归档格式: $archive_format" >&2
    exit 2
    ;;
esac
