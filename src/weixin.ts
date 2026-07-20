/**
 * pi-weixinbot - 微信机器人 extension for pi
 *
 * 支持扫码登录、消息收发、媒体下载/发送。
 * 消息处理: 收到即发 (followUp 自动排队), turn_end 回复微信。
 *
 * 参考: https://github.com/Tencent/openclaw-weixin
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";

import { getSessionId } from "./utils.ts";
import { createWeixinState } from "./state.ts";
import { createMessaging } from "./messaging.ts";
import { createMonitor } from "./monitor.ts";
import { createConnection, checkLockStatus, forceReleaseLock, releaseLock } from "./connection.ts";
import { getLoggedInAccounts } from "./weixin-auth.ts";

export default function (pi: ExtensionAPI) {
  // ── 初始化状态 + 模块 ──
  const state = createWeixinState(pi, getSessionId());
  const { sendTextMessage, sendFileMessage } = createMessaging(state);
  const { startMonitor, stopMonitor } = createMonitor(state);
  const {
    performConnect,
    performDisconnect,
    performLogin,
    performLogout,
    updateStatus,
  } = createConnection(state, { startMonitor, stopMonitor });

  // ============================================================================
  // 注册工具
  // ============================================================================

  pi.registerTool({
    name: "weixin_send_file",
    label: "Weixin Send File",
    description: "发送文件/图片/视频给微信用户。根据文件类型自动选择发送方式(2=图片,4=文件,5=视频)。",
    parameters: Type.Object({
      path: Type.String({ description: "本地文件路径" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!state.toolsEnabled) {
        return { content: [{ type: "text", text: "未连接微信, 请先 /weixin-connect" }], details: {}, isError: true };
      }
      try {
        if (!state.replyUserId) {
          return { content: [{ type: "text", text: "无法确定接收者，请先让微信用户发一条消息" }], details: {}, isError: true };
        }
        const result = await sendFileMessage(params.path, state.replyUserId, state.replyContextToken);
        return { content: [{ type: "text", text: result }], details: {} };
      } catch (err: any) {
        return { content: [{ type: "text", text: `发送文件失败: ${err.message}` }], details: {}, isError: true };
      }
    },
  });

  // ============================================================================
  // 注册命令
  // ============================================================================

  pi.registerCommand("weixin-send", {
    description: "发送文本消息给微信用户。用法: /weixin-send <文本>",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) { await ctx.ui.notify("用法: /weixin-send <文本>", "error"); return; }
      try {
        if (!state.replyUserId) { await ctx.ui.notify("无法确定接收者", "error"); return; }
        await sendTextMessage(state.replyUserId, text, state.replyContextToken);
        await ctx.ui.notify("消息已发送", "info");
      } catch (err: any) {
        await ctx.ui.notify("发送失败: " + err.message, "error");
      }
    },
  });

  pi.registerCommand("weixin-force-unlock", {
    description: "强制释放微信 session 锁",
    handler: async (_args, ctx) => {
      const ls = await checkLockStatus();
      if (!ls.locked) { await ctx.ui.notify("当前没有锁", "info"); return; }
      if (ls.ownedByMe) { await releaseLock(state.SESSION_ID); await ctx.ui.notify("已释放锁", "info"); return; }
      const ok = await forceReleaseLock();
      await ctx.ui.notify(ok ? "已强制释放锁" : "释放锁失败", ok ? "info" : "error");
    },
  });

  pi.registerCommand("weixin-connect", {
    description: "连接微信消息轮询（需已登录）",
    handler: async (_args, ctx) => {
      if (state.isConnected) { await ctx.ui.notify("已连接", "info"); return; }
      await performConnect(ctx);
    },
  });

  pi.registerCommand("weixin-disconnect", {
    description: "断开微信消息轮询（不登出）",
    handler: async (_args, ctx) => {
      if (!state.isConnected) { await ctx.ui.notify("未连接", "info"); return; }
      await performDisconnect();
      await updateStatus(ctx);
      await ctx.ui.notify("已断开", "info");
    },
  });

  pi.registerCommand("weixin-logout", {
    description: "退出当前微信登录",
    handler: async (_args, ctx) => {
      const accountId = state.currentAccount?.accountId;
      if (!accountId) { await ctx.ui.notify("没有登录的账户", "info"); return; }
      await performLogout(accountId, ctx);
      await ctx.ui.notify("已退出登录", "info");
    },
  });

  pi.registerCommand("weixin-login", {
    description: "微信扫码登录",
    handler: async (_args, ctx) => {
      await ctx.ui.notify("正在启动微信登录...", "info");
      const success = await performLogin(ctx);
      if (success) {
        await ctx.ui.notify("微信登录成功！", "info");
      } else {
        await ctx.ui.notify("微信登录失败", "error");
      }
    },
  });

  pi.registerCommand("weixin-status", {
    description: "查看微信连接状态",
    handler: async (_args, ctx) => {
      const accounts = getLoggedInAccounts();
      const lockStatus = await checkLockStatus();
      let status = `已登录账户: ${accounts.length}\n`;
      for (const acc of accounts) {
        const isCurrent = state.currentAccount?.accountId === acc.accountId;
        status += `- ${acc.accountId?.slice(0, 12)}... ${isCurrent ? "(当前)" : ""}\n`;
      }
      status += `当前连接: ${state.isConnected ? "已连接" : "未连接"}\n`;
      if (lockStatus.locked) {
        status += lockStatus.ownedByMe
          ? `独占锁: 🔒 当前 session 持有`
          : `独占锁: ❌ 被其他 session 占用`;
      } else {
        status += `独占锁: 🔓 未锁定`;
      }
      await ctx.ui.notify(status, "info");
      await updateStatus(ctx);
    },
  });

  // ============================================================================
  // turn_end: 取回复文本发给微信用户
  // ============================================================================

  pi.on("turn_end", async (event, _ctx) => {
    if (!state.isConnected || !state.currentAccount) return;
    if (!state.replyUserId) return;

    const msg = event.message;
    if (msg.role !== "assistant") return;

    const reason = msg.stopReason;
    if (reason === "toolUse") return; // 等最终回复

    let replyText = "";
    for (const c of msg.content) {
      if (c.type === "text") replyText += c.text;
    }

    // 报错兜底
    if ((reason === "error" || reason === "aborted") && !replyText.trim()) {
      replyText = `[错误] ${msg.errorMessage || reason}`;
    }

    if (replyText.trim()) {
      try {
        await sendTextMessage(state.replyUserId, replyText.trim(), state.replyContextToken);
      } catch (err: any) {
        if (state.lastCtx?.hasUI) state.lastCtx.ui.notify("微信发送失败: " + err.message, "error");
      }
    }
  });

  // ============================================================================
  // 会话生命周期
  // ============================================================================

  pi.on("session_start", async (_event, ctx) => {
    state.lastCtx = ctx;
    await updateStatus(ctx);
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    stopMonitor();
    await releaseLock(state.SESSION_ID);
  });
}

// 导出工具函数供外部使用
export { getLoggedInAccounts, fullQRLogin } from "./weixin-auth.ts";
export { sendMessage as sendWeixinMessage, DEFAULT_BASE_URL } from "./weixin-api.ts";
