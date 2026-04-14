/**
 * Code Block UI Utilities
 * 코드 블록 UI 관련 함수 모음
 */

import { getIcon } from "@peoplesgrocers/seti-ui-file-icons";
import { highlightCodeBlock } from "./utils.js";

/**
 * 파일 아이콘 로드
 * @param {string} filename - 파일명
 * @param {HTMLElement} container - 아이콘을 삽입할 컨테이너 요소
 * @param {string} displayLang - 표시할 언어명 (코드 블록 헤더용, 선택사항)
 * @param {number} iconSize - 아이콘 크기 (px, 기본값: 18)
 */
export function loadFileIcon(filename, container, displayLang, iconSize = 18) {
  // displayLang이 있으면 텍스트도 표시 (코드 블록 헤더용)
  if (displayLang) {
    container.textContent = displayLang.toUpperCase();
  } else {
    // displayLang이 없으면 빈 상태로 시작 (파일 리스트용)
    container.textContent = "";
  }

  // 아이콘 가져오기
  try {
    const iconData = getIcon(filename);
    if (iconData && iconData.svg) {
      // 기존 텍스트 제거
      container.textContent = "";

      // SVG를 안전하게 삽입
      const iconContainer = document.createElement("span");
      // 컨테이너 크기를 확실히 고정
      iconContainer.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: ${iconSize}px;
                height: ${iconSize}px;
                flex-shrink: 0;
                vertical-align: middle;
            `;
      // SVG sanitize를 건너뛰고 직접 삽입 (seti-icons는 신뢰할 수 있는 소스)
      iconContainer.innerHTML = iconData.svg;

      // 색상 및 크기 적용
      const svgElement = iconContainer.querySelector("svg");
      if (svgElement) {
        // 1. 색상 적용
        if (iconData.color) {
          svgElement.setAttribute("fill", iconData.color);
        }

        // 2. 핵심: 기존 width/height 속성을 제거하거나 100%로 변경
        // 이렇게 해야 viewBox 설정에 따라 아이콘이 부모 크기에 맞춰 리사이징됩니다.
        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");

        // 3. 스타일로 크기 제어
        svgElement.style.cssText = `
                    width: 100%;
                    height: 100%;
                    display: block;
                `;
      }

      container.appendChild(iconContainer);

      // displayLang이 있으면 텍스트도 함께 표시 (코드 블록 헤더용)
      if (displayLang) {
        const textSpan = document.createElement("span");
        textSpan.style.marginLeft = "4px"; // 텍스트와 간격 조정
        textSpan.textContent = displayLang.toUpperCase();
        container.appendChild(textSpan);
      }
    }
  } catch (error) {
    console.warn("Failed to get file icon:", error);
    // 에러 발생 시 텍스트만 표시 (이미 설정됨)
  }
}

/**
 * 🔥 스트리밍 완료 후 코드 블록 UI 개선
 * displayAgentGoCoderMessage()와 동일한 UI로 코드 블록을 재렌더링
 * 단, Keep/Undo 버튼은 제외 (요약의 예시 코드에는 필요 없음)
 *
 * 기능:
 * - 접기/펼치기 버튼
 * - 언어 라벨
 * - 파일 아이콘
 * (Keep/Undo 버튼은 제외 - 요약의 예시 코드에는 필요 없음)
 * @param {HTMLElement} contentElement - 콘텐츠 요소
 */
export function enhanceCodeBlocks(contentElement) {
  // 마크다운 렌더링된 코드 블록 찾기 (<pre><code>)
  const preElements = contentElement.querySelectorAll("pre");

  preElements.forEach((preElement) => {
    // 이미 처리된 코드 블록은 스킵 (code-block-container로 감싸진 경우)
    if (preElement.parentElement?.classList.contains("code-container")) {
      return;
    }

    const codeElement = preElement.querySelector("code");
    if (!codeElement) {
      return;
    }

    // 언어 추출 (class="language-xxx" 또는 hljs의 data-highlighted)
    let lang = "";
    const classNames = codeElement.className.split(" ");
    for (const className of classNames) {
      if (className.startsWith("language-")) {
        lang = className.replace("language-", "");
        break;
      } else if (className.startsWith("hljs-")) {
        continue; // hljs 스타일 클래스는 스킵
      } else if (className && className !== "hljs") {
        lang = className;
        break;
      }
    }

    // 코드 내용
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

    // 파일 아이콘 로드
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

    // 고유 ID 생성 (토글용)
    const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    codeBlockContainer.setAttribute("data-block-id", blockId);
    codeContainer.setAttribute("data-container-for", blockId);

    // 토글 링크 설정
    headerLeft.href = `agentgocoder://toggle?id=${blockId}`;

    // 커서 스타일
    codeHeader.style.cursor = "pointer";

    // 새 pre/code 요소 생성 (기존 것 복제)
    const newPreElement = document.createElement("pre");
    const newCodeElement = document.createElement("code");
    newCodeElement.textContent = codeContent;

    // 동적 구문 강조 적용
    highlightCodeBlock(newCodeElement, lang || null);

    newPreElement.appendChild(newCodeElement);
    codeContainer.appendChild(newPreElement);

    // 코드 블록 컨테이너에 헤더와 코드 추가
    codeBlockContainer.appendChild(codeHeader);
    codeBlockContainer.appendChild(codeContainer);

    // 기존 pre 요소를 새 컨테이너로 교체
    preElement.parentNode.replaceChild(codeBlockContainer, preElement);
  });
}
