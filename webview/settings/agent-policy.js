/**
 * Agent Policy Module
 * 에이전트 정책 파일 업로드 및 관리 관련 기능
 */

import { showStatus } from "./api-keys.js";

/**
 * 에이전트 정책 파일 업로드 설정
 * @param {Object} config - 설정 객체
 * @param {Object} vscode - vscode API 객체
 */
export function setupAgentPolicyFileUpload(config, vscode) {
  const {
    inputId,
    selectButtonId,
    uploadButtonId,
    deleteButtonId,
    statusId,
    fileNameId,
    uploadCommand,
  } = config;

  const { uploadCommand, category: configCategory } = config;
  const fileInput = document.getElementById(inputId);
  const selectButton = document.getElementById(selectButtonId);
  const uploadButton = document.getElementById(uploadButtonId);
  const deleteButton = document.getElementById(deleteButtonId);
  const statusElement = document.getElementById(statusId);
  const fileNameElement = document.getElementById(fileNameId);

  if (!fileInput || !selectButton || !uploadButton || !statusElement) {
    return;
  }

  // 파일 선택 버튼 클릭
  selectButton.addEventListener("click", () => {
    fileInput.click();
  });

  // 파일 선택 시
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith(".md") && !file.name.endsWith(".markdown")) {
        showStatus(statusElement, "Markdown 파일만 저장할 수 있습니다.", "error");
        fileInput.value = "";
        uploadButton.disabled = true;
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const mdContent = event.target.result;
        if (fileNameElement) {
          fileNameElement.textContent = `선택된 파일: ${file.name}`;
        }
        uploadButton.disabled = false;
        uploadButton.dataset.mdContent = mdContent;
        uploadButton.dataset.xmlContent = mdContent; // 호환성을 위해 xmlContent도 저장
        uploadButton.dataset.fileName = file.name; // 다중 파일 모드(global-rules)용
      };
      reader.onerror = () => {
        showStatus(statusElement, "파일 읽기 실패", "error");
        uploadButton.disabled = true;
      };
      reader.readAsText(file);
    }
  });

  // 저장 버튼 클릭
  uploadButton.addEventListener("click", () => {
    let mdContent =
      uploadButton.dataset.mdContent || uploadButton.dataset.xmlContent;
    if (mdContent && vscode) {
      // 카테고리의 타입 선택 정보 가져와서 frontmatter 주입
      const categoryMap = {
        "agent-policy-stable-version-input": "stable-version",
        "agent-policy-coding-style-input": "coding-style",
        "agent-policy-project-architecture-input": "project-architecture",
        "agent-policy-dependency-policy-input": "dependency-policy",
        "agent-policy-db-policy-input": "db-policy",
        "agent-policy-global-rules-input": "global-rules",
      };
      const category = configCategory || categoryMap[inputId];
      if (category) {
        const { type, description } = getPolicyTypeSelection(category);
        mdContent = injectFrontmatter(mdContent, type, description);
      }
      showStatus(statusElement, "저장 중...", "info");
      uploadButton.disabled = true;
      // addAgentPolicyFile 모드: 파일명과 함께 다중 파일 방식으로 전송
      if (uploadCommand === "addAgentPolicyFile" && category) {
        const fileName = uploadButton.dataset.fileName || "global-rules.md";
        const { type: policyType, description: skillDescription } = getPolicyTypeSelection(category);
        vscode.postMessage({
          command: "addAgentPolicyFile",
          category,
          fileName,
          content: mdContent,
          policyType,
          skillDescription,
        });
      } else {
        vscode.postMessage({
          command: uploadCommand,
          mdContent: mdContent,
          xmlContent: mdContent,
        });
      }
    }
  });

  // 삭제 버튼 클릭
  if (deleteButton) {
    deleteButton.addEventListener("click", () => {
      // VSCode webview에서 confirm()이 동작하지 않을 수 있으므로 바로 삭제
      showStatus(statusElement, "삭제 중...", "info");
      // 삭제 명령어 매핑
      const deleteCommandMap = {
        "agent-policy-stable-version-input": "deleteAgentPolicyStableVersion",
        "agent-policy-coding-style-input": "deleteAgentPolicyCodingStyle",
        "agent-policy-project-architecture-input":
          "deleteAgentPolicyProjectArchitecture",
        "agent-policy-dependency-policy-input":
          "deleteAgentPolicyDependencyPolicy",
        "agent-policy-db-policy-input": "deleteAgentPolicyDbPolicy",
        // global-rules는 개별 파일 삭제(deleteAgentPolicyFile)를 사용하므로 레거시 삭제 없음
      };
      const deleteCommand = deleteCommandMap[inputId];
      if (deleteCommand && vscode) {
        vscode.postMessage({ command: deleteCommand });
      }
    });
  }
}

/**
 * 카테고리별 선택된 타입/설명 조회
 * @param {string} category - 카테고리 (예: 'stable-version')
 * @returns {{ type: string, description: string }}
 */
function getPolicyTypeSelection(category) {
  const selector = document.querySelector(`.policy-type-selector[data-category="${category}"]`);
  if (!selector) return { type: 'rule', description: '' };
  const activeBtn = selector.querySelector('.policy-type-btn.active');
  const descInput = selector.querySelector('.policy-skill-desc');
  return {
    type: activeBtn ? activeBtn.dataset.type : 'rule',
    description: descInput ? descInput.value.trim() : '',
  };
}

/**
 * Markdown 내용에 frontmatter를 주입
 * @param {string} content - 원본 Markdown 내용
 * @param {string} type - 'rule' 또는 'skill'
 * @param {string} description - 스킬 설명 (skill일 때만)
 * @returns {string} frontmatter가 포함된 내용
 */
function injectFrontmatter(content, type, description) {
  // 이미 frontmatter가 있으면 type/description만 업데이트
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    let fm = fmMatch[1];
    // type 교체 또는 추가
    if (/^type:\s*.+$/m.test(fm)) {
      fm = fm.replace(/^type:\s*.+$/m, `type: ${type}`);
    } else {
      fm += `\ntype: ${type}`;
    }
    // description 교체 또는 추가/제거
    if (type === 'skill' && description) {
      if (/^description:\s*.+$/m.test(fm)) {
        fm = fm.replace(/^description:\s*.+$/m, `description: "${description}"`);
      } else {
        fm += `\ndescription: "${description}"`;
      }
    } else {
      fm = fm.replace(/\n?^description:\s*.+$/m, '');
    }
    return content.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${fm.trim()}\n---`);
  }
  // frontmatter 새로 생성
  let fm = `type: ${type}`;
  if (type === 'skill' && description) {
    fm += `\ndescription: "${description}"`;
  }
  return `---\n${fm}\n---\n${content}`;
}

/**
 * 타입 선택 토글 초기화
 */
export function initPolicyTypeSelectors() {
  document.querySelectorAll('.policy-type-selector').forEach((selector) => {
    const buttons = selector.querySelectorAll('.policy-type-btn');
    const descInput = selector.querySelector('.policy-skill-desc');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--vscode-foreground)';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--vscode-button-background)';
        btn.style.color = 'var(--vscode-button-foreground)';

        if (descInput) {
          descInput.style.display = btn.dataset.type === 'skill' ? 'block' : 'none';
        }
      });
    });
  });
}

/**
 * 모든 에이전트 정책 파일 업로드 설정 초기화
 * @param {Object} vscode - vscode API 객체
 */
export function initAgentPolicyUploads(vscode) {
  const policyConfigs = [
    {
      inputId: "agent-policy-stable-version-input",
      selectButtonId: "select-stable-version-button",
      uploadButtonId: "upload-stable-version-button",
      deleteButtonId: "delete-stable-version-button",
      statusId: "stable-version-status",
      fileNameId: "stable-version-file-name",
      uploadCommand: "uploadAgentPolicyStableVersion",
    },
    {
      inputId: "agent-policy-coding-style-input",
      selectButtonId: "select-coding-style-button",
      uploadButtonId: "upload-coding-style-button",
      deleteButtonId: "delete-coding-style-button",
      statusId: "coding-style-status",
      fileNameId: "coding-style-file-name",
      uploadCommand: "uploadAgentPolicyCodingStyle",
    },
    {
      inputId: "agent-policy-project-architecture-input",
      selectButtonId: "select-project-architecture-button",
      uploadButtonId: "upload-project-architecture-button",
      deleteButtonId: "delete-project-architecture-button",
      statusId: "project-architecture-status",
      fileNameId: "project-architecture-file-name",
      uploadCommand: "uploadAgentPolicyProjectArchitecture",
    },
    {
      inputId: "agent-policy-dependency-policy-input",
      selectButtonId: "select-dependency-policy-button",
      uploadButtonId: "upload-dependency-policy-button",
      deleteButtonId: "delete-dependency-policy-button",
      statusId: "dependency-policy-status",
      fileNameId: "dependency-policy-file-name",
      uploadCommand: "uploadAgentPolicyDependencyPolicy",
    },
    {
      inputId: "agent-policy-db-policy-input",
      selectButtonId: "select-db-policy-button",
      uploadButtonId: "upload-db-policy-button",
      deleteButtonId: "delete-db-policy-button",
      statusId: "db-policy-status",
      fileNameId: "db-policy-file-name",
      uploadCommand: "uploadAgentPolicyDbPolicy",
    },
    {
      inputId: "agent-policy-global-rules-input",
      selectButtonId: "select-global-rules-button",
      uploadButtonId: "upload-global-rules-button",
      statusId: "global-rules-status",
      fileNameId: "global-rules-file-name",
      uploadCommand: "addAgentPolicyFile",  // 글로벌은 다중 파일 방식 사용
      category: "global-rules",
    },
  ];

  policyConfigs.forEach((config) => {
    setupAgentPolicyFileUpload(config, vscode);
  });

  // 경로 입력 버튼 설정
  const pathConfigs = [
    { category: "stable-version", pathInputId: "path-stable-version-input", buttonId: "add-path-stable-version-button", statusId: "stable-version-status" },
    { category: "coding-style", pathInputId: "path-coding-style-input", buttonId: "add-path-coding-style-button", statusId: "coding-style-status" },
    { category: "project-architecture", pathInputId: "path-project-architecture-input", buttonId: "add-path-project-architecture-button", statusId: "project-architecture-status" },
    { category: "dependency-policy", pathInputId: "path-dependency-policy-input", buttonId: "add-path-dependency-policy-button", statusId: "dependency-policy-status" },
    { category: "db-policy", pathInputId: "path-db-policy-input", buttonId: "add-path-db-policy-button", statusId: "db-policy-status" },
    { category: "global-rules", pathInputId: "path-global-rules-input", buttonId: "add-path-global-rules-button", statusId: "global-rules-status" },
  ];
  pathConfigs.forEach(({ category, pathInputId, buttonId, statusId }) => {
    setupAgentPolicyPathInput({ category, pathInputId, buttonId, statusId }, vscode);
  });
}

/**
 * 경로 입력으로 에이전트 정책 파일 추가 설정
 * @param {Object} config - 설정 객체
 * @param {Object} vscode - vscode API 객체
 */
export function setupAgentPolicyPathInput(config, vscode) {
  const { category, pathInputId, buttonId, statusId } = config;
  const pathInput = document.getElementById(pathInputId);
  const addButton = document.getElementById(buttonId);
  const statusElement = document.getElementById(statusId);

  if (!pathInput || !addButton) return;

  addButton.addEventListener("click", () => {
    const filePath = pathInput.value.trim();
    if (!filePath) {
      if (statusElement) showStatus(statusElement, "파일 경로를 입력하세요.", "error");
      return;
    }
    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
      if (statusElement) showStatus(statusElement, "Markdown 파일(.md)만 추가할 수 있습니다.", "error");
      return;
    }
    if (statusElement) showStatus(statusElement, "추가 중...", "info");
    addButton.disabled = true;
    const { type: policyType, description: skillDescription } = getPolicyTypeSelection(category);
    if (vscode) {
      vscode.postMessage({ command: "addPathAgentPolicy", category, filePath, policyType, skillDescription });
    }
  });

  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addButton.click();
  });
}

/**
 * 경로 추가 결과 처리
 * @param {string} category - 정책 카테고리
 * @param {boolean} success - 성공 여부
 * @param {string} message - 결과 메시지
 */
export function handleAgentPolicyPathAddResult(category, success, message) {
  const statusMap = {
    "stable-version": "stable-version-status",
    "coding-style": "coding-style-status",
    "project-architecture": "project-architecture-status",
    "dependency-policy": "dependency-policy-status",
    "db-policy": "db-policy-status",
    "global-rules": "global-rules-status",
  };
  const pathInputMap = {
    "stable-version": "path-stable-version-input",
    "coding-style": "path-coding-style-input",
    "project-architecture": "path-project-architecture-input",
    "dependency-policy": "path-dependency-policy-input",
    "db-policy": "path-db-policy-input",
    "global-rules": "path-global-rules-input",
  };
  const buttonMap = {
    "stable-version": "add-path-stable-version-button",
    "coding-style": "add-path-coding-style-button",
    "project-architecture": "add-path-project-architecture-button",
    "dependency-policy": "add-path-dependency-policy-button",
    "db-policy": "add-path-db-policy-button",
    "global-rules": "add-path-global-rules-button",
  };

  const statusElement = document.getElementById(statusMap[category]);
  const pathInput = document.getElementById(pathInputMap[category]);
  const addButton = document.getElementById(buttonMap[category]);

  if (addButton) addButton.disabled = false;

  if (success) {
    if (statusElement) showStatus(statusElement, message || "추가되었습니다.", "success");
    if (pathInput) pathInput.value = "";
  } else {
    if (statusElement) showStatus(statusElement, message || "추가 실패", "error");
  }
}

/**
 * 에이전트 정책 파일 로드 요청
 * @param {Object} vscode - vscode API 객체
 */
export function loadAgentPolicyFiles(vscode) {
  if (!vscode) return;

  vscode.postMessage({ command: "getAgentPolicyStableVersion" });
  vscode.postMessage({ command: "getAgentPolicyCodingStyle" });
  vscode.postMessage({ command: "getAgentPolicyProjectArchitecture" });
  vscode.postMessage({ command: "getAgentPolicyDependencyPolicy" });
  vscode.postMessage({ command: "getAgentPolicyDbPolicy" });
}

/**
 * 에이전트 정책 저장 결과 처리
 * @param {string} policyType - 정책 타입 ('stableVersion', 'codingStyle', 등)
 * @param {boolean} success - 성공 여부
 * @param {string} message - 결과 메시지
 */
export function handleAgentPolicySaveResult(policyType, success, message) {
  const statusMap = {
    stableVersion: "stable-version-status",
    codingStyle: "coding-style-status",
    projectArchitecture: "project-architecture-status",
    dependencyPolicy: "dependency-policy-status",
    dbPolicy: "db-policy-status",
  };

  const inputMap = {
    stableVersion: "agent-policy-stable-version-input",
    codingStyle: "agent-policy-coding-style-input",
    projectArchitecture: "agent-policy-project-architecture-input",
    dependencyPolicy: "agent-policy-dependency-policy-input",
    dbPolicy: "agent-policy-db-policy-input",
  };

  const uploadButtonMap = {
    stableVersion: "upload-stable-version-button",
    codingStyle: "upload-coding-style-button",
    projectArchitecture: "upload-project-architecture-button",
    dependencyPolicy: "upload-dependency-policy-button",
    dbPolicy: "upload-db-policy-button",
  };

  const deleteButtonMap = {
    stableVersion: "delete-stable-version-button",
    codingStyle: "delete-coding-style-button",
    projectArchitecture: "delete-project-architecture-button",
    dependencyPolicy: "delete-dependency-policy-button",
    dbPolicy: "delete-db-policy-button",
  };

  const fileNameMap = {
    stableVersion: "stable-version-file-name",
    codingStyle: "coding-style-file-name",
    projectArchitecture: "project-architecture-file-name",
    dependencyPolicy: "dependency-policy-file-name",
    dbPolicy: "db-policy-file-name",
  };

  const statusElement = document.getElementById(statusMap[policyType]);
  const inputElement = document.getElementById(inputMap[policyType]);
  const uploadButton = document.getElementById(uploadButtonMap[policyType]);
  const deleteButton = document.getElementById(deleteButtonMap[policyType]);
  const fileNameElement = document.getElementById(fileNameMap[policyType]);

  if (success) {
    showStatus(statusElement, message || "저장되었습니다.", "success");

    if (inputElement) {
      inputElement.value = "";
    }
    if (uploadButton) {
      uploadButton.disabled = true;
      delete uploadButton.dataset.mdContent;
      delete uploadButton.dataset.xmlContent;
    }
    if (deleteButton) {
      deleteButton.style.display = "inline-block";
    }
    if (fileNameElement) {
      fileNameElement.textContent = "파일이 저장되었습니다.";
    }
  } else {
    showStatus(statusElement, message || "저장 실패", "error");
    if (uploadButton) {
      uploadButton.disabled = false;
    }
  }
}

/**
 * 에이전트 정책 삭제 결과 처리
 * @param {string} policyType - 정책 타입
 * @param {boolean} success - 성공 여부
 * @param {string} message - 결과 메시지
 */
export function handleAgentPolicyDeleteResult(policyType, success, message) {
  const statusMap = {
    stableVersion: "stable-version-status",
    codingStyle: "coding-style-status",
    projectArchitecture: "project-architecture-status",
    dependencyPolicy: "dependency-policy-status",
    dbPolicy: "db-policy-status",
  };

  const deleteButtonMap = {
    stableVersion: "delete-stable-version-button",
    codingStyle: "delete-coding-style-button",
    projectArchitecture: "delete-project-architecture-button",
    dependencyPolicy: "delete-dependency-policy-button",
    dbPolicy: "delete-db-policy-button",
  };

  const fileNameMap = {
    stableVersion: "stable-version-file-name",
    codingStyle: "coding-style-file-name",
    projectArchitecture: "project-architecture-file-name",
    dependencyPolicy: "dependency-policy-file-name",
    dbPolicy: "db-policy-file-name",
  };

  const statusElement = document.getElementById(statusMap[policyType]);
  const deleteButton = document.getElementById(deleteButtonMap[policyType]);
  const fileNameElement = document.getElementById(fileNameMap[policyType]);

  if (success) {
    showStatus(statusElement, message || "삭제되었습니다.", "success");
    if (deleteButton) {
      deleteButton.style.display = "none";
    }
    if (fileNameElement) {
      fileNameElement.textContent = "";
    }
  } else {
    showStatus(statusElement, message || "삭제 실패", "error");
  }
}

/**
 * 에이전트 정책 로드 결과 처리
 * @param {string} policyType - 정책 타입
 * @param {boolean} exists - 파일 존재 여부
 * @param {string} fileName - 파일 이름
 */
export function handleAgentPolicyLoadResult(policyType, exists, fileName) {
  const deleteButtonMap = {
    stableVersion: "delete-stable-version-button",
    codingStyle: "delete-coding-style-button",
    projectArchitecture: "delete-project-architecture-button",
    dependencyPolicy: "delete-dependency-policy-button",
    dbPolicy: "delete-db-policy-button",
  };

  const fileNameMap = {
    stableVersion: "stable-version-file-name",
    codingStyle: "coding-style-file-name",
    projectArchitecture: "project-architecture-file-name",
    dependencyPolicy: "dependency-policy-file-name",
    dbPolicy: "db-policy-file-name",
  };

  const deleteButton = document.getElementById(deleteButtonMap[policyType]);
  const fileNameElement = document.getElementById(fileNameMap[policyType]);

  if (exists) {
    if (deleteButton) {
      deleteButton.style.display = "inline-block";
    }
    if (fileNameElement) {
      fileNameElement.textContent = fileName || "파일이 저장되어 있습니다.";
    }
  } else {
    if (deleteButton) {
      deleteButton.style.display = "none";
    }
    if (fileNameElement) {
      fileNameElement.textContent = "";
    }
  }
}
