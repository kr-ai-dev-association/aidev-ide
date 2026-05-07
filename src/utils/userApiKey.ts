/**
 * 사용자가 IDE settings UI 에서 입력한 모델별 API 키 조회/관리 유틸.
 *
 * 슬롯 구조:
 *   `codepilot.adminApiKey.<modelKey>` — 모델별 분리. 각 admin/preset 모델 키마다 독립.
 *
 * 우선순위 (호출 측에서):
 *   1. 본 함수 반환값 (사용자 그 모델용 명시 입력)
 *   2. server settings 의 v.api_key / v.apiKey (admin 푸시)
 *   3. 빈 문자열
 *
 * 옛 단일 글로벌 슬롯 `codepilot.adminApiKey` 는 deprecate — read 안 함.
 * 옛 슬롯 데이터는 `cleanupLegacyApiKeySlot()` 으로 활성화 시 정리.
 */

import * as vscode from "vscode";

const LEGACY_GLOBAL_SLOT = "codepilot.adminApiKey";

/**
 * 모델별 사용자 로컬 API 키 조회. 미입력 시 빈 문자열.
 */
export function getUserApiKeyForModel(
  context: vscode.ExtensionContext,
  modelKey: string,
): string {
  if (!modelKey) return "";
  return (
    context.globalState.get<string>(`${LEGACY_GLOBAL_SLOT}.${modelKey}`) || ""
  );
}

/**
 * 모델별 사용자 로컬 API 키 저장.
 */
export async function setUserApiKeyForModel(
  context: vscode.ExtensionContext,
  modelKey: string,
  apiKey: string,
): Promise<void> {
  if (!modelKey) {
    throw new Error("setUserApiKeyForModel: modelKey is required");
  }
  await context.globalState.update(`${LEGACY_GLOBAL_SLOT}.${modelKey}`, apiKey);
}

/**
 * 활성화 시 옛 단일 글로벌 슬롯 cleanup. 새 IDE 가 더 이상 read 안 하므로
 * 디스크에 잔존하는 stale 데이터 제거. silent (사용자 알림 X).
 *
 * 이 cleanup 은 한 번만 실행돼도 무방 — undefined 로 update 하면 재실행 시 no-op.
 */
export async function cleanupLegacyApiKeySlot(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const stale = context.globalState.get<string>(LEGACY_GLOBAL_SLOT);
    if (stale) {
      await context.globalState.update(LEGACY_GLOBAL_SLOT, undefined);
    }
  } catch {
    /* 실패해도 사용자 영향 없음 — silent */
  }
}

/**
 * 사용자가 settings UI 에서 명시 선택한 키 출처 슬롯.
 *  - "admin"   → admin 공유 키 사용
 *  - "personal" → 사용자 로컬 키 사용
 *  - ""        → 미설정 (legacy default: personal 우선, 없으면 admin)
 *
 * 모델별 분리 슬롯: `codepilot.apiKeySource.<modelKey>`.
 */
const API_KEY_SOURCE_PREFIX = "codepilot.apiKeySource";

export function getApiKeySource(
  context: vscode.ExtensionContext,
  modelKey: string,
): string {
  if (!modelKey) return "";
  return (
    context.globalState.get<string>(`${API_KEY_SOURCE_PREFIX}.${modelKey}`) ||
    ""
  );
}

export async function setApiKeySource(
  context: vscode.ExtensionContext,
  modelKey: string,
  source: string,
): Promise<void> {
  if (!modelKey) return;
  await context.globalState.update(
    `${API_KEY_SOURCE_PREFIX}.${modelKey}`,
    source,
  );
}

/**
 * adminConfig 적용 직전에 호출 — apiKeySource 슬롯 보고 admin 공유 키와 사용자
 * 개인 키 중 무엇을 쓸지 결정해서 반환.
 *
 *  - source="admin"   → sharedApiKey
 *  - source="personal" → userApiKey
 *  - source=""        → personal 우선, 없으면 shared (legacy default)
 *
 * caller 가 이 반환값을 adminConfig.apiKey 로 박은 뒤 LLMManager.setAdminModelConfig
 * 호출. 모든 호출처가 이 헬퍼를 통과하면 dropdown 토글이 모든 진입점에서 일관되게
 * 동작.
 */
export function resolveApiKeyBySource(
  context: vscode.ExtensionContext,
  modelKey: string,
  sharedApiKey: string,
  userApiKey: string,
): string {
  const source = getApiKeySource(context, modelKey);
  if (source === "admin") return sharedApiKey || "";
  if (source === "personal") return userApiKey || "";
  // legacy default — personal 우선, 없으면 shared.
  return userApiKey || sharedApiKey || "";
}
