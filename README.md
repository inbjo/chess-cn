# 楚河漢界 · 3D 中国象棋

一个运行在浏览器中的 Three.js 3D 中国象棋项目，支持拟人棋子、兵种攻击演出、可自由选择的 godogpaw/Pikafish 人机、本地双人和 WebSocket 联机对弈。

当前仓库：[inbjo/chess-cn](https://github.com/inbjo/chess-cn)

> 本项目的 3D 前端基础来自 [tsonglew/chess-cn](https://github.com/tsonglew/chess-cn)，在其基础上增加了 Rust 服务端、godogpaw WASM/Pikafish 双引擎人机、联机房间和部署支持。完整来源与许可证说明见[项目来源与许可证](#项目来源与许可证)。

> **发行限制：** 项目源码采用 GPL-3.0-or-later；GitHub Releases 的完整包内置官方 Pikafish NNUE，该权重未经许可不得商业使用，因此完整发行包严格用于非商业场景。详见 [`DISTRIBUTION-NOTICE.md`](DISTRIBUTION-NOTICE.md)。

<img width="924" height="570" alt="楚河漢界 3D 中国象棋" src="https://github.com/user-attachments/assets/d0e616e7-5747-4cec-acb8-79e9632a030a" />

## 功能

- Three.js 3D 棋盘、战场环境、拟人棋子和 WebGL 特效
- 完整中国象棋基础规则：蹩马腿、塞象眼、炮翻山、兵过河、九宫、飞将、将军、绝杀、困毙和悔棋
- godogpaw：浏览器 Web Worker 中运行 WebAssembly，支持四档难度
- Pikafish：Rust 服务端通过 UCI 调用引擎与 NNUE，Release 包已内置，支持四档难度
- 引擎与难度相互独立，可在界面中自由组合
- 本地双人对弈
- WebSocket 联机房间、服务端规则校验、断线重连和双人确认重开
- release 构建将 HTML、CSS、JavaScript、WASM 和模型嵌入单个 Rust 可执行文件
- WebGL 上下文和后台页签恢复处理

## 演示

### 帅 / 将全屏击杀特写

https://github.com/user-attachments/assets/ac0ad772-a503-47b1-89e3-691fbb4b09e0

### 完整攻击演示

https://github.com/user-attachments/assets/8aae6350-6348-47c0-bc0f-48be18bcc7e8

攻击演示入口：

```text
?demo=general|advisor|elephant|horse|chariot|cannon|soldier
```

追加 `&test=1` 后可以通过 `window.advanceTime()` 确定性推进动画，供自动化测试使用。

## AI 架构

| 引擎 | 运行位置 | 可选难度 | 是否需要 Rust 服务 |
|---|---|---|---|
| godogpaw WASM | 浏览器 Web Worker | 入门 / 中等 / 困难 / 大师 | 否 |
| Pikafish + NNUE | 服务端外部进程 | 入门 / 中等 / 困难 / 大师 | 是 |

引擎和难度是两个独立选项。例如可以选择“godogpaw + 大师”，也可以选择“Pikafish + 入门”。Pikafish 不可用时只影响 Pikafish 选项。

| 难度 | godogpaw | Pikafish |
|---|---|---|
| 入门 | 深度 2，约 70ms 上限 | 约 90ms，最多 4 条候选中择一 |
| 中等 | 深度 6，约 350ms 上限 | 约 350ms，最多 2 条候选中择一 |
| 困难 | 深度 10，约 900ms 上限 | 约 900ms，选择最佳着法 |
| 大师 | 深度 12，约 2000ms 上限 | 约 2000ms，选择最佳着法 |

浏览器端搜索每次都会从完整 UCI 棋谱重放局面。WASM 返回棋步后，前端规则引擎还会进行一次合法性校验。使用 Pikafish 时，Rust 会先重放并校验客户端棋谱，再验证 Pikafish 返回的棋步。

WASM 在独立 Worker 中运行，搜索不会阻塞 Three.js 动画。不同设备的实际耗时会有差异，时间参数是软限制，引擎可能有少量超时。

## 快速开始

### 完整模式

要求：

- Rust 工具链和 Cargo
- 现代浏览器，支持 WebGL（建议 WebGL 2）、WebAssembly、Web Worker 和 ES Modules
- 可选：源码开发时自行安装 Pikafish 与 NNUE；官方 Release 包无需另行安装

启动：

```bash
./dev.sh
# 打开 http://127.0.0.1:8000
```

常用选项：

```bash
./dev.sh --verify                 # 运行 Rust、JavaScript 完整检查后启动
./dev.sh --release                # 使用 release 构建启动
./dev.sh --no-ai                  # 禁用 Pikafish；godogpaw 人机仍可用
./dev.sh --bind 127.0.0.1:8080    # 修改监听地址
./dev.sh --help
```

开发构建直接读取工作区前端文件；修改 HTML、CSS、JavaScript 后刷新浏览器即可。release 构建会嵌入前端资源，资源修改后必须重新执行 `cargo build --release`。

### 下载发行包

推送 `v*` 标签后，GitHub Actions 会测试项目并发布以下完整包：

| 包名 | 运行平台 | Pikafish 来源 |
|---|---|---|
| `chess-cn-linux-x86_64.tar.gz` | Linux x86_64（SSE4.1 + POPCNT） | 官方发布二进制 |
| `chess-cn-linux-aarch64.tar.gz` | Linux ARM64 / ARMv8 | 固定标签源码原生编译 |
| `chess-cn-windows-x86_64.zip` | Windows x86_64 | 官方发布二进制 |
| `chess-cn-macos-x86_64.tar.gz` | macOS Intel | 固定标签源码原生编译 |
| `chess-cn-macos-aarch64.tar.gz` | macOS Apple Silicon | 官方发布二进制 |

解压后直接运行根目录中的 `chess-cn-server`（Windows 为 `chess-cn-server.exe`）。服务端会自动发现同目录下 `pikafish/` 中的引擎和 NNUE，无需设置环境变量。默认监听 `127.0.0.1:8000`。

也可在 Actions 页面手动运行 **Build and release** 工作流；手动运行只生成可下载的 Actions Artifacts。创建并推送版本标签才会发布 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

每个标签 Release 同时包含 SHA-256 校验文件和固定 Pikafish 标签的完整对应源码归档。

### 纯静态模式

只开发前端或只使用 godogpaw 四档难度时，可以使用静态服务器：

```bash
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000
```

不要直接使用 `file://` 打开 `index.html`，WASM、ES Modules 和 Worker 需要 HTTP 服务。

纯静态模式支持：

- godogpaw WASM 人机
- 本地双人
- 3D 棋盘和全部演出

纯静态模式不支持：

- Pikafish 引擎的所有难度
- 联机房间

生产静态服务器必须为 `.wasm` 返回 `Content-Type: application/wasm`。当前 Go WASM 是单线程实现，不依赖 `SharedArrayBuffer`，无需为此配置 COOP/COEP 响应头。

## Pikafish 引擎配置

源码仓库本身不提交大型 Pikafish 可执行文件或官方 NNUE 权重。直接从源码运行时可以自行获取并配置；GitHub Release 完整包则已带齐，无需设置：

```bash
PIKAFISH_PATH=/opt/pikafish/pikafish \
PIKAFISH_NNUE=/opt/pikafish/pikafish.nnue \
cargo run --release
```

服务启动时会检测 Pikafish。未找到时 Pikafish 引擎的四档难度均不可用，godogpaw 人机、本地双人和联机模式不受影响。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CHESS_BIND` | `127.0.0.1:8000` | Rust HTTP/WebSocket 监听地址 |
| `PIKAFISH_PATH` | 先找发行包内置引擎，再从 `PATH` 查找 | Pikafish 可执行文件路径；显式设置时优先级最高 |
| `PIKAFISH_NNUE` | 自动查找引擎同目录的 `pikafish.nnue` | NNUE 权重路径；显式设置时优先级最高 |
| `CHESS_AI_POOL_SIZE` | `2` | 常驻 Pikafish 进程上限，范围 1–32 |
| `CHESS_AI_HASH_MB` | `32` | 每个 Pikafish 进程的 Hash 内存，范围 1–1024 MB |
| `CHESS_DISABLE_AI` | 未设置 | 设为 `1`、`true` 或 `yes` 时禁用 Pikafish |
| `RUST_LOG` | 由启动方式决定 | Rust 日志过滤，例如 `chess_cn_server=info` |

Pikafish 进程池中的每个进程使用一个搜索线程。部署时应根据 CPU 核数、NNUE 内存和并发量设置 `CHESS_AI_POOL_SIZE`，避免在小型服务器上同时启动过多搜索。

## 重建 godogpaw WASM

仓库已包含可直接部署的：

- `assets/godogpaw.wasm`
- `js/wasm_exec.js`
- `assets/godogpaw-LICENSE.txt`
- `assets/wasm_exec-LICENSE.txt`

重建要求：Go、Git、curl 和 tar。执行：

```bash
bash ./build-godogpaw-wasm.sh
```

脚本会：

1. 下载固定的 godogpaw 提交 `b135b58d1b45c2dc090bbc346a27cfbc6e08b2dd`；
2. 应用 `godogpaw.patch`；
3. 运行 godogpaw 引擎测试；
4. 编译 `GOOS=js GOARCH=wasm` 产物；
5. 同步与当前 Go 编译器匹配的 `wasm_exec.js` 和许可证。

WASM 与 `wasm_exec.js` 必须由兼容的 Go 工具链一起生成，不应只单独替换其中一个文件。

## 生产部署

### 方案一：单个 Rust 可执行文件

这是支持全部功能的推荐方案。

#### 1. 构建与验证

```bash
npm run check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

输出文件：

```text
target/release/chess-cn-server
```

release 二进制已嵌入前端、WASM 和模型。部署时不需要额外复制 `index.html`、`js/`、`css/`、`vendor/` 或 `assets/`。

#### 2. 准备部署目录

示例目录：

```text
/opt/chess-cn/
├── chess-cn-server
└── chess-cn.env
```

`/opt/chess-cn/chess-cn.env` 示例：

```bash
CHESS_BIND=127.0.0.1:8000
RUST_LOG=chess_cn_server=info
PIKAFISH_PATH=/opt/pikafish/pikafish
PIKAFISH_NNUE=/opt/pikafish/pikafish.nnue
CHESS_AI_POOL_SIZE=2
CHESS_AI_HASH_MB=64
```

如果不使用 Pikafish 引擎，删除两个 `PIKAFISH_*` 变量并设置：

```bash
CHESS_DISABLE_AI=1
```

#### 3. systemd 服务

`/etc/systemd/system/chess-cn.service` 示例：

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

服务本身不需要写入工作目录；联机房间和棋谱只保存在进程内存中。

#### 4. Nginx 反向代理

WebSocket 与普通 HTTP 使用同一上游。示例：

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

公网部署应配置 HTTPS；在 HTTPS 页面中浏览器会自动使用 `wss://` 连接联机房间。

#### 5. 健康检查

```bash
curl http://127.0.0.1:8000/api/health
```

预期响应：

```json
{"status":"ok"}
```

Pikafish 状态：

```bash
curl http://127.0.0.1:8000/api/ai/status
```

#### 6. 单实例限制

当前联机房间、席位、棋谱和重开状态都保存在 Rust 进程内存中：

- 服务重启会清空全部房间；
- 不应直接启动多个无共享状态的实例做轮询负载均衡；
- 若必须多实例部署，需要先把房间状态迁移到共享存储，并为 WebSocket 配置会话粘滞或统一消息总线。

### 方案二：静态托管

可以把以下内容发布到 Nginx、对象存储静态网站或 Pages 服务：

```text
index.html
favicon.svg
css/
js/
vendor/
assets/
```

静态平台需要满足：

- 保持原有相对目录结构；
- `.js` 使用 JavaScript MIME；
- `.wasm` 使用 `application/wasm`；
- 允许 Worker 加载 `js/ai-worker.js`；
- 不用 `file://` 访问。

静态部署只有 WASM 人机与本地双人；大师和联机 API 不可用。

## 联机对弈

点击左上角对弈模式中的“联机”，即可创建或加入联机房间；联机弹窗中的“退出联机 · 返回人机”可以随时清理房间连接并回到人机模式：

1. 创建者执红并获得 6 位房间编号；
2. 对手通过邀请链接或编号加入并执黑；
3. 服务端校验身份、行棋方、版本号和着法；
4. 断线后客户端自动重连并从完整服务端棋谱恢复；
5. 重开需要双方确认。

联机模式暂不支持悔棋。房间 24 小时无活动后清理，服务重启后不会保留。

## 操作

- 点击己方棋子查看合法位置
- 拖拽旋转视角，滚轮缩放
- 顶部按钮：悔棋、换边、重开
- 左上角切换人机、本地双人和联机模式
- 人机模式下可分别选择 godogpaw/Pikafish 引擎和入门、中等、困难、大师难度
- 按 `F` 进入或退出全屏，按 `Esc` 退出全屏

## 测试

```bash
npm run check
cargo test
```

完整检查：

```bash
./dev.sh --verify
```

浏览器回归重点：

- 从其他页签切回后棋盘照明是否恢复；
- godogpaw 四档难度搜索期间动画是否流畅；
- Pikafish 缺失时是否只禁用 Pikafish 引擎；
- 两种引擎和四档难度是否可以独立组合；
- WebSocket 断线后是否能够恢复棋谱；
- 移动设备是否能够加载约 3.5 MB 的 WASM。

## 项目结构

```text
.
├── assets/                     # GLB 模型、godogpaw WASM、第三方许可证
├── css/style.css               # 页面与 HUD 样式
├── js/
│   ├── ai-engine.js            # Worker 生命周期、难度和 UCI 坐标适配
│   ├── ai-worker.js            # WASM 加载、棋谱重放和搜索
│   ├── board3d.js              # 棋盘和战场环境
│   ├── fx.js                   # 战斗特效
│   ├── main.js                 # Three.js 场景、交互、动画和模式编排
│   ├── model-assets.js         # GLB 预加载和模型回退
│   ├── pieces.js               # 拟人棋子与阵营外观
│   ├── rules.js                # 浏览器规则引擎
│   └── wasm_exec.js            # Go WebAssembly 运行时
├── src/
│   ├── engine.rs               # Pikafish UCI 进程池
│   ├── main.rs                 # HTTP API 和嵌入式静态资源
│   ├── online.rs               # 联机房间与 WebSocket
│   └── rules.rs                # 服务端规则与棋谱校验
├── test/                       # JavaScript 规则和 WASM 适配测试
├── scripts/package-release.sh  # 跨平台发行目录与归档脚本
├── .github/workflows/release.yml # 五平台构建、测试和标签发布
├── build-godogpaw-wasm.sh      # 固定版本 WASM 重建脚本
├── godogpaw.patch              # godogpaw 防御性规则补丁
└── dev.sh                      # 开发、验证和启动脚本
```

## 项目来源与许可证

### 3D 前端：tsonglew/chess-cn

- 来源：[https://github.com/tsonglew/chess-cn](https://github.com/tsonglew/chess-cn)
- 许可证：MIT License
- 版权声明：`Copyright (c) 2026 Tsonglew`

本项目的 Three.js 3D 棋盘、拟人棋子、规则交互和战斗演出以前端项目 `tsonglew/chess-cn` 为基础，并在其上增加服务端、人机和联机能力。原项目 MIT 许可证和版权声明保留于 `LICENSES/MIT-tsonglew.txt`；本项目后续修改整体以 GPL-3.0-or-later 发布。

棋子模型由原项目使用 Tripo v3.1 生成并进行 WebGL 优化；模型的进一步使用还应核对生成服务条款及原项目说明。

### 浏览器人机：hmgle/godogpaw

- 来源：[https://github.com/hmgle/godogpaw](https://github.com/hmgle/godogpaw)
- 固定提交：`b135b58d1b45c2dc090bbc346a27cfbc6e08b2dd`
- 许可证：MIT License
- 版权声明：`Copyright (c) 2019 Mingang.He <dustgle@gmail.com>`

本项目把 godogpaw 编译为 WASM，并应用仓库内的 `godogpaw.patch`。许可证副本位于 `assets/godogpaw-LICENSE.txt`。

### Go WebAssembly 运行时

`js/wasm_exec.js` 来自 Go 工具链，采用 Go 项目的 BSD 风格许可证。许可证副本位于 `assets/wasm_exec-LICENSE.txt`。

### Three.js

项目本地托管 Three.js r160 与相关 addons。Three.js 采用 MIT License，许可证位于 `vendor/three/LICENSE`。

### Pikafish 与 NNUE

- 引擎来源：[https://github.com/official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish)
- 引擎许可证：[GNU General Public License v3.0](https://github.com/official-pikafish/Pikafish/blob/master/Copying.txt)
- 权重说明：[https://github.com/official-pikafish/Networks](https://github.com/official-pikafish/Networks)

源码仓库不提交大型 Pikafish 二进制和 NNUE。GitHub Actions 会在构建 Release 时下载固定的官方发布包，并把 Pikafish、NNUE、上游许可证与对应源码指针一起放入平台包。固定版本和校验值见 `third_party/pikafish/SOURCE.md`。

需要区分以下情况：

1. **运行者在自己的服务器安装并调用 Pikafish**：仍需遵守 Pikafish 和权重的适用条款。
2. **本项目的完整发行包**：包含 Pikafish 的 GPL 文本、NNUE 条款、源码指针，并在同一 GitHub Release 上传固定标签的完整对应源码归档。
3. **使用官方 `pikafish.nnue` 或其衍生权重**：官方 Networks 仓库明确写明“未经许可不得商业使用”。这与引擎源码的 GPL v3 是两套不同条件，不能因为引擎是 GPL 就推定权重可以商业使用。
4. **商业远程引擎**：Pikafish 维护者在[官方讨论 #134](https://github.com/official-pikafish/Pikafish/discussions/134)中确认，仅在商业产品的后端服务器运行、客户端不分发引擎或权重，也属于需要申请的远程引擎授权场景。商业部署前应联系 `pikafishxq@outlook.com` 并取得适用于实际业务的书面授权。

Pikafish 官方 README 还说明，其训练数据来源包含以 ODbL 提供的 Pika Xiangqi Zero 数据。若自行训练、修改或再分发权重，还需要继续核对训练数据和权重的具体条款。

以上许可证说明用于帮助部署者识别风险，不构成法律意见。商业使用、二进制再分发、容器镜像分发或 NNUE 权重使用前，应以各上游仓库的最新许可证文件为准，并由专业人士复核。

## License

本项目代码采用根目录中的 GNU General Public License v3.0 or later（`GPL-3.0-or-later`）。GPL 允许商业使用，不能用 GPL 单独实现“禁止商业”。但完整发行包包含受非商业条款约束的官方 NNUE，所以该完整包严格仅供非商业使用；商业场景必须另行解决权重授权问题。

原始 MIT/BSD 组件的版权与许可证声明继续保留。第三方代码、模型、引擎和权重分别适用其各自许可证与使用条款，不能由项目根许可证替代。
