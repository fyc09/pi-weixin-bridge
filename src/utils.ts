/**
 * 纯工具函数（无副作用，不依赖运行时状态）
 */
import { join } from "node:path";
import { getStateDir } from "./weixin-auth.ts";
import type { WeixinMessage } from "./types.ts";

export function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `pi-weixin-${timestamp}-${random}`;
}

export function getSessionId(): string {
  if (process.env.PI_SESSION_ID) return process.env.PI_SESSION_ID;
  if (process.env.PI_INSTANCE_ID) return process.env.PI_INSTANCE_ID;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `sess-${timestamp}-${random}`;
}

export function getConfigPath(): string {
  return join(getStateDir(), "config.json");
}

/**
 * 从消息中提取文本内容
 */
export function extractTextBody(itemList?: WeixinMessage["item_list"]): string {
  if (!itemList?.length) return "";

  for (const item of itemList) {
    // 文本消息
    if (item.type === 1 && item.text_item?.text != null) {
      let text = String(item.text_item.text);

      // 处理引用消息
      const ref = item.ref_msg;
      if (ref?.message_item) {
        const refType = ref.message_item.type;
        if (refType === 2 || refType === 3 || refType === 4 || refType === 5) {
          // 引用媒体消息，只取当前文本
        } else if (refType === 1 && ref.message_item.text_item?.text) {
          text = `[引用: ${ref.message_item.text_item.text}]\n${text}`;
        }
      }
      return text;
    }

    // 语音转文字
    if (item.type === 3 && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }

  return "";
}

/**
 * 过滤 Markdown 特殊字符（用于发送到微信）
 */
export function filterMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")  // 粗体
    .replace(/\*(.*?)\*/g, "$1")      // 斜体
    .replace(/`(.*?)`/g, "$1")        // 行内代码
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```\w*\n?/g, "").trim();
    })
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")  // 链接
    .replace(/^#+\s*/gm, "")          // 标题标记
    .replace(/^[-*]\s+/gm, "• ")      // 列表标记
    .replace(/^\d+\.\s+/gm, "");      // 有序列表
}
