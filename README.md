# pi-weixin-bridge

微信机器人 extension for pi — 通过 **微信官方 ClawBot / iLink 接口**，扫码登录后微信私聊消息自动转发给 pi，pi 回复自动发回微信。支持文件/图片/视频收发。

灵感与 iLink 协议参考 [huang-x-h/pi-weixinbot](https://github.com/huang-x-h/pi-weixinbot)（MIT）；本仓库在协议与登录流程基础上**几乎全部重写**，模块结构、消息处理、媒体收发、锁与监控均为本仓库独立实现。基于**腾讯官方 ClawBot / iLink 协议**。

## 安装

```bash
pi install npm:@fyc09/pi-weixin-bridge
# 或从 git
pi install git:github.com/fyc09/pi-weixin-bridge@v1.0.0
```

> 用 `pi -e npm:@fyc09/pi-weixin-bridge` 可不安装临时试用。
> 需要 pi >= 0.74。

## 使用

重启 pi，然后：

```
/weixin-login        # 扫码登录微信（终端显示二维码，用手机微信扫）
/weixin-status       # 查看连接状态
/weixin-connect      # 连接消息轮询（已登录后）
/weixin-send <文本>   # 手动发送消息给当前对话用户
/weixin-force-unlock # 强制释放锁（异常时用）
/weixin-logout       # 退出登录
```

登录后，用户给 bot 发消息 → pi 自动处理 → 回复自动发回用户。无需额外操作。

## 功能亮点

- 微信消息 → pi → 自动回复闭环
- 文件/图片/视频收发（`weixin_send_file` 工具）
- 多账号、排他锁、断线重连、状态栏显示
- 基于微信官方 ClawBot/iLink 协议，非逆向接口

## 前提

- 微信客户端已安装 **ClawBot 插件**（iOS 8.0.70+）
- pi 版本 >= 0.74

## 文件说明

```
src/
├── weixin.ts         # pi extension 入口
├── weixin-api.ts     # iLink API 调用
├── weixin-auth.ts    # 扫码登录
├── connection.ts     # 连接/断开/状态
├── messaging.ts      # 消息发送
├── monitor.ts        # 消息轮询
├── media.ts          # 媒体下载/上传
├── lock-manager.ts   # 排他锁
├── state.ts          # 会话状态
├── utils.ts          # 工具函数
└── types.ts          # 类型定义
```

## 相关

- [腾讯官方 openclaw-weixin](https://github.com/Tencent/openclaw-weixin) — iLink/ClawBot 官方通道插件
- [huang-x-h/pi-weixinbot](https://github.com/huang-x-h/pi-weixinbot) — iLink 协议与登录流程参考（MIT）
- [pi 扩展文档](https://github.com/@earendil-works/pi-coding-agent)
- License: MIT (c) 2026 fyc09，详见 [LICENSE](./LICENSE)
