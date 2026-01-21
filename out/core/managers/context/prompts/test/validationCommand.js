"use strict";
/**
 * Validation Command Prompt
 * LLM을 사용하여 검증 명령어를 추론하는 프롬프트
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidationCommandPrompt = getValidationCommandPrompt;
function getValidationCommandPrompt(options) {
    const { projectType, workspaceRoot, createdFiles, modifiedFiles } = options;
    const fileList = [...createdFiles, ...modifiedFiles].slice(0, 10).join(', ');
    return `다음 프로젝트에 대한 검증 명령어를 추론하세요.

프로젝트 타입: ${projectType}
프로젝트 루트: ${workspaceRoot}
생성/수정된 파일: ${fileList || '없음'}

규칙 기반으로 결정할 수 없는 검증 명령어를 추론해야 합니다.
프로젝트 타입과 파일 정보를 바탕으로 적절한 검증 명령어(컴파일, 빌드, 린트 등)를 제안하세요.

JSON 형식으로 응답하세요:
{
  "command": "실행할 명령어 (예: npm run build, mvn compile, python -m pytest 등)",
  "description": "검증 설명 (예: Node.js 빌드 검사, Python 테스트 실행 등)"
}

중요: 명령어는 실제로 실행 가능해야 하며, 프로젝트 타입에 맞는 검증 도구를 사용해야 합니다.`;
}
//# sourceMappingURL=validationCommand.js.map