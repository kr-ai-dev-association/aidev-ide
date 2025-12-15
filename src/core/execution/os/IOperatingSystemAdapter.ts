/**
 * OS별 추상화 인터페이스
 * 터미널, 파일 처리, 명령어 처리, API 호출 방식 등을 OS에 맞게 추상화
 */

export interface IOperatingSystemAdapter {
    /**
     * OS 식별자 (darwin, win32, linux)
     */
    readonly osType: 'darwin' | 'win32' | 'linux';

    /**
     * OS 이름 (macOS, Windows, Linux)
     */
    readonly osName: string;

    // ==================== 터미널 관련 ====================
    
    /**
     * 기본 셸 경로 반환
     */
    getDefaultShell(): string;

    /**
     * 셸 타입 반환 (bash, zsh, powershell, cmd)
     */
    getShellType(): 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh';

    /**
     * 명령어를 OS에 맞게 변환
     * @param command 원본 명령어
     * @returns OS에 맞게 변환된 명령어
     */
    normalizeCommand(command: string): string;

    /**
     * 환경 변수 설정 명령어 생성
     */
    getSetEnvCommand(key: string, value: string): string;

    /**
     * PATH 추가 명령어 생성
     */
    getAddPathCommand(path: string): string;

    /**
     * 프로세스 종료 명령어 생성
     */
    getKillProcessCommand(pid: number): string;

    /**
     * 포트 사용 중인 프로세스 찾기 명령어
     */
    getFindProcessByPortCommand(port: number): string;

    // ==================== 파일 처리 ====================

    /**
     * 경로 구분자 반환 (/ 또는 \)
     */
    getPathSeparator(): string;

    /**
     * 경로를 OS에 맞게 정규화
     */
    normalizePath(path: string): string;

    /**
     * 실행 파일 확장자 반환 (.exe, 없음)
     */
    getExecutableExtension(): string;

    /**
     * 파일 권한 설정 명령어 (chmod, icacls)
     */
    getChmodCommand(path: string, permissions: string): string;

    // ==================== 명령어 처리 ====================

    /**
     * npm 명령어를 OS에 맞게 변환
     */
    getNpmCommand(): string;

    /**
     * npx 명령어를 OS에 맞게 변환
     */
    getNpxCommand(): string;

    /**
     * Java 명령어를 OS에 맞게 변환
     */
    getJavaCommand(): string;

    /**
     * Maven 명령어를 OS에 맞게 변환
     */
    getMavenCommand(): string;

    /**
     * Gradle 명령어를 OS에 맞게 변환
     */
    getGradleCommand(): string;

    // ==================== API 호출 ====================

    /**
     * HTTP 클라이언트 옵션 반환 (프록시, 인증서 등)
     */
    getHttpClientOptions(): Record<string, any>;

    /**
     * OS별 임시 디렉토리 경로
     */
    getTempDirectory(): string;

    /**
     * OS별 홈 디렉토리 경로
     */
    getHomeDirectory(): string;

    // ==================== 프로세스 관리 ====================

    /**
     * 대화형 명령어 여부 판단
     */
    isInteractiveCommand(command: string): boolean;

    /**
     * 장기 실행 명령어 여부 판단
     */
    isLongRunningCommand(command: string): boolean;

    /**
     * 명령어 실행 시 필요한 셸 옵션
     */
    getShellExecutionOptions(): Record<string, any>;
}

/**
 * OS 감지 결과
 */
export interface OSDetectionResult {
    osType: 'darwin' | 'win32' | 'linux';
    osName: string;
    osVersion: string;
    architecture: string;
    shellType: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh';
    shellPath: string;
}

