#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
image="chess-cn:dev"
platform=""
publish=false
no_cache=false

usage() {
  cat <<'EOF'
用法: ./docker-build.sh [选项]

选项:
  --tag IMAGE         镜像名称，默认 chess-cn:dev
  --platform LIST     目标平台，默认当前主机；例如 linux/amd64 或 linux/amd64,linux/arm64
  --push              推送到镜像仓库；多平台构建必须使用此选项
  --no-cache          不使用 Docker 构建缓存
  -h, --help          显示帮助

示例:
  ./docker-build.sh
  ./docker-build.sh --platform linux/arm64 --tag chess-cn:arm64
  ./docker-build.sh --platform linux/amd64,linux/arm64 \
    --tag ghcr.io/inbjo/chess-cn:v0.1.0 --push
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      [[ $# -ge 2 ]] || { echo "--tag 缺少参数" >&2; exit 2; }
      image=$2
      shift 2
      ;;
    --platform)
      [[ $# -ge 2 ]] || { echo "--platform 缺少参数" >&2; exit 2; }
      platform=$2
      shift 2
      ;;
    --push)
      publish=true
      shift
      ;;
    --no-cache)
      no_cache=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知选项: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "未安装 docker" >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "未安装 docker buildx" >&2; exit 1; }

if [[ -z "$platform" ]]; then
  case "$(uname -m)" in
    x86_64|amd64) platform=linux/amd64 ;;
    aarch64|arm64) platform=linux/arm64 ;;
    *) echo "无法识别当前架构，请使用 --platform" >&2; exit 1 ;;
  esac
fi

if [[ "$platform" == *,* && "$publish" != true ]]; then
  echo "多平台镜像无法同时载入本地 Docker；请指定 --push 和仓库镜像名。" >&2
  exit 2
fi

args=(buildx build --platform "$platform" --tag "$image")
args+=(--build-arg "GITHUB_PROXY=${CHESS_GITHUB_PROXY-https://sina.dev/}")
if [[ "$publish" == true ]]; then
  args+=(--push)
else
  args+=(--load)
fi
if [[ "$no_cache" == true ]]; then
  args+=(--no-cache)
fi
args+=("$root")

printf '构建镜像：%s（%s）\n' "$image" "$platform"
docker "${args[@]}"

if [[ "$publish" == true ]]; then
  printf '已推送：%s\n' "$image"
else
  printf '已载入本地：%s\n运行：docker run --rm -p 8000:8000 %s\n' "$image" "$image"
fi
