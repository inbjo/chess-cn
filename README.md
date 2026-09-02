# 楚河漢界 · 3D 中国象棋

一个运行在浏览器中的 Three.js 3D 中国象棋项目，支持 godogpaw/Pikafish 双人机引擎、本地双人和 WebSocket 联机对弈。

<img width="924" height="570" alt="楚河漢界 3D 中国象棋" src="https://github.com/user-attachments/assets/d0e616e7-5747-4cec-acb8-79e9632a030a" />

> 项目源码采用 GPL-3.0-or-later。完整发行包和 Docker 镜像包含受非商业条款约束的官方 Pikafish NNUE，仅供非商业使用。详见 [`DISTRIBUTION-NOTICE.md`](DISTRIBUTION-NOTICE.md)。

## Docker 部署（推荐）

官方镜像内置前端、godogpaw WASM、Pikafish 和 NNUE，支持 `linux/amd64` 与 `linux/arm64`。推荐使用 Docker Compose 部署。

### Docker Compose

```yaml
services:
  chess-cn:
    image: sina.dev/kudang/chess-cn:latest
    container_name: chess-cn
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      CHESS_AI_POOL_SIZE: "${CHESS_AI_POOL_SIZE:-2}"
      CHESS_AI_HASH_MB: "${CHESS_AI_HASH_MB:-32}"
      RUST_LOG: "${RUST_LOG:-chess_cn_server=info}"
```

将以上内容保存为 `docker-compose.yml`，然后启动：

```bash
docker compose up -d
```

打开 <http://127.0.0.1:8000>；局域网设备可通过 `http://主机IP:8000` 访问。

```bash
docker compose ps
docker compose logs -f
docker compose pull
docker compose up -d
docker compose down
```

### Docker CLI

不使用 Compose 时可以直接启动：

```bash
docker pull sina.dev/kudang/chess-cn:latest
docker run -d \
  --name chess-cn \
  --restart unless-stopped \
  -p 8000:8000 \
  sina.dev/kudang/chess-cn:latest
```

如需直连 Docker Hub，将镜像地址改为 `kudang/chess-cn:latest`。

### sina.dev 镜像代理

[`sina.dev`](https://sina.dev/) 是使用 [MirrorProxy](https://github.com/inbjo/MirrorProxy) 自部署的镜像代理，同时支持 Docker/OCI 镜像和 GitHub 文件加速：

- Docker Hub：在镜像名前增加 `sina.dev/`，例如 `sina.dev/kudang/chess-cn:latest`；
- GitHub：在原始 URL 前增加 `https://sina.dev/`，例如 `https://sina.dev/https://github.com/inbjo/chess-cn`；
- GitHub Raw 和 Release 附件使用相同的 URL 前缀方式。

该代理主要方便中国境内下载。能够稳定访问上游时，也可以直接使用 Docker Hub 和 GitHub 原始地址。

### 资源配置

Pikafish 默认维护 2 个常驻进程，每个进程使用 32 MB Hash。小型服务器可通过环境变量降低并发：

```bash
CHESS_AI_POOL_SIZE=1 CHESS_AI_HASH_MB=32 docker compose up -d
```

也可以编辑 `docker-compose.yml` 中的 `environment`。所有可用变量见[配置](#配置)。

## Cloudflare Pages 部署（纯静态专版）

Cloudflare Pages 专版只保留浏览器内运行的 **godogpaw WASM 人机**和**本地双人**，构建时会移除 Pikafish 与联机入口。普通源码页面、二进制发行包和 Docker 镜像仍保留完整功能。

生成专用静态目录：

```bash
npm run build:cloudflare
```

产物位于 `dist-cloudflare/`。构建脚本会复制页面所需资源、写入静态部署标记、裁剪服务端功能入口，并检查 Cloudflare Pages 的单文件大小与文件数量限制。

使用 Cloudflare Dashboard 连接本仓库时，在 **Workers & Pages → Create application → Pages → Connect to Git** 中填写：

| 设置 | 值 |
|---|---|
| Framework preset | `None` |
| Build command | `npm run build:cloudflare` |
| Build output directory | `dist-cloudflare` |
| Root directory | 留空（仓库根目录） |

保存后触发部署即可获得 `*.pages.dev` 地址。也可以使用 Wrangler 直接上传：

```bash
npx wrangler pages deploy dist-cloudflare --project-name=chess-cn
```

> Pages 是纯静态托管环境，不会运行仓库中的 Rust 服务端或原生 Pikafish 进程，因此该专版不提供 Pikafish、联机房间、WebSocket 和 `/api/*` 接口。

## 二进制部署

不使用容器时，可以下载完整发行包，或从源码构建单个 Rust 服务端。release 二进制已嵌入 HTML、CSS、JavaScript、WASM 和模型，无需额外部署前端文件。

### 下载发行包

在 [GitHub Releases](https://github.com/inbjo/chess-cn/releases) 下载对应平台的完整包：

| 平台 | 文件 | Pikafish 来源 |
|---|---|---|
| Linux x86_64 | `chess-cn-linux-x86_64.tar.gz` | 官方 SSE4.1 + POPCNT 二进制 |
| Linux ARM64 | `chess-cn-linux-aarch64.tar.gz` | 固定版本源码原生编译 |
| Windows x86_64 | `chess-cn-windows-x86_64.zip` | 官方二进制 |
| macOS Intel | `chess-cn-macos-x86_64.tar.gz` | 固定版本源码原生编译 |
| macOS Apple Silicon | `chess-cn-macos-aarch64.tar.gz` | 官方二进制 |

中国境内可以在 GitHub URL 前增加 `https://sina.dev/`，例如：

```bash
curl -fLO https://sina.dev/https://github.com/inbjo/chess-cn/releases/download/v1.2.0/chess-cn-linux-x86_64.tar.gz
curl -fLO https://sina.dev/https://github.com/inbjo/chess-cn/releases/download/v1.2.0/SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing
```

Linux 安装示例：

```bash
tar -xzf chess-cn-linux-x86_64.tar.gz
cd chess-cn-linux-x86_64
./chess-cn-server
```

Windows 解压后运行 `chess-cn-server.exe`，macOS 解压后运行 `./chess-cn-server`。服务端会自动发现同目录 `pikafish/` 下的引擎和 NNUE，并随机选择一个可用端口；控制台会显示实际访问地址。Windows 和 macOS 会自动打开默认浏览器，Linux 仅在检测到图形会话时自动打开，纯服务器环境不受影响。

> Linux x86_64 的内置 Pikafish 需要 SSE4.1 和 POPCNT 指令集。每个 Release 同时提供 `SHA256SUMS` 和固定 Pikafish 版本的对应源码归档。

### 从源码构建

```bash
npm run check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --release --locked
```

输出文件为 `target/release/chess-cn-server`。源码仓库不包含大型 Pikafish 二进制和 NNUE；需要服务端人机时，应将其放在可执行文件旁的 `pikafish/` 目录，或通过 `PIKAFISH_PATH` 和 `PIKAFISH_NNUE` 指定路径。

示例部署目录：

```text
/opt/chess-cn/
├── chess-cn-server
├── chess-cn.env
└── pikafish/
    ├── pikafish
    └── pikafish.nnue
```

`/opt/chess-cn/chess-cn.env`：

```bash
CHESS_BIND=0.0.0.0:8000
RUST_LOG=chess_cn_server=info
PIKAFISH_PATH=/opt/chess-cn/pikafish/pikafish
PIKAFISH_NNUE=/opt/chess-cn/pikafish/pikafish.nnue
CHESS_AI_POOL_SIZE=2
CHESS_AI_HASH_MB=64
```

不使用 Pikafish 时，删除两个 `PIKAFISH_*` 变量并增加 `CHESS_DISABLE_AI=1`。godogpaw 人机、本地双人和联机对弈仍可使用。

### systemd 服务

创建 `/etc/systemd/system/chess-cn.service`：

```ini
[Unit]
Description=Chess CN 3D Xiangqi Server
After=network.target

[Service]
Type=simple
User=chess-cn
Group=chess-cn
WorkingDirectory=/opt/chess-cn
EnvironmentFile=/opt/chess-cn/chess-cn.env
ExecStart=/opt/chess-cn/chess-cn-server
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chess-cn
sudo systemctl status chess-cn
journalctl -u chess-cn -f
```

服务本身不需要写入工作目录。请提前创建 `chess-cn` 系统用户，并确保可执行文件、Pikafish 和 NNUE 对该用户可读且引擎具有执行权限。

### Nginx 反向代理

WebSocket 与普通 HTTP 使用同一上游：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name chess.example.com;

    client_max_body_size 1m;

    gzip on;
    gzip_types text/css application/javascript application/json application/wasm;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}
```

公网部署必须配置 HTTPS；HTTPS 页面会自动通过 `wss://` 连接联机房间。建议让 Rust 服务只监听本机地址：

```bash
CHESS_BIND=127.0.0.1:8000
```

### 健康检查

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/ai/status
```

健康接口的正常响应为 `{"status":"ok"}`；AI 状态接口用于确认 Pikafish 是否可用。

### 单实例限制

当前联机房间、席位、棋谱和重开状态保存在 Rust 进程内存中：

- 服务重启会清空全部房间；
- 不应直接启动多个无共享状态的实例做轮询负载均衡；
- 多实例部署前需要将房间状态迁移到共享存储，并配置会话粘滞或统一消息总线。

## 功能

- Three.js 3D 棋盘、战场环境和 WebGL 特效
- 完整中国象棋规则：蹩马腿、塞象眼、炮翻山、兵过河、九宫、飞将、将军、绝杀、困毙和悔棋
- godogpaw WebAssembly 人机，在 Web Worker 中运行，不阻塞动画
- Pikafish + NNUE 服务端人机
- 两种引擎均支持入门、中等、困难、大师四档难度
- 本地双人对弈
- WebSocket 联机房间、服务端规则校验、断线重连和双方确认重开
- HTML、CSS、JavaScript、WASM 和模型嵌入 Rust 可执行文件
- WebGL 上下文与后台页签恢复

## 演示

### 帅 / 将全屏击杀特写

https://github.com/user-attachments/assets/ac0ad772-a503-47b1-89e3-691fbb4b09e0

### 完整攻击演示

https://github.com/user-attachments/assets/8aae6350-6348-47c0-bc0f-48be18bcc7e8

## 对弈模式

| 模式 | 说明 | 是否需要 Rust 服务端 |
|---|---|---|
| godogpaw 人机 | 浏览器 Web Worker 中运行 WASM | 否 |
| Pikafish 人机 | 服务端通过 UCI 调用 Pikafish 与 NNUE | 是 |
| 本地双人 | 同一设备轮流行棋 | 否 |
| 联机对弈 | 房间制 WebSocket 对局 | 是 |

人机引擎与难度可以独立选择。Pikafish 不可用时只禁用 Pikafish 选项，不影响 godogpaw、本地双人和联机模式。

联机对弈流程：

1. 创建者执红并获得 6 位房间号和邀请链接；
2. 对手加入后执黑；
3. 服务端校验身份、行棋方、版本和着法；
4. 断线后客户端自动重连并恢复服务端棋谱；
5. 重开需要双方确认。

联机模式暂不支持悔棋。房间 24 小时无活动后自动清理。

## 从源码运行

要求：

- Rust 工具链和 Cargo
- Node.js（运行前端检查时需要）
- 支持 WebGL、WebAssembly、Web Worker 和 ES Modules 的现代浏览器

启动开发服务：

```bash
./dev.sh
```

常用选项：

```bash
./dev.sh --verify                 # 检查 Rust 和 JavaScript 后启动
./dev.sh --release                # 使用 release 构建
./dev.sh --no-ai                  # 禁用 Pikafish
./dev.sh --bind 127.0.0.1:8080    # 修改监听地址
```

源码仓库不包含大型 Pikafish 二进制和 NNUE。需要使用 Pikafish 时请自行配置：

```bash
PIKAFISH_PATH=/opt/pikafish/pikafish \
PIKAFISH_NNUE=/opt/pikafish/pikafish.nnue \
./dev.sh --release
```

只使用 godogpaw 人机和本地双人时，也可启动纯静态服务：

```bash
python3 -m http.server 8000
```

不要使用 `file://` 打开 `index.html`。纯静态模式不支持 Pikafish 和联机房间，生产环境还需为 `.wasm` 返回 `Content-Type: application/wasm`。

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `CHESS_BIND` | `0.0.0.0:0` | HTTP/WebSocket 监听地址；端口 `0` 表示由系统随机选择可用端口，Docker 镜像固定为 `0.0.0.0:8000` |
| `CHESS_OPEN_BROWSER` | `true` | 是否自动打开默认浏览器；Linux 还需存在图形会话，Docker 镜像固定为 `false` |
| `PIKAFISH_PATH` | 自动查找 | Pikafish 可执行文件路径 |
| `PIKAFISH_NNUE` | 自动查找 | NNUE 权重路径 |
| `CHESS_AI_POOL_SIZE` | `2` | Pikafish 进程数，范围 1–32 |
| `CHESS_AI_HASH_MB` | `32` | 每个进程的 Hash 内存，范围 1–1024 MB |
| `CHESS_DISABLE_AI` | 未设置 | 设为 `1`、`true` 或 `yes` 时禁用 Pikafish |
| `RUST_LOG` | 由启动方式决定 | Rust 日志过滤规则 |

## 操作

- 点击己方棋子查看合法位置
- 点击合法位置附近会自动吸附到对应棋盘坐标，只有鼠标左键或单指轻触会落子
- 拖拽旋转视角、滚轮缩放；视角不可平移，顶部“换边”按钮快速切换红黑方视角
- “3D 战场”保留人物与环境，“经典大字”使用正交俯视棋盘、隐藏卡通人物并最多采用简化动效
- 动效可选择“完整 / 简化 / 关闭”；系统启用减少动态效果时，首次默认使用简化动效
- 画面与动效偏好保存在当前浏览器，下次进入会自动恢复
- 顶部按钮还可用于悔棋和重开
- 左上角切换人机、本地双人和联机模式
- 按 `F` 进入或退出全屏，按 `Esc` 退出全屏

## 开发与测试

```bash
npm run check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --release --locked
```

重建仓库内的 godogpaw WASM：

```bash
bash ./build-godogpaw-wasm.sh
```

该脚本需要 Go、Git、curl 和 tar，并会下载固定提交、应用补丁、运行测试后同步生成 WASM 与 `wasm_exec.js`。

## 项目来源与许可证

本项目的 3D 前端基础来自 [tsonglew/chess-cn](https://github.com/tsonglew/chess-cn)，并在其上增加 Rust 服务端、双人机引擎、联机房间和部署支持。原项目的 MIT 许可证保留于 [`LICENSES/MIT-tsonglew.txt`](LICENSES/MIT-tsonglew.txt)。

主要第三方组件：

- [hmgle/godogpaw](https://github.com/hmgle/godogpaw)：MIT License，编译为浏览器 WASM
- [Three.js](https://threejs.org/)：MIT License，本地托管 r160
- [Pikafish](https://github.com/official-pikafish/Pikafish)：GPL v3 引擎及单独授权的 NNUE 权重
- Go `wasm_exec.js`：Go 项目 BSD 风格许可证

项目代码采用 [`GPL-3.0-or-later`](LICENSE)。第三方代码、模型、引擎和权重继续适用各自的许可证与使用条款。

Pikafish 引擎源码与官方 NNUE 权重适用不同条款。官方权重未经许可不得商业使用；完整发行包和 Docker 镜像因此严格仅供非商业使用。商业部署、再分发或远程引擎服务前，请阅读 [`DISTRIBUTION-NOTICE.md`](DISTRIBUTION-NOTICE.md) 和 [`third_party/pikafish/SOURCE.md`](third_party/pikafish/SOURCE.md)，并向 Pikafish 维护者取得适用于实际场景的授权。
