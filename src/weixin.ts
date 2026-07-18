// 注册命令
// ============================================================================

pi.registerCommand("weixin-send", {
  description: "发送文本消息给微信用户。用法: /weixin-send <文本>",
  handler: async (args, ctx) => {
    const text = args.trim()
    if (!text) { await ctx.ui.notify("用法: /weixin-send <文本>", "error"); return }
    try {
      let toUserId
      const cm = pendingMessages.find(m => m.reqId === currentReqId)
      if (cm) toUserId = cm.userId
      if (!toUserId) { await ctx.ui.notify("无法确定接收者", "error"); return }
      const ct = pendingMessages.find(m => m.userId === toUserId)
      await sendTextMessage(toUserId, text, ct?.contextToken)
      await ctx.ui.notify("消息已发送", "info")
    } catch (err) { await ctx.ui.notify("发送失败: " + err.message, "error") }
  },
})

pi.registerCommand("weixin-force-unlock", {
  description: "强制释放微信 session 锁",
  handler: async (_args, ctx) => {
    const ls = await checkLockStatus()
    if (!ls.locked) { await ctx.ui.notify("当前没有锁", "info"); return }
    if (ls.ownedByMe) { await releaseLock(SESSION_ID); await ctx.ui.notify("已释放锁", "info"); return }
    const ok = await forceReleaseLock()
    await ctx.ui.notify(ok ? "已强制释放锁" : "释放锁失败", ok ? "info" : "error")
  },
})


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

  // 微信退出命令
  pi.registerCommand("weixin-logout", {
    description: "退出当前微信登录",
    handler: async (_args, ctx) => {
      const accountId = currentAccount?.accountId;
      if (!accountId) {
        await ctx.ui.notify("没有登录的账户", "info");
        return;
      }
      await performLogout(accountId, ctx);
      await ctx.ui.notify("已退出登录", "info");
    },
  });

  // 微信状态命令
  pi.registerCommand("weixin-status", {
    description: "查看微信连接状态",
    handler: async (_args, ctx) => {
      const accounts = getLoggedInAccounts();
      const lockStatus = await checkLockStatus();
      let status = `已登录账户: ${accounts.length}\n`;
      for (const acc of accounts) {
        const isCurrent = currentAccount?.accountId === acc.accountId;
        status += `- ${acc.accountId?.slice(0, 12)}... ${isCurrent ? "(当前)" : ""}\n`;
      }
      status += `当前连接: ${isConnected ? "已连接" : "未连接"}\n`;

      // 添加锁状态
      if (lockStatus.locked) {
        if (lockStatus.ownedByMe) {
          status += `独占锁: 🔒 当前 session 持有`;
        } else {
          status += `独占锁: ❌ 被其他 session 占用`;
        }
      } else {
        status += `独占锁: 🔓 未锁定`;
      }

      await ctx.ui.notify(status, "info");
      await updateStatus(ctx);
    },
  });

  // ============================================================================
  // 流处理 - 捕获 AI 回复并发送回微信
  // ============================================================================

  pi.on("message_end", async (event, ctx) => {
    const message = event.message;
    // 只处理助手消息（AI 回复）
    if (message.role !== "assistant") {
      return;
    }

    // 未登录时不处理消息
    if (!isConnected || !currentAccount) {
      return;
    }

    // 从队列中取出第一条消息（最早发送给 AI 的）
    const pendingMsg = pendingMessages[0];
    if (!pendingMsg) {
      return;
    }

    // 获取对应的用户信息
    const replyTo = replyToMap.get(pendingMsg.reqId);
    if (!replyTo) {
      pendingMessages.shift(); // 清理队列
      replyToMap.delete(pendingMsg.reqId);
      await updateStatus(ctx); // 更新状态栏
      return;
    }

    // 提取文本内容
    let replyText = "";
    for (const content of message.content) {
      if (content.type === "text") {
        replyText += content.text;
      }
    }

    if (!replyText.trim()) {
      pendingMessages.shift(); // 清理队列
      replyToMap.delete(pendingMsg.reqId);
      await updateStatus(ctx); // 更新状态栏
      return;
    }

    const { userId, contextToken } = replyTo;

    try {
      await sendTextMessage(userId, replyText.trim(), contextToken);
    } catch (err: any) {
      if (lastCtx?.hasUI) lastCtx.ui.notify(`微信消息发送失败: ${err.message}`, "error");
    }

    // 清理
    pendingMessages.shift();
    replyToMap.delete(pendingMsg.reqId);

    // 更新状态栏显示待处理消息数
    await updateStatus(ctx);

    // 继续处理队列中的下一条消息
    processMessageQueue();
  });

  // ============================================================================
  // 事件处理
  // ============================================================================

  // 会话启动时仅初始化状态（不自动连接微信）
  pi.on("session_start", async (_event, ctx) => {
    // 保存 UI 上下文
    lastCtx = ctx;
    // 初始化状态栏
    await updateStatus(ctx);
  });

  // 会话关闭时停止监控并释放锁
  pi.on("session_shutdown", async (_event, _ctx) => {
    stopMonitor();
    await releaseLock(SESSION_ID);
  });

  // ============================================================================
  // 启动提示
  // ============================================================================

}

// 导出工具函数供外部使用
export { getLoggedInAccounts, fullQRLogin } from "./weixin-auth.ts";
export { sendMessage as sendWeixinMessage, DEFAULT_BASE_URL } from "./weixin-api.ts";
