import * as vscode from "vscode";
import { AdminModelConfig } from "../../../services/llm/AdminModelTypes";
import { StateManager } from "../../managers/state/StateManager";
import { AiModelType } from "../../../services";

function safePostMessage(panel: vscode.WebviewPanel, message: any): void {
  try {
    if (panel && !panel.webview) return;
    panel.webview.postMessage(message);
  } catch {}
}

interface NotificationServiceLike {
  showInfoMessage(msg: string): void;
  showErrorMessage(msg: string): void;
}

const USER_MODEL_COMMANDS = new Set([
  "listUserModels",
  "addUserModel",
  "updateUserModel",
  "deleteUserModel",
  "selectUserModel",
  "testUserModelConnection",
]);

const GLOBAL_STATE_KEY = "codepilot-standalone.userModels";
const SECRET_KEY_PREFIX = "codepilot-standalone.userModelApiKey.";

const ALLOWED_PROVIDERS = new Set([
  "openai",
  "gemini",
  "anthropic",
  "vertex",
  "azure",
  "groq",
  "deepseek",
  "mistral",
  "together",
  "xai",
  "fireworks",
  "perplexity",
  "chat_completions",
  "custom",
]);
const ALLOWED_AUTH_TYPES = new Set([
  "bearer",
  "query_param",
  "custom_header",
  "none",
]);

/** UI로 전송하는 사용자 모델 항목 (apiKey 제외, hasApiKey 플래그만) */
export interface UserModelSummary {
  key: string;
  name: string;
  provider: string;
  model: string;
  endpoint: string;
  authType: "bearer" | "query_param" | "custom_header" | "none";
  authHeaderName?: string;
  hasApiKey: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  defaultTemperature?: number;
  topP?: number;
  customHeaders?: Record<string, string>;
  streamingSupported?: boolean;
  nativeToolCallingSupported?: boolean;
  enabled?: boolean;
}

function validateModelInput(input: any): {
  ok: boolean;
  error?: string;
  normalized?: UserModelSummary;
} {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "잘못된 입력입니다." };
  }
  const name = String(input.name || "").trim();
  const provider = String(input.provider || "").trim();
  const model = String(input.model || "").trim();
  const endpoint = String(input.endpoint || "").trim();
  const authType = String(input.authType || "bearer").trim() as
    | "bearer"
    | "query_param"
    | "custom_header"
    | "none";

  if (!name) return { ok: false, error: "모델 이름이 필요합니다." };
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return { ok: false, error: `지원하지 않는 프로바이더: ${provider}` };
  }
  if (!model) return { ok: false, error: "모델 ID가 필요합니다." };
  if (!endpoint) return { ok: false, error: "엔드포인트가 필요합니다." };
  if (!/^https?:\/\//i.test(endpoint)) {
    return { ok: false, error: "엔드포인트는 http(s)://로 시작해야 합니다." };
  }
  if (!ALLOWED_AUTH_TYPES.has(authType)) {
    return { ok: false, error: `지원하지 않는 인증 방식: ${authType}` };
  }

  // customHeaders: 객체 또는 JSON 문자열 허용
  let customHeaders: Record<string, string> | undefined;
  if (input.customHeaders != null && input.customHeaders !== "") {
    if (typeof input.customHeaders === "string") {
      try {
        const parsed = JSON.parse(input.customHeaders);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          customHeaders = {};
          for (const [k, v] of Object.entries(parsed)) {
            customHeaders[String(k)] = String(v);
          }
        } else {
          return { ok: false, error: "추가 헤더는 JSON 객체여야 합니다." };
        }
      } catch {
        return {
          ok: false,
          error: "추가 헤더 JSON 파싱 실패",
        };
      }
    } else if (
      typeof input.customHeaders === "object" &&
      !Array.isArray(input.customHeaders)
    ) {
      customHeaders = {};
      for (const [k, v] of Object.entries(input.customHeaders)) {
        customHeaders[String(k)] = String(v);
      }
    }
  }

  const tempRaw =
    input.defaultTemperature != null ? Number(input.defaultTemperature) : 0.7;
  const topPRaw = input.topP != null ? Number(input.topP) : 0.9;
  if (!(tempRaw >= 0 && tempRaw <= 2)) {
    return { ok: false, error: "기본 온도는 0 ~ 2 사이여야 합니다." };
  }
  if (!(topPRaw >= 0 && topPRaw <= 1)) {
    return { ok: false, error: "Top P는 0 ~ 1 사이여야 합니다." };
  }

  const contextWindow =
    input.contextWindow != null ? Number(input.contextWindow) : undefined;
  const maxOutputTokens =
    input.maxOutputTokens != null ? Number(input.maxOutputTokens) : undefined;
  if (
    contextWindow != null &&
    (!Number.isFinite(contextWindow) || contextWindow < 0)
  ) {
    return { ok: false, error: "컨텍스트 윈도우 값이 잘못되었습니다." };
  }
  if (
    maxOutputTokens != null &&
    (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 0)
  ) {
    return { ok: false, error: "최대 출력 토큰 값이 잘못되었습니다." };
  }

  const authHeaderName =
    authType === "custom_header"
      ? String(input.authHeaderName || "").trim()
      : undefined;
  if (authType === "custom_header" && !authHeaderName) {
    return {
      ok: false,
      error: "custom_header 인증에는 헤더 이름이 필요합니다.",
    };
  }

  const normalized: UserModelSummary = {
    key: String(input.key || "").trim(),
    name,
    provider,
    model,
    endpoint,
    authType,
    authHeaderName,
    hasApiKey: false, // caller가 실제 키 존재 여부로 덮어씀
    contextWindow,
    maxOutputTokens,
    defaultTemperature: tempRaw,
    topP: topPRaw,
    customHeaders,
    streamingSupported: input.streamingSupported !== false,
    nativeToolCallingSupported: input.nativeToolCallingSupported === true,
    enabled: input.enabled !== false,
  };

  return { ok: true, normalized };
}

function genKey(name: string, existingKeys: Set<string>): string {
  const base =
    (name || "model")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "model";
  let candidate = base;
  let n = 1;
  while (existingKeys.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

function readUserModels(context: vscode.ExtensionContext): UserModelSummary[] {
  const raw = context.globalState.get<UserModelSummary[]>(GLOBAL_STATE_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeUserModels(
  context: vscode.ExtensionContext,
  models: UserModelSummary[],
): Promise<void> {
  await context.globalState.update(GLOBAL_STATE_KEY, models);
}

async function loadUserModelsWithApiKeyFlag(
  context: vscode.ExtensionContext,
): Promise<UserModelSummary[]> {
  const models = readUserModels(context);
  const result: UserModelSummary[] = [];
  for (const m of models) {
    const secret = await context.secrets.get(SECRET_KEY_PREFIX + m.key);
    result.push({ ...m, hasApiKey: !!secret });
  }
  return result;
}

async function buildAdminConfigForUserModel(
  context: vscode.ExtensionContext,
  summary: UserModelSummary,
): Promise<AdminModelConfig> {
  const apiKey =
    (await context.secrets.get(SECRET_KEY_PREFIX + summary.key)) || "";
  return {
    key: summary.key,
    provider: summary.provider,
    model: summary.model,
    apiKey,
    endpoint: summary.endpoint,
    maxOutputTokens: summary.maxOutputTokens,
    contextWindow: summary.contextWindow,
    enabled: summary.enabled !== false,
    authType: summary.authType,
    authHeaderName: summary.authHeaderName,
    defaultTemperature: summary.defaultTemperature,
    topP: summary.topP,
    customHeaders: summary.customHeaders,
    streamingSupported: summary.streamingSupported !== false,
    nativeToolCallingSupported: summary.nativeToolCallingSupported === true,
  };
}

export class UserModelHandler {
  static isUserModelCommand(command: string): boolean {
    return USER_MODEL_COMMANDS.has(command);
  }

  /**
   * 채팅 패널 드롭다운에 표시할 사용자 모델 목록
   * `{ key, name, displayName }` 형식 — adminModels/supportedModels와 동일 패턴
   */
  static listForChatDropdown(
    context: vscode.ExtensionContext,
  ): { key: string; name: string; displayName: string }[] {
    const models = readUserModels(context);
    return models
      .filter((m) => m.enabled !== false)
      .map((m) => ({
        key: m.key,
        name: `user:${m.key}`,
        displayName: m.name || m.model || m.key,
      }));
  }

  /**
   * 외부에서 활성 사용자 모델을 로드·적용할 때 사용
   * `saveAiModel`에서 `user:{key}` 처리 시 재사용
   */
  static async buildAdminConfigByKey(
    context: vscode.ExtensionContext,
    key: string,
  ): Promise<AdminModelConfig | null> {
    const models = readUserModels(context);
    const found = models.find((m) => m.key === key);
    if (!found) return null;
    return await buildAdminConfigForUserModel(context, found);
  }

  static async handleMessage(
    data: any,
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    notificationService: NotificationServiceLike,
  ): Promise<boolean> {
    if (!this.isUserModelCommand(data.command)) return false;

    try {
      switch (data.command) {
        case "listUserModels": {
          const stateManager = StateManager.getInstance(context);
          const activeAiModel = await stateManager.getAiModel();
          const activeKey = activeAiModel?.startsWith("user:")
            ? activeAiModel.substring("user:".length)
            : "";
          const models = await loadUserModelsWithApiKeyFlag(context);
          safePostMessage(panel, {
            command: "userModelsLoaded",
            models,
            activeKey,
          });
          return true;
        }

        case "addUserModel":
        case "updateUserModel": {
          const isUpdate = data.command === "updateUserModel";
          const validation = validateModelInput(data.model || {});
          if (!validation.ok || !validation.normalized) {
            safePostMessage(panel, {
              command: "userModelSaveError",
              error: validation.error || "잘못된 입력",
            });
            return true;
          }
          const incoming = validation.normalized;
          const all = readUserModels(context);
          const existingKeys = new Set(all.map((m) => m.key));

          if (isUpdate) {
            if (!incoming.key) {
              safePostMessage(panel, {
                command: "userModelSaveError",
                error: "수정 대상 key가 없습니다.",
              });
              return true;
            }
            const idx = all.findIndex((m) => m.key === incoming.key);
            if (idx === -1) {
              safePostMessage(panel, {
                command: "userModelSaveError",
                error: "수정 대상 모델을 찾을 수 없습니다.",
              });
              return true;
            }
            // 이름 중복 검사 (본인 제외)
            if (
              all.some(
                (m) => m.key !== incoming.key && m.name === incoming.name,
              )
            ) {
              safePostMessage(panel, {
                command: "userModelSaveError",
                error: `같은 이름의 모델이 이미 존재합니다: ${incoming.name}`,
              });
              return true;
            }
            const merged: UserModelSummary = {
              ...incoming,
              hasApiKey: false,
            };
            all[idx] = merged;
          } else {
            if (all.some((m) => m.name === incoming.name)) {
              safePostMessage(panel, {
                command: "userModelSaveError",
                error: `같은 이름의 모델이 이미 존재합니다: ${incoming.name}`,
              });
              return true;
            }
            existingKeys.delete(incoming.key);
            incoming.key = genKey(incoming.name, existingKeys);
            all.push(incoming);
          }

          // API 키: 빈 문자열이 전달되면 기존 값 유지 (update), 명시적 null은 삭제
          if (typeof data.apiKey === "string") {
            if (data.apiKey.length > 0) {
              await context.secrets.store(
                SECRET_KEY_PREFIX + incoming.key,
                data.apiKey,
              );
            } else if (data.clearApiKey === true) {
              await context.secrets.delete(SECRET_KEY_PREFIX + incoming.key);
            }
          }

          await writeUserModels(context, all);
          const models = await loadUserModelsWithApiKeyFlag(context);
          safePostMessage(panel, {
            command: "userModelSaved",
            key: incoming.key,
            models,
          });
          notificationService.showInfoMessage(
            `CODEPILOT-STANDALONE: 사용자 모델 저장됨 - ${incoming.name}`,
          );
          return true;
        }

        case "deleteUserModel": {
          const key = String(data.key || "").trim();
          if (!key) {
            safePostMessage(panel, {
              command: "userModelSaveError",
              error: "삭제 대상 key가 없습니다.",
            });
            return true;
          }
          const all = readUserModels(context);
          const remaining = all.filter((m) => m.key !== key);
          if (remaining.length === all.length) {
            safePostMessage(panel, {
              command: "userModelSaveError",
              error: "해당 모델을 찾을 수 없습니다.",
            });
            return true;
          }
          await writeUserModels(context, remaining);
          await context.secrets.delete(SECRET_KEY_PREFIX + key);

          // 활성 모델이 지워진 경우 Ollama로 폴백
          const stateManager = StateManager.getInstance(context);
          const currentAi = await stateManager.getAiModel();
          if (currentAi === `user:${key}`) {
            await stateManager.saveAiModel("ollama");
            await stateManager.saveCurrentAiModel("ollama");
            try {
              const { LLMManager } =
                await import("../../managers/model/LLMManager");
              LLMManager.getInstance().setCurrentModel(AiModelType.OLLAMA);
            } catch {}
          }

          const models = await loadUserModelsWithApiKeyFlag(context);
          safePostMessage(panel, {
            command: "userModelDeleted",
            key,
            models,
          });
          notificationService.showInfoMessage(
            "CODEPILOT-STANDALONE: 사용자 모델 삭제됨",
          );
          return true;
        }

        case "selectUserModel": {
          const key = String(data.key || "").trim();
          if (!key) {
            safePostMessage(panel, {
              command: "userModelSaveError",
              error: "선택 대상 key가 없습니다.",
            });
            return true;
          }
          const config = await UserModelHandler.buildAdminConfigByKey(
            context,
            key,
          );
          if (!config) {
            safePostMessage(panel, {
              command: "userModelSaveError",
              error: "해당 모델을 찾을 수 없습니다.",
            });
            return true;
          }
          try {
            const { LLMManager } =
              await import("../../managers/model/LLMManager");
            const llm = LLMManager.getInstance();
            llm.setAdminModelConfig(config);
            llm.setCurrentModel(AiModelType.ADMIN);
          } catch {}

          const stateManager = StateManager.getInstance(context);
          await stateManager.saveAdminModelConfig(JSON.stringify(config));
          await stateManager.saveAiModel(`user:${key}`);
          await stateManager.saveCurrentAiModel("admin");

          try {
            const { updateAdminTokenLimits } =
              await import("../../../utils/tokenUtils");
            updateAdminTokenLimits(
              config.contextWindow,
              config.maxOutputTokens,
            );
          } catch {}

          safePostMessage(panel, {
            command: "userModelSelected",
            key,
            modelName: config.model,
          });
          // 웹뷰 UI가 전체 설정 갱신하도록 aiModelSaved도 함께 알림
          safePostMessage(panel, { command: "aiModelSaved" });
          notificationService.showInfoMessage(
            `CODEPILOT-STANDALONE: 활성 모델 - ${config.model}`,
          );
          return true;
        }

        case "testUserModelConnection": {
          const key = String(data.key || "").trim();
          if (!key) {
            safePostMessage(panel, {
              command: "userModelConnectionTestResult",
              success: false,
              message: "테스트 대상 key가 없습니다.",
            });
            return true;
          }
          const config = await UserModelHandler.buildAdminConfigByKey(
            context,
            key,
          );
          if (!config) {
            safePostMessage(panel, {
              command: "userModelConnectionTestResult",
              success: false,
              message: "모델을 찾을 수 없습니다.",
            });
            return true;
          }
          const result = await testConnection(config);
          safePostMessage(panel, {
            command: "userModelConnectionTestResult",
            success: result.ok,
            message: result.message,
          });
          return true;
        }
      }
      return false;
    } catch (error: any) {
      safePostMessage(panel, {
        command: "userModelSaveError",
        error: error?.message || String(error),
      });
      notificationService.showErrorMessage(
        `Error in user model handler: ${error?.message || error}`,
      );
      return true;
    }
  }
}

/**
 * 아주 가벼운 연결 테스트: HEAD 또는 GET으로 엔드포인트에 요청을 보내
 * 2xx/4xx 응답이 오는지만 확인한다. 5xx/network error만 실패 처리.
 * 모델 호출은 하지 않아 비용이 들지 않는다.
 */
async function testConnection(
  config: AdminModelConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const endpoint = config.endpoint;
    const headers: Record<string, string> = {
      ...(config.customHeaders || {}),
    };
    if (config.apiKey) {
      if (config.authType === "bearer") {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      } else if (config.authType === "custom_header" && config.authHeaderName) {
        headers[config.authHeaderName] = config.apiKey;
      }
    }
    // 10초 타임아웃
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 500) {
      return {
        ok: false,
        message: `서버 오류: HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      message: `응답 수신: HTTP ${res.status}`,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: `연결 실패: ${error?.message || error}`,
    };
  }
}
