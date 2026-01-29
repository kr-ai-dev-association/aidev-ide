/**
 * Markdown Configuration
 * markdown-it 설정 및 플러그인
 */

import markdownit from "markdown-it";
import markdownitContainer from "markdown-it-container";

/**
 * markdown-it 인스턴스 생성 및 설정
 * @returns {Object} 설정된 markdown-it 인스턴스
 */
export function createMarkdownRenderer() {
  const md = markdownit({
    html: false,
    linkify: true,
    typographer: true,
  });

  // Container 플러그인 추가 (callout 지원)
  md.use(markdownitContainer, "text", {
    validate: function (params) {
      return params.trim().match(/^text\s+(.*)$/);
    },
    render: function (tokens, idx) {
      const m = tokens[idx].info.trim().match(/^text\s+(.*)$/);
      if (tokens[idx].nesting === 1) {
        // opening tag
        return `<div class="callout callout-text">\n`;
      } else {
        // closing tag
        return `</div>\n`;
      }
    },
  });

  return md;
}
