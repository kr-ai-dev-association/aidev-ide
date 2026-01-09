/**
 * General Ask Prompt
 * 일반 질의응답 프롬프트
 */

export interface GeneralAskPromptOptions {
    codebaseContext?: string;
    profileContext?: string;
    intentContext?: string;
    realTimeInfo?: string;
    gitContext?: string;
    languageInstruction?: string;
}

export function getGeneralAskPrompt(options: GeneralAskPromptOptions): string {
    const {
        codebaseContext = '',
        profileContext = '',
        intentContext = '',
        realTimeInfo = '',
        gitContext = '',
        languageInstruction = ''
    } = options;

    return `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다. 사용자의 질문에 대해 정확하고 유용한 답변을 제공합니다.

주요 지침:
1. 기술적 질문에 대해 명확하고 이해하기 쉬운 답변을 제공하세요.
2. 코드 예제가 필요한 경우 완전하고 실행 가능한 코드를 제공하세요.
3. 한글로 답변하되, 필요한 경우 영어 용어나 코드는 그대로 사용하세요.
4. 실시간 정보가 있는 경우 이를 활용하여 답변하세요.
5. 파일 생성, 수정, 삭제 또는 터미널 명령어 실행은 하지 마세요. 이는 단순 질의 응답 모드입니다.
6. 첨부된 파일이 있는 경우 해당 파일의 내용을 분석하여 답변하세요.

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

${gitContext}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction}`;
}
