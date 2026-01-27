/**
 * Agent Policy Module
 * AgentPolicy XML 파일 관리 기능
 */

import { showStatus } from "./api-keys.js";

/**
 * AgentPolicy 파일 업로드 핸들러 설정
 * @param {Object} config - 설정 객체
 * @param {Object} vscode - VS Code API
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
        showStatus(
          statusElement,
          "Markdown 파일만 저장할 수 있습니다.",
          "error"
        );
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
        uploadButton.dataset.xmlContent = mdContent;
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
    const mdContent =
      uploadButton.dataset.mdContent || uploadButton.dataset.xmlContent;
    if (mdContent) {
      showStatus(statusElement, "저장 중...", "info");
      uploadButton.disabled = true;
      if (vscode) {
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
      if (confirm("정말로 이 파일을 삭제하시겠습니까?")) {
        showStatus(statusElement, "삭제 중...", "info");
        const deleteCommandMap = {
          "agent-policy-stable-version-input": "deleteAgentPolicyStableVersion",
          "agent-policy-coding-style-input": "deleteAgentPolicyCodingStyle",
          "agent-policy-project-architecture-input":
            "deleteAgentPolicyProjectArchitecture",
          "agent-policy-dependency-policy-input":
            "deleteAgentPolicyDependencyPolicy",
          "agent-policy-db-policy-input": "deleteAgentPolicyDbPolicy",
        };
        const deleteCommand = deleteCommandMap[inputId];
        if (deleteCommand && vscode) {
          vscode.postMessage({ command: deleteCommand });
        }
      }
    });
  }
}

/**
 * AgentPolicy 파일 로드
 * @param {Object} vscode - VS Code API
 */
export function loadAgentPolicyFiles(vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getAgentPolicyStableVersion" });
    vscode.postMessage({ command: "getAgentPolicyCodingStyle" });
    vscode.postMessage({ command: "getAgentPolicyProjectArchitecture" });
    vscode.postMessage({ command: "getAgentPolicyDependencyPolicy" });
    vscode.postMessage({ command: "getAgentPolicyDbPolicy" });
  }
}

/**
 * 모든 AgentPolicy 파일 업로드 설정
 * @param {Object} vscode - VS Code API
 */
export function setupAllAgentPolicyUploads(vscode) {
  const configs = [
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
  ];

  configs.forEach((config) => setupAgentPolicyFileUpload(config, vscode));
}
