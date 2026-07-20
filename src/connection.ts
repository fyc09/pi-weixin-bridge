/**
 * 连接管理: 登录/登出/连接/断开/状态栏/配置
 *
 * 工厂函数 createConnection(state, { startMonitor, stopMonitor })
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import qrcodeTerminal from "qrcode-terminal";
import {
  fullQRLogin,
  getLoggedInAccounts,
  logoutAccount,
} from "./weixin-auth.ts";
import {
  acquireLock,
  releaseLock,
  checkLockStatus,
  forceReleaseLock,
} from "./lock-manager.ts";
import { getConfigPath } from "./utils.ts";
import { DEFAULT_BASE_URL } from "./weixin-api.ts";
import type { WeixinState } from "./state.ts";

export function createConnection(
  state: WeixinState,
  deps: { startMonitor: () => void; stopMonitor: () => void }
) {
  // ── 配置 ──

  async function loadConfig(): Promise<{ lastAccountId?: string }> {
    try {
      const data = await readFile(getConfigPath(), "utf8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async function saveConfig(cfg: { lastAccountId?: string }) {
    await mkdir(dirname(getConfigPath()), { recursive: true });
    await writeFile(getConfigPath(), JSON.stringify(cfg, null, "\t") + "\n");
  }

  // ── 状态栏 ──

  async function updateStatus(ctx: any) {
    if (!ctx?.ui?.setStatus) return;

    if (!state.currentAccount && !state.loginInProgress) {
      ctx.ui.setStatus("weixinbot", "");
      return;
    }

    let status = "[微信]";

    if (state.loginInProgress) {
      status += " ⏳ 登录中...";
    } else if (state.isConnected && state.currentAccount) {
      const accountShort = state.currentAccount.accountId.slice(0, 8);
      status += ` ✅ 已连接 | ${accountShort}...`;
    } else {
      status += " ❌ 已断开";
    }

    const lockStatus = await checkLockStatus();
    if (lockStatus.locked) {
      status += lockStatus.ownedByMe ? " | 🔒" : " | ❌ 被占用";
    }

    ctx.ui.setStatus("weixinbot", status);
  }

  // ── 连接/断开 ──

  async function performConnect(ctx?: any): Promise<boolean> {
    // 尝试从缓存恢复账户
    if (!state.currentAccount?.token) {
      const cfg = await loadConfig();
      if (cfg.lastAccountId) {
        const saved = getLoggedInAccounts().find(a => a.accountId === cfg.lastAccountId);
        if (saved?.token) {
          state.currentAccount = saved;
        }
      }
    }
    if (!state.currentAccount?.token) {
      if (ctx?.hasUI) await ctx.ui.notify("未登录, 请先 /weixin-login 扫码", "error");
      return false;
    }
    if (state.isConnected) return true;

    const lockResult = await acquireLock(state.SESSION_ID, state.currentAccount.accountId);
    if (!lockResult.success) {
      if (ctx?.hasUI) await ctx.ui.notify(`[weixinbot] ${lockResult.message}`, "error");
      await updateStatus(ctx);
      return false;
    }
    state.isConnected = true;
    deps.startMonitor();
    state.toolsEnabled = true;
    if (ctx?.hasUI) await ctx.ui.notify("微信已连接", "info");
    await updateStatus(ctx);
    return true;
  }

  async function performDisconnect() {
    if (!state.isConnected) return;
    deps.stopMonitor();
    await releaseLock(state.SESSION_ID);
    state.isConnected = false;
    state.toolsEnabled = false;
  }

  // ── 登录/登出 ──

  async function performLogin(ctx?: any): Promise<boolean> {
    try {
      // 先尝试从缓存恢复
      const config = await loadConfig();
      if (config.lastAccountId) {
        const saved = getLoggedInAccounts().find(a => a.accountId === config.lastAccountId);
        if (saved?.token) {
          state.currentAccount = saved;
          return await performConnect(ctx);
        }
      }

      // 走二维码登录
      state.loginInProgress = true;
      await updateStatus(ctx);

      const result = await fullQRLogin({
        onStatus: (_status, _message) => {},
        onQRCode: (url) => {
          if (url) {
            try {
              qrcodeTerminal.generate(url, { small: true }, (qrText) => {
                if (state.lastCtx?.hasUI) {
                  state.lastCtx.ui.notify("请用微信扫描:\n\n" + qrText, "info");
                }
              });
            } catch {
              if (state.lastCtx?.hasUI) state.lastCtx.ui.notify("二维码生成失败，请重试", "error");
            }
          }
        },
      });

      state.loginInProgress = false;

      if (result.connected && result.accountId) {
        const accounts = getLoggedInAccounts();
        state.currentAccount = accounts.find(a => a.accountId === result.accountId) ?? null;
        if (!state.currentAccount) {
          await updateStatus(ctx);
          return false;
        }
        await saveConfig({ lastAccountId: result.accountId });
        return await performConnect(ctx);
      }

      await updateStatus(ctx);
      return false;
    } catch (err) {
      state.loginInProgress = false;
      if (ctx?.hasUI) ctx.ui.notify("微信登录异常: " + String(err), "error");
      await updateStatus(ctx);
      return false;
    }
  }

  async function performLogout(accountId: string, ctx?: any): Promise<void> {
    await performDisconnect();
    logoutAccount(accountId);
    if (state.currentAccount?.accountId === accountId) {
      state.currentAccount = null;
    }
    await updateStatus(ctx);
  }

  return {
    loadConfig,
    saveConfig,
    updateStatus,
    performConnect,
    performDisconnect,
    performLogin,
    performLogout,
  };
}

export { checkLockStatus, forceReleaseLock, releaseLock };
