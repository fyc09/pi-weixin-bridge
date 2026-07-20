/**
 * 消息监控（长轮询 getupdates）
 *
 * 工厂函数 createMonitor(state) 返回 startMonitor / stopMonitor
 * 收到消息后: 刷新 replyUserId/replyContextToken, 下载媒体, 立刻发给 pi
 *   - deliverAs: "followUp" 自动处理 idle(开新turn)/busy(排队)
 */
import { getUpdates, DEFAULT_BASE_URL } from "./weixin-api.ts";
import { downloadInboundMedia } from "./media.ts";
import { extractTextBody } from "./utils.ts";
import type { WeixinState } from "./state.ts";

const MEDIA_LABELS: Record<number, string> = { 2: "图片", 3: "语音", 4: "文件", 5: "视频" };
const MEDIA_FALLBACK: Record<number, string> = {
  2: "\n[收到图片消息]",
  3: "\n[收到语音消息]",
  4: "\n[收到文件消息]",
  5: "\n[收到视频消息]",
};

export function createMonitor(state: WeixinState) {
  function startMonitor() {
    if (!state.currentAccount?.token || !state.currentAccount.accountId) return;

    if (state.monitorAbortController) {
      state.monitorAbortController.abort();
    }
    state.monitorAbortController = new AbortController();
    const abortSignal = state.monitorAbortController.signal;

    let getUpdatesBuf = "";

    async function poll() {
      if (abortSignal.aborted) return;

      try {
        const resp = await getUpdates({
          baseUrl: state.currentAccount!.baseUrl ?? DEFAULT_BASE_URL,
          token: state.currentAccount!.token,
          get_updates_buf: getUpdatesBuf,
          timeoutMs: 35000,
        });

        // Session 过期
        if (typeof resp.ret === "number" && resp.ret !== 0) {
          if (resp.errcode === -14) {
            state.isConnected = false;
            state.pi.sendMessage({
              customType: "weixinbot-status",
              content: "⚠️ 微信 Session 已过期，请使用 /weixin-login 重新登录",
              display: true,
            }, { deliverAs: "steer", triggerTurn: false });
            return;
          }
        }

        if (resp.get_updates_buf) {
          getUpdatesBuf = resp.get_updates_buf;
        }

        // 处理消息
        if (resp.msgs && resp.msgs.length > 0) {
          for (const msg of resp.msgs) {
            // 忽略自己发的消息 (message_type === 2 是 BOT)
            if (msg.message_type === 2) continue;

            const fromUserId = msg.from_user_id ?? "";
            if (!fromUserId) continue;

            const textBody = extractTextBody(msg.item_list);
            if (!textBody && (!msg.item_list || msg.item_list.length === 0)) continue;

            // 构建消息文本
            let messageText = textBody;

            // 下载媒体附件, 把路径写入消息
            for (const item of msg.item_list || []) {
              if (item.type === 2 || item.type === 3 || item.type === 4 || item.type === 5) {
                try {
                  const savedPath = await downloadInboundMedia(item);
                  if (savedPath) {
                    const label = MEDIA_LABELS[item.type];
                    messageText = messageText
                      ? `${messageText}\n[${label}：${savedPath}]`
                      : `[${label}：${savedPath}]`;
                    continue;
                  }
                } catch {}
                // 下载失败, 保留占位符
                messageText += MEDIA_FALLBACK[item.type] || "";
              }
            }

            // 刷新回复目标 + 立刻发给 pi (followUp 自动处理 idle/busy)
            state.replyUserId = fromUserId;
            state.replyContextToken = msg.context_token;
            state.pi.sendUserMessage(
              [{ type: "text", text: messageText }],
              { deliverAs: "followUp" }
            );
          }
        }
      } catch (err) {
        // 静默重试
      }

      // 继续轮询
      if (!abortSignal.aborted) {
        setTimeout(poll, 100);
      }
    }

    poll();
  }

  function stopMonitor() {
    if (state.monitorAbortController) {
      state.monitorAbortController.abort();
      state.monitorAbortController = null;
    }
  }

  return { startMonitor, stopMonitor };
}
