# 非商业发行包说明

本仓库的项目代码以 `GPL-3.0-or-later` 发布。GPL 本身允许商业使用，因此不能把项目源码描述为“禁止商业使用”。

GitHub Releases 生成的完整发行包还包含 Pikafish 官方 NNUE 权重 `pikafish.nnue`。该权重适用上游 `NNUE-License.md`，未经 Pikafish 团队许可不得商业使用。因此，**包含官方 NNUE 的完整发行包仅供非商业使用**。

发行包中的各组件分别适用各自许可证：

- chess-cn 项目代码：GPL-3.0-or-later；
- Pikafish 引擎：GPL-3.0-or-later；
- Pikafish 官方 NNUE：发行包内 `pikafish/NNUE-License.md`；
- 原始 3D 前端、godogpaw、Three.js 与 Go WASM 运行时：发行包内 `licenses/` 对应文件。

如需商业部署，必须移除受限 NNUE 并自行确认替代权重的权利，或事先取得 Pikafish 团队适用于实际使用方式的书面许可。
