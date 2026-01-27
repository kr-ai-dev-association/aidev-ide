/**
 * Chat Utilities
 * 순수 유틸리티 함수 모음 (외부 상태 의존 없음)
 */

/**
 * 현재 진행 중인 think 태그 추출
 * @param {string} text - 전체 텍스트
 * @returns {{thinkContent: string|null, isThinking: boolean, justCompleted?: boolean}}
 */
export function extractCurrentThink(text) {
  // 아직 닫히지 않은 think 태그 찾기 (현재 진행 중인 것)
  const openThinkMatch = text.match(/<think>([\s\S]*)$/i);
  if (openThinkMatch) {
    // 닫히지 않은 think 태그가 있음 = 현재 사고 중
    return {
      thinkContent: openThinkMatch[1].trim(),
      isThinking: true,
    };
  }

  // 가장 마지막 완료된 think 태그 찾기 (바로 직전에 완료된 것 - 잠시 표시용)
  const closedThinkMatches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)];
  if (closedThinkMatches.length > 0) {
    const lastMatch = closedThinkMatches[closedThinkMatches.length - 1];
    return {
      thinkContent: lastMatch[1].trim(),
      isThinking: false,
      justCompleted: true,
    };
  }

  return { thinkContent: null, isThinking: false };
}

/**
 * think 태그를 제거한 텍스트 반환 (최종 출력용)
 * @param {string} text - 원본 텍스트
 * @returns {string} think 태그가 제거된 텍스트
 */
export function removeThinkTags(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

/**
 * HTML 이스케이프
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 고유 ID 생성
 * @returns {string} 생성된 ID
 */
export function generateId() {
  return "q_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * XML 툴 태그를 제거하거나 사용자 친화적인 텍스트로 변환
 * @param {string} text - 원본 텍스트 (XML 툴 태그 포함 가능)
 * @returns {string} - 툴 태그가 제거되거나 변환된 텍스트
 */
export function removeToolTags(text) {
  if (!text) {
    return text;
  }

  let result = text;

  // 툴 이름 목록
  const toolNames = [
    "create_file",
    "update_file",
    "remove_file",
    "read_file",
    "list_files",
    "search_files",
    "run_command",
    "analyze_code",
    "verify_code",
    "refactor_code",
  ];

  // 각 툴 태그를 처리
  for (const toolName of toolNames) {
    // 정규식: <toolName>...</toolName> 또는 <toolName>...</toolName> (개행 포함)
    const toolTagRegex = new RegExp(
      `<${toolName}>([\\s\\S]*?)<\\/${toolName}>`,
      "gi",
    );

    result = result.replace(toolTagRegex, (match, content) => {
      // 툴 태그를 완전히 제거
      return "";
    });
  }

  // 부분 태그 제거 (스트리밍 중 닫히지 않은 태그)
  const lastOpenBracketIndex = result.lastIndexOf("<");
  if (lastOpenBracketIndex !== -1) {
    const possibleTag = result.slice(lastOpenBracketIndex);
    // 닫는 태그가 없고 툴 이름과 일치하면 제거
    if (
      !possibleTag.includes("</") &&
      toolNames.some((name) => possibleTag.startsWith(`<${name}`))
    ) {
      result = result.slice(0, lastOpenBracketIndex);
    }
  }

  // 기타 XML 태그 제거 (thinking, function_calls 등)
  result = result.replace(/<thinking>\s?/g, "");
  result = result.replace(/\s?<\/thinking>/g, "");
  result = result.replace(/<think>\s?/g, "");
  result = result.replace(/\s?<\/think>/g, "");
  result = result.replace(/<function_calls>\s?/g, "");
  result = result.replace(/\s?<\/function_calls>/g, "");

  return result;
}

/**
 * 최후 방어선: Tool 태그 완전 차단
 * @param {string} text - 원본 텍스트
 * @returns {string} - 툴 태그가 완전히 제거된 텍스트
 */
export function sanitizeLastResort(text) {
  if (!text) {
    return "";
  }

  return text
    .replace(/<read_file[\s\S]*?<\/read_file>/gi, "")
    .replace(/<update_file[\s\S]*?<\/update_file>/gi, "")
    .replace(/<create_file[\s\S]*?<\/create_file>/gi, "")
    .replace(/<remove_file[\s\S]*?<\/remove_file>/gi, "")
    .replace(/<list_files[\s\S]*?<\/list_files>/gi, "")
    .replace(/<search_files[\s\S]*?<\/search_files>/gi, "")
    .replace(/<ripgrep_search[\s\S]*?<\/ripgrep_search>/gi, "")
    .replace(/<run_command[\s\S]*?<\/run_command>/gi, "")
    .replace(/<plan[\s\S]*?<\/plan>/gi, "")
    .replace(/<task_progress[\s\S]*?<\/task_progress>/gi, "")
    // CODE 블록 및 SEARCH/REPLACE diff 패턴 제거
    .replace(/<{3,}CODE[\s\S]*?>{3,}END/gi, "")
    .replace(/<{3,}\s*SEARCH[\s\S]*?>{3,}\s*REPLACE/gi, "")
    .replace(/^<{3,}.*$/gm, "")
    .replace(/^>{3,}.*$/gm, "")
    .replace(/^={3,}$/gm, "")
    .trim();
}
