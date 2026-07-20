/**
 * 消息发送（文本/文件/图片/视频）
 *
 * 工厂函数 createMessaging(state) 返回 sendTextMessage / sendFileMessage
 * 通过 state 读取 currentAccount（引用传递，随时读到最新值）
 */
import { readFileSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";
import crypto from "node:crypto";
import {
  sendMessage as sendWeixinMessage,
  sendRawMessage,
  getUploadUrl,
  DEFAULT_BASE_URL,
} from "./weixin-api.ts";
import { generateClientId, filterMarkdown } from "./utils.ts";
import type { WeixinState } from "./state.ts";

const CDN_BASE = "https://novac2c.cdn.weixin.qq.com/c2c";

export function createMessaging(state: WeixinState) {
  /**
   * 发送文本消息
   */
  async function sendTextMessage(to: string, text: string, contextToken?: string): Promise<void> {
    if (!state.currentAccount?.token) {
      throw new Error("未登录微信，请先登录");
    }
    const filteredText = filterMarkdown(text);
    await sendWeixinMessage({
      baseUrl: state.currentAccount.baseUrl ?? DEFAULT_BASE_URL,
      token: state.currentAccount.token,
      to,
      text: filteredText,
      clientId: generateClientId(),
      contextToken,
    });
  }

  /**
   * 发送文件/图片/视频
   */
  async function sendFileMessage(filePath: string, to: string, contextToken?: string): Promise<string> {
    if (!state.currentAccount?.token) throw new Error("未登录微信，请先登录");
    if (!existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);

    const buf = readFileSync(filePath);
    const rawsize = buf.length;
    const rawfilemd5 = crypto.createHash("md5").update(buf).digest("hex");
    const aesKey = crypto.randomBytes(16);
    const aesKeyHex = aesKey.toString("hex");
    const name = basename(filePath);
    const ext = extname(filePath).toLowerCase();

    // item_list 类型: 2=图片, 4=文件, 5=视频
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
    const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"];
    const itemType = imageExts.includes(ext) ? 2 : videoExts.includes(ext) ? 5 : 4;

    // getUploadUrl media_type: 1=IMAGE, 2=VIDEO, 3=FILE
    const uploadMediaType = itemType === 2 ? 1 : itemType === 5 ? 2 : 3;

    // AES-128-ECB 加密 + PKCS7 填充
    const padLen = 16 - (buf.length % 16);
    const padded = Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
    const cipher = crypto.createCipheriv("aes-128-ecb", aesKey, null);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
    const filesize = encrypted.length;
    const filekey = crypto.randomBytes(16).toString("hex");

    // 1) 获取上传 URL
    const uploadResp = await getUploadUrl({
      baseUrl: state.currentAccount.baseUrl ?? DEFAULT_BASE_URL,
      token: state.currentAccount.token,
      filekey,
      media_type: uploadMediaType,
      to_user_id: to,
      rawsize,
      rawfilemd5,
      filesize,
      no_need_thumb: true,
      aeskey: aesKeyHex,
    });

    if ((uploadResp as any).ret !== undefined && (uploadResp as any).ret !== 0) {
      throw new Error(`获取上传地址失败: ${JSON.stringify(uploadResp)}`);
    }

    // 2) 构造 CDN URL
    const cdnUrl = uploadResp.upload_full_url
      || (uploadResp.upload_param
        ? `${CDN_BASE}/upload?encrypted_query_param=${encodeURIComponent(uploadResp.upload_param)}&filekey=${encodeURIComponent(filekey)}`
        : "");
    if (!cdnUrl) {
      throw new Error(`获取上传地址失败: ${JSON.stringify(uploadResp)}`);
    }

    // 3) 上传到 CDN
    const cdnResp = await fetch(cdnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: encrypted,
    });
    if (!cdnResp.ok) {
      const errBody = await cdnResp.text().catch(() => "");
      throw new Error(`CDN 上传失败: ${cdnResp.status} ${errBody.slice(0, 200)}`);
    }

    const downloadParam = cdnResp.headers.get("x-encrypted-param") || "";

    // 4) 发送消息
    // aes_key 必须是 base64(hex_string)
    const cdnAesKey = Buffer.from(aesKeyHex, "utf-8").toString("base64");
    const media = { encrypt_query_param: downloadParam, aes_key: cdnAesKey, encrypt_type: 1 };
    let item: any;
    if (itemType === 2) {
      item = { type: 2, image_item: { file_name: name, file_size: rawsize, file_type: ext.replace(".", ""), file_md5: rawfilemd5, media } };
    } else if (itemType === 5) {
      item = { type: 5, video_item: { file_name: name, file_size: rawsize, file_type: ext.replace(".", ""), file_md5: rawfilemd5, media } };
    } else {
      item = { type: 4, file_item: { file_name: name, file_size: rawsize, file_type: ext.replace(".", ""), file_md5: rawfilemd5, media } };
    }

    await sendRawMessage({
      baseUrl: state.currentAccount.baseUrl ?? DEFAULT_BASE_URL,
      token: state.currentAccount.token,
      to,
      clientId: generateClientId(),
      contextToken,
      itemList: [item],
    });

    return `已发送 ${name} (${(rawsize / 1024).toFixed(1)} KB)`;
  }

  return { sendTextMessage, sendFileMessage };
}
