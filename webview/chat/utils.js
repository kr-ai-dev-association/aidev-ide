/**
 * Chat Utilities
 * 순수 유틸리티 함수 모음 (외부 상태 의존 없음)
 */

/**
 * sanitize-html 옵션 설정 (codepilot:// 스킴 허용)
 */
export const sanitizeOptions = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "span",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    "*": ["class", "id", "style"],
  },
  allowedSchemes: ["http", "https", "mailto", "codepilot"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto", "codepilot"],
  },
};

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

  // think/thinking 태그와 내용 모두 제거 (태그만 제거하면 thinking 내용이 그대로 노출됨)
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = result.replace(/<thinking>[\s\S]*$/gi, ""); // 닫히지 않은 태그
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "");
  result = result.replace(/<think>[\s\S]*$/gi, ""); // 닫히지 않은 태그
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

  let result = text
    // Tool 태그 제거
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
    // CODE 블록 완성된 패턴 (XML 스타일): <file_content> ... </file_content>
    .replace(/<file_content>[\s\S]*?<\/file_content>/gi, "")
    // SEARCH/REPLACE 완성된 패턴: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
    .replace(/<{3,}\s*SEARCH[\s\S]*?>{3,}\s*REPLACE/gi, "")
    // 줄 시작 기준 부분 패턴 제거 (SEARCH/REPLACE용)
    .replace(/^<{3,}\s*SEARCH.*$/gm, "")
    .replace(/^>{3,}\s*REPLACE.*$/gm, "")
    .replace(/^={3,}$/gm, "");

  // 스트리밍 중 닫히지 않은 패턴 제거 (끝부분에 있는 경우)
  // <file_content> 로 시작하고 끝나지 않은 패턴
  result = result.replace(/<file_content>[\s\S]*$/gi, "");
  // <<<<<<< SEARCH로 시작하고 끝나지 않은 패턴
  result = result.replace(/<{3,}\s*SEARCH[\s\S]*$/gi, "");

  // 🔥 핵심: 도구 호출 JSON 패턴 제거
  // LLM이 "We need to run..." 같은 자연어와 함께 { "tool": ... }을 반환하는 경우
  // 예: "We need to run read_file for src/App.tsx.{ \"tool\": \"read_file\", ... }"
  // 전체 응답을 비우는 대신 tool JSON이 있는 줄만 제거 (나머지 텍스트 보존)
  if (/\{\s*["']tool["']\s*:/.test(result)) {
    const filteredLines = result.split('\n').filter(line => !/"tool"\s*:/.test(line));
    result = filteredLines.join('\n').trim();
    // 필터 후에도 전체가 tool JSON이었다면 (단일 줄인 경우) 빈 문자열이 됨
  }

  return result.trim();
}

/**
 * 언어명 정규화 (일반적인 별칭을 표준 언어명으로 변환)
 * @param {string} lang - 언어 식별자
 * @returns {string|null} 정규화된 언어명
 */
export function normalizeLanguage(lang) {
  if (!lang) {
    return null;
  }

  const langMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    java: "java",
    c: "c",
    cpp: "cpp",
    cxx: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    go: "go",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    clj: "clojure",
    hs: "haskell",
    ml: "ocaml",
    fs: "fsharp",
    sql: "sql",
    xml: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
    ini: "ini",
    toml: "toml",
    diff: "diff",
    patch: "diff",
    vue: "vue",
    svelte: "svelte",
    dart: "dart",
    r: "r",
    lua: "lua",
    perl: "perl",
    elixir: "elixir",
    erlang: "erlang",
    julia: "julia",
    matlab: "matlab",
    powershell: "powershell",
    ps1: "powershell",
    pwsh: "powershell",
    vb: "vbnet",
    vba: "vba",
    graphql: "graphql",
    protobuf: "protobuf",
    proto: "protobuf",
    thrift: "thrift",
    solidity: "solidity",
    sol: "solidity",
    terraform: "terraform",
    tf: "terraform",
  };

  const lowerLang = lang.toLowerCase();
  return langMap[lowerLang] || lowerLang;
}

/**
 * 동적 코드 하이라이팅
 * @param {HTMLElement} codeElement - 코드 요소
 * @param {string} language - 언어 식별자
 */
export function highlightCodeBlock(codeElement, language) {
  if (!window.hljs) {
    // highlight.js가 로드되지 않았으면 일반 텍스트로 표시
    return;
  }

  const normalizedLang = normalizeLanguage(language);

  if (normalizedLang && window.hljs.getLanguage(normalizedLang)) {
    // 언어를 인식한 경우
    codeElement.className = `language-${normalizedLang}`;
    try {
      window.hljs.highlightElement(codeElement);
    } catch (err) {
      console.warn("Syntax highlighting failed:", err);
    }
  } else {
    // 언어를 모르면 자동 감지
    codeElement.className = "";
    try {
      window.hljs.highlightElement(codeElement);
    } catch (err) {
      console.warn("Auto-detection highlighting failed:", err);
    }
  }
}
