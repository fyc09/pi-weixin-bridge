# pi-weixinbot-patched

微信机器人 extension for pi — 扫码登录后，微信私聊消息自动转发给 pi，pi 回复自动发回微信。

## 安装

```bash
# 解压后进入目录
cd pi-weixinbot-patched
npm install

# 安装为 pi 本地扩展
# 方式1: 直接丢到 extensions 目录
cp -r . ~/.pi/agent/extensions/pi-weixinbot-patched

# 方式2: 用 pi install (如果你的环境支持)
pi install ./
```

## 使用

重启 pi，然后：

```
/weixin-login       # 扫码登录微信（终端显示二维码, 用手机微信扫）
/weixin-status      # 查看连接状态
/weixin-send <文本>  # 手动发送消息给当前对话用户
/weixin-force-unlock # 强制释放锁（异常时用）
/weixin-logout      # 退出登录
```

登录后，用户给 bot 发消息 → pi 自动处理 → 回复发回给用户。无需额外操作。

## 前提

- 微信已安装 ClawBot 插件（iOS 8.0.70+）
- pi 版本 >= 0.74

## 文件说明

```
pi-weixinbot-patched/
├── src/
│   ├── weixin.ts         # pi extension 入口
│   ├── weixin-api.ts     # iLink API 调用
│   ├── weixin-auth.ts    # 扫码登录
│   ├── lock-manager.ts   # 排他锁
│   └── types.ts          # 类型定义
├── package.json
└── README.md
```
