#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bind_addr="${CHESS_BIND:-127.0.0.1:8000}"
build_mode="debug"
run_verify=0
disable_ai=0

usage() {
  cat <<'EOF'
用法：./dev.sh [选项]

选项：
  --release        使用 release 构建启动
  --verify         启动前运行 Rust/JavaScript 完整检查
  --no-ai          禁用 Pikafish 引擎；godogpaw 人机仍可使用
  --bind ADDR      指定监听地址，默认 127.0.0.1:8000
  -h, --help       显示帮助

环境变量：
  PIKAFISH_PATH       Pikafish 路径，默认自动检测 /opt/pikafish/pikafish
  PIKAFISH_NNUE       NNUE 路径，默认自动检测 /opt/pikafish/pikafish.nnue
  CHESS_AI_POOL_SIZE  AI 进程池大小，默认 2
  CHESS_AI_HASH_MB    每个 AI 进程的 Hash 内存，默认 32 MB
  RUST_LOG            日志级别，默认 chess_cn_server=debug
EOF
}

while (($# > 0)); do
  case "$1" in
    --release)
      build_mode="release"
      shift
      ;;
    --verify)
      run_verify=1
      shift
      ;;
    --no-ai)
      disable_ai=1
      shift
      ;;
    --bind)
      if (($# < 2)); then
        printf '错误：--bind 需要地址参数\n' >&2
        exit 2
      fi
      bind_addr="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '错误：未知参数 %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$script_dir"

if ! command -v cargo >/dev/null 2>&1; then
  printf '错误：未找到 cargo，请先安装 Rust 工具链。\n' >&2
  exit 1
fi

if ((run_verify)); then
  printf '[verify] 检查 Rust 格式与静态分析...\n'
  cargo fmt --all -- --check
  cargo clippy --all-targets -- -D warnings
  cargo test

  if command -v npm >/dev/null 2>&1; then
    printf '[verify] 检查前端语法与规则测试...\n'
    npm run check
  else
    printf '[verify] 警告：未找到 npm，跳过前端检查。\n' >&2
  fi
fi

if ((disable_ai)); then
  export CHESS_DISABLE_AI=1
  ai_summary="已禁用"
else
  if [[ -z "${PIKAFISH_PATH:-}" && -x /opt/pikafish/pikafish ]]; then
    export PIKAFISH_PATH=/opt/pikafish/pikafish
  fi
  if [[ -z "${PIKAFISH_NNUE:-}" && -r /opt/pikafish/pikafish.nnue ]]; then
    export PIKAFISH_NNUE=/opt/pikafish/pikafish.nnue
  fi

  if [[ -n "${PIKAFISH_PATH:-}" && -x "$PIKAFISH_PATH" ]]; then
    ai_summary="$PIKAFISH_PATH"
    if [[ -n "${PIKAFISH_NNUE:-}" && ! -r "$PIKAFISH_NNUE" ]]; then
      printf '错误：NNUE 文件不可读：%s\n' "$PIKAFISH_NNUE" >&2
      exit 1
    fi
  else
    ai_summary="未找到（Pikafish 引擎不可用）"
    printf '警告：未找到 Pikafish；Pikafish 引擎不可用，可设置 PIKAFISH_PATH 和 PIKAFISH_NNUE。\n' >&2
  fi
fi

export CHESS_BIND="$bind_addr"
export CHESS_AI_POOL_SIZE="${CHESS_AI_POOL_SIZE:-2}"
export CHESS_AI_HASH_MB="${CHESS_AI_HASH_MB:-32}"
export RUST_LOG="${RUST_LOG:-chess_cn_server=debug}"

printf '\n楚河漢界 · 本地开发服务\n'
printf '  地址：    http://%s\n' "$CHESS_BIND"
printf '  构建：    %s\n' "$build_mode"
printf '  Pikafish：%s\n' "$ai_summary"
printf '  前端：    修改 HTML/CSS/JS 后刷新浏览器即可\n'
printf '  停止：    Ctrl+C\n\n'

if [[ "$build_mode" == "release" ]]; then
  exec cargo run --release
else
  exec cargo run
fi
