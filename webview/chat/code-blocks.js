/**
 * Code Blocks Module
 * 코드 블록 관련 기능 (하이라이팅, UI 개선)
 */

import { getIcon } from "@peoplesgrocers/seti-ui-file-icons";

/**
 * 언어명 정규화
 * @param {string} lang - 원본 언어명
 * @returns {string} 정규화된 언어명
 */
export function normalizeLanguage(lang) {
  if (!lang) return null;

  const langMap = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    cs: "csharp",
    cpp: "cpp",
    "c++": "cpp",
    "c#": "csharp",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    jsx: "javascript",
    tsx: "typescript",
    vue: "vue",
    svelte: "svelte",
    rs: "rust",
    go: "go",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    objc: "objectivec",
    "objective-c": "objectivec",
    pl: "perl",
    php: "php",
    sql: "sql",
    dockerfile: "dockerfile",
    docker: "dockerfile",
    makefile: "makefile",
    make: "makefile",
    cmake: "cmake",
    gradle: "gradle",
    groovy: "groovy",
    scala: "scala",
    clj: "clojure",
    clojure: "clojure",
    erl: "erlang",
    erlang: "erlang",
    ex: "elixir",
    elixir: "elixir",
    hs: "haskell",
    haskell: "haskell",
    lua: "lua",
    r: "r",
    matlab: "matlab",
    julia: "julia",
    dart: "dart",
    nim: "nim",
    zig: "zig",
    v: "v",
    crystal: "crystal",
    d: "d",
    elm: "elm",
    f90: "fortran",
    fortran: "fortran",
    pas: "pascal",
    pascal: "pascal",
    asm: "x86asm",
    assembly: "x86asm",
    nasm: "x86asm",
    wasm: "wasm",
    wat: "wasm",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    properties: "properties",
    env: "properties",
    xml: "xml",
    html: "html",
    htm: "html",
    xhtml: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    stylus: "stylus",
    json: "json",
    jsonc: "json",
    graphql: "graphql",
    gql: "graphql",
    proto: "protobuf",
    protobuf: "protobuf",
    thrift: "thrift",
    avro: "json",
    latex: "latex",
    tex: "latex",
    diff: "diff",
    patch: "diff",
    plaintext: "plaintext",
    text: "plaintext",
    txt: "plaintext",
  };

  const normalized = lang.toLowerCase().trim();
  return langMap[normalized] || normalized;
}

/**
 * 파일 아이콘 로드
 * @param {string} filename - 파일명 또는 확장자
 * @param {HTMLElement} container - 아이콘을 삽입할 컨테이너
 * @param {string} displayLang - 표시할 언어명 (선택사항)
 * @param {number} iconSize - 아이콘 크기 (px, 기본값: 18)
 */
export function loadFileIcon(filename, container, displayLang, iconSize = 18) {
  if (displayLang) {
    container.textContent = displayLang.toUpperCase();
  } else {
    container.textContent = "";
  }

  try {
    const iconData = getIcon(filename);
    if (iconData && iconData.svg) {
      container.textContent = "";

      const iconContainer = document.createElement("span");
      iconContainer.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: ${iconSize}px;
        height: ${iconSize}px;
        flex-shrink: 0;
        vertical-align: middle;
      `;
      iconContainer.innerHTML = iconData.svg;

      const svgElement = iconContainer.querySelector("svg");
      if (svgElement) {
        if (iconData.color) {
          svgElement.setAttribute("fill", iconData.color);
        }
        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");
        svgElement.style.cssText = `
          width: 100%;
          height: 100%;
          display: block;
        `;
      }

      container.appendChild(iconContainer);

      if (displayLang) {
        const textSpan = document.createElement("span");
        textSpan.style.marginLeft = "4px";
        textSpan.textContent = displayLang.toUpperCase();
        container.appendChild(textSpan);
      }
    }
  } catch (error) {
    console.warn("Failed to get file icon:", error);
  }
}

/**
 * 코드 블록 구문 강조
 * @param {HTMLElement} codeElement - 코드 요소
 * @param {string|null} language - 언어
 */
export function highlightCodeBlock(codeElement, language) {
  if (!codeElement) return;

  const normalizedLang = normalizeLanguage(language);

  // hljs가 있으면 사용
  if (typeof hljs !== "undefined") {
    try {
      if (normalizedLang && hljs.getLanguage(normalizedLang)) {
        codeElement.classList.add(`language-${normalizedLang}`);
        hljs.highlightElement(codeElement);
      } else {
        // 자동 감지
        hljs.highlightElement(codeElement);
      }
    } catch (e) {
      console.warn("Syntax highlighting failed:", e);
    }
  }
}

/**
 * 코드 블록 UI 개선
 * @param {HTMLElement} contentElement - 콘텐츠 요소
 */
export function enhanceCodeBlocks(contentElement) {
  if (!contentElement) return;

  const preElements = contentElement.querySelectorAll("pre");

  preElements.forEach((preElement) => {
    // 이미 처리된 코드 블록은 스킵
    if (preElement.parentElement?.classList.contains("code-container")) {
      return;
    }

    const codeElement = preElement.querySelector("code");
    if (!codeElement) return;

    // 언어 추출
    let lang = "";
    const classNames = codeElement.className.split(" ");
    for (const className of classNames) {
      if (className.startsWith("language-")) {
        lang = className.replace("language-", "");
        break;
      } else if (className.startsWith("hljs-")) {
        continue;
      } else if (className && className !== "hljs") {
        lang = className;
        break;
      }
    }

    const codeContent = codeElement.textContent || "";

    // 코드 블록 컨테이너 생성
    const codeBlockContainer = document.createElement("div");
    codeBlockContainer.classList.add("code-block-container");

    // 코드 블록 헤더 생성
    const codeHeader = document.createElement("div");
    codeHeader.classList.add("code-block-header");

    // 접기/펼치기 버튼
    const toggleButton = document.createElement("span");
    toggleButton.classList.add("code-toggle-button");
    toggleButton.textContent = "▾";

    // 언어 라벨
    const languageLabel = document.createElement("span");
    languageLabel.classList.add("code-language");

    const displayLang = lang || "text";
    const headerDisplayText = displayLang.toUpperCase();
    const iconFilename = `file.${displayLang}`;

    loadFileIcon(iconFilename, languageLabel, headerDisplayText, 14);

    // 왼쪽 그룹 (토글 버튼 + 언어 라벨)
    const headerLeft = document.createElement("a");
    headerLeft.classList.add("code-header-left");
    headerLeft.title = "접기/펼치기";
    headerLeft.appendChild(toggleButton);
    headerLeft.appendChild(languageLabel);

    codeHeader.appendChild(headerLeft);

    // 코드 컨테이너 생성
    const codeContainer = document.createElement("div");
    codeContainer.classList.add("code-container");

    // 고유 ID 생성
    const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    codeBlockContainer.setAttribute("data-block-id", blockId);
    codeContainer.setAttribute("data-container-for", blockId);

    // 토글 링크 설정
    headerLeft.href = `codepilot://toggle?id=${blockId}`;
    codeHeader.style.cursor = "pointer";

    // 새 pre/code 요소 생성
    const newPreElement = document.createElement("pre");
    const newCodeElement = document.createElement("code");
    newCodeElement.textContent = codeContent;

    highlightCodeBlock(newCodeElement, lang || null);

    newPreElement.appendChild(newCodeElement);
    codeContainer.appendChild(newPreElement);

    codeBlockContainer.appendChild(codeHeader);
    codeBlockContainer.appendChild(codeContainer);

    // 기존 pre 요소를 새 컨테이너로 교체
    preElement.parentNode.replaceChild(codeBlockContainer, preElement);
  });
}

/**
 * 코드 블록 토글 (접기/펼치기)
 * @param {string} blockId - 블록 ID
 */
export function toggleCodeBlock(blockId) {
  const container = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!container) return;

  const codeContainer = container.querySelector(".code-container");
  const toggleButton = container.querySelector(".code-toggle-button");

  if (codeContainer && toggleButton) {
    const isCollapsed = codeContainer.classList.contains("collapsed");
    if (isCollapsed) {
      codeContainer.classList.remove("collapsed");
      toggleButton.textContent = "▾";
    } else {
      codeContainer.classList.add("collapsed");
      toggleButton.textContent = "▸";
    }
  }
}
