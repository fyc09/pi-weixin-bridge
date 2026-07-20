/**
 * 共享可变状态
 * 所有模块通过此对象读写运行时状态（引用传递，改属性即生效）
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WeixinAccountData } from "./types.ts";

export interface WeixinState {
  pi: ExtensionAPI;
  SESSION_ID: string;
  currentAccount: (WeixinAccountData & { accountId: string }) | null;
  isConnected: boolean;
  loginInProgress: boolean;
  toolsEnabled: boolean;
  // 1v1: 只有一个用户; context_token 可复用, 每条入站消息刷新
  replyUserId: string | null;
  replyContextToken: string | undefined;
  lastCtx: any;
  monitorAbortController: AbortController | null;
}

export function createWeixinState(pi: ExtensionAPI, sessionId: string): WeixinState {
  return {
    pi,
    SESSION_ID: sessionId,
    currentAccount: null,
    isConnected: false,
    loginInProgress: false,
    toolsEnabled: false,
    replyUserId: null,
    replyContextToken: undefined,
    lastCtx: null,
    monitorAbortController: null,
  };
}
