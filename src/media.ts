/**
 * 媒体下载与解密（纯函数，不依赖运行时状态）
 *
 * AES-128-ECB + PKCS7 解密 CDN 下载的加密文件
 * 图片/视频后缀用魔术字节检测; 语音固定 .silk; 文件用 file_name
 */
import crypto from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";

const CDN_BASE = "https://novac2c.cdn.weixin.qq.com/c2c";

/**
 * 解析 aes_key: 可能是 base64(原始16字节) 或 base64(hex字符串)
 */
export function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) return decoded;
  if (decoded.length === 32) return Buffer.from(decoded.toString("ascii"), "hex");
  return decoded;
}

/**
 * 用魔术字节检测图片/视频后缀
 */
export function detectExt(data: Buffer): string {
  const h = data.toString("hex", 0, Math.min(data.length, 16)).toUpperCase();
  if (h.startsWith("FFD8FF")) return ".jpg";
  if (h.startsWith("89504E47")) return ".png";
  if (h.startsWith("47494638")) return ".gif";
  if (h.startsWith("52494646") && h.includes("57454250")) return ".webp";
  if (h.startsWith("424D")) return ".bmp";
  if (h.startsWith("000000") && h.includes("66747970")) return ".mp4";
  if (h.startsWith("000000") && h.includes("6D6F6F76")) return ".mov";
  return "";
}

/**
 * 下载并解密入站媒体，保存到临时目录，返回文件路径
 *
 * item.type: 2=图片 3=语音 4=文件 5=视频
 */
export async function downloadInboundMedia(item: any): Promise<string | null> {
  const MAP: Record<number, string> = { 2: "image_item", 3: "voice_item", 4: "file_item", 5: "video_item" };
  const key = MAP[item.type];
  if (!key) return null;
  const sub = item[key];
  if (!sub?.media?.encrypt_query_param) return null;

  const qp = sub.media.encrypt_query_param;
  const cdnUrl = `${CDN_BASE}/download?encrypted_query_param=${encodeURIComponent(qp)}`;
  const resp = await fetch(cdnUrl);
  if (!resp.ok) return null;
  const encrypted = Buffer.from(await resp.arrayBuffer());

  // 解密
  let aesKey: Buffer | null = null;
  if (sub.aeskey) {
    aesKey = Buffer.from(sub.aeskey, "hex");
  } else if (sub.media?.aes_key) {
    aesKey = parseAesKey(sub.media.aes_key);
  }
  if (!aesKey) return null;

  const decipher = crypto.createDecipheriv("aes-128-ecb", aesKey, null);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  // 去除 PKCS7 填充
  const padLen = decrypted[decrypted.length - 1];
  if (padLen > 0 && padLen <= 16) decrypted = decrypted.slice(0, decrypted.length - padLen);

  // 后缀: 图片/视频用魔术字节; 语音固定 .silk; 文件用 file_name
  let ext = "";
  if (item.type === 3) {
    ext = ".silk";
  } else if (item.type === 2 || item.type === 5) {
    ext = detectExt(decrypted);
  }
  const fileName = sub.file_name || "";
  const base = fileName || `${Date.now()}`;
  const saveName = base.includes(".") ? base : (ext ? base + ext : base);

  const dir = join(tmpdir(), "weixin-inbound");
  mkdirSync(dir, { recursive: true });
  const savePath = join(dir, saveName);
  writeFileSync(savePath, decrypted);
  return savePath;
}
