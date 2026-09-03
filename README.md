# pi-weixin-bridge

把 **pi** 接入 **微信** 的桥梁 —— 扫码登录后，微信私聊消息自动转发给 pi，pi 回复自动发回微信，形成完整的聊天闭环。支持文本 / 图片 / 文件 / 视频收发。

基于**腾讯微信官方 ClawBot / iLink 接口**实现，**不接管、不模拟任何微信客户端**——bot 直接与微信官方服务端 API 通信，因此**与微信客户端平台无关**（iOS / Android / Windows / macOS / 手机 / 桌面均可，只要微信账号能扫官方 bot 授权码即可）。

<video src="https://raw.githubusercontent.com/fyc09/pi-weixin-bridge/master/assets/demo.mp4" controls width="720" poster></video>

## 🌟 为什么用这个

- **官方接口，非逆向**：走微信官方 ClawBot / iLink 通道，稳定、合规，不用 hook/模拟客户端。
- **开箱即用**：扫码即连，无需额外配置；消息自动双向转发。
- **媒体全支持**：文本、图片、文件、视频都能收发（`weixin_send_file` 工具）。
- **多账号**：支持多个微信账号同时在线，按账号隔离会话。
- **可靠**：排他锁、断线重连、状态栏实时显示、错误兜底。

## 📦 安装

```bash
# 方式一：通过 pi 包安装（推荐）
pi install npm:@fyc09/pi-weixin-bridge

# 方式二：从 git 安装
pi install git:github.com/fyc09/pi-weixin-bridge@v1.0.1

# 临时试用（不写入配置）
pi -e npm:@fyc09/pi-weixin-bridge
```

> 前提：pi 版本 >= 0.74。

## 🚀 快速开始

1. **安装**扩展（见上）。
2. **重启 pi**。
3. **扫码登录**：在 pi 里执行 `/weixin-login`，终端显示二维码，用手机微信扫码授权。
4. 完成后，给 bot 发消息 → pi 自动处理 → 回复自动发回微信。**无需其它操作。**

## 🎮 命令

| 命令 | 说明 |
|---|---|
| `/weixin-login` | 扫码登录微信（终端显示二维码，用手机微信扫） |
| `/weixin-status` | 查看连接状态、已登录账号、锁状态 |
| `/weixin-connect` | 连接消息轮询（已登录后手动触发） |
| `/weixin-disconnect` | 断开轮询（不登出） |
| `/weixin-send <文本>` | 手动发送文本给当前对话用户 |
| `/weixin-force-unlock` | 强制释放 session 锁（异常时用） |
| `/weixin-logout` | 退出当前微信登录 |

## 🔧 工具（LLM 可调用）

- `weixin_send_file(path)` — 向当前对话用户发送本地文件 / 图片 / 视频（按文件类型自动选择发送方式）。

## ⚙️ 工作原理

```
微信用户 ──发消息──▶ 微信官方 ClawBot/iLink 服务端 ──▶ pi-weixin-bridge（长轮询）
                                                            │
pi 计算/回复 ◀──turn_end── pi extension                       │
   │                 ▲                                       │
   └──发送消息───────┴────▶ 微信官方 iLink 服务端 ──▶ 显示给微信用户
```

- 通过 `/weixin-login` 获取 bot 授权 token（保存到 `~/.pi/agent/weixin/`）。
- `monitor.ts` 长轮询 `ilink/bot/getupdates` 拉取新消息。
- 收到消息后交给 pi，`turn_end` 时把 assistant 回复经 `ilink/bot/sendmessage` 发回。
- 支持媒体下载（自动识别 magic bytes 存临时目录）与上传（`getuploadurl`）。

## 📁 文件结构

```
src/
├── weixin.ts         # pi extension 入口（注册命令 / 工具 / 事件）
├── weixin-api.ts     # iLink API 调用（getupdates/sendmessage/getuploadurl...）
├── weixin-auth.ts    # 扫码登录、账号持久化
├── connection.ts     # 连接/断开/状态栏/配置
├── messaging.ts      # 消息发送（文本/媒体/sendRawMessage）
├── monitor.ts        # 消息轮询（长轮询 getupdates）
├── media.ts          # 媒体下载（magic bytes 识别）与上传
├── lock-manager.ts   # 排他锁（多 session 互斥）
├── state.ts          # 会话状态
├── utils.ts          # 通用工具（session id、配置路径）
└── types.ts          # 类型定义
```

## 🧰 使用要求

- **微信账号**：能扫官方 bot 授权二维码的微信账号（平台无关，iOS / Android / 桌面均可）。
- **目标微信客户端**：通过微信官方 ClawBot / iLink 渠道与 bot 通信，无需安装额外客户端插件。
- **pi**：>= 0.74。

## 🔥 常见问题 / 排障

- **收不到消息**：确认已 `/weixin-connect`；用 `/weixin-status` 看是否已连接、是否有锁占用。
- **登录失败 / 二维码过期**：二维码 5 分钟有效，过期重试 `/weixin-login`。
- **锁被占用**：多 session 互斥；请正常 `/weixin-disconnect`，异常时 `/weixin-force-unlock`。
- **发送失败**：用 `/weixin-status` 确认连接；检查目标用户是否发过消息（以便确定 reply 目标）。

## 📄 相关

- [腾讯官方 openclaw-weixin](https://github.com/Tencent/openclaw-weixin) — 微信官方 ClawBot / iLink 通道插件
- [huang-x-h/pi-weixinbot](https://github.com/huang-x-h/pi-weixinbot) — iLink 协议与登录流程参考（MIT）
- [pi 扩展文档](https://github.com/@earendil-works/pi-coding-agent)
- 演示视频：[assets/demo.mp4](./assets/demo.mp4)

## 📃 License

MIT (c) 2026 fyc09，详见 [LICENSE](./LICENSE)。
