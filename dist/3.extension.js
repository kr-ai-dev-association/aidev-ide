"use strict";
exports.id = 3;
exports.ids = [3];
exports.modules = {

/***/ 296:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OllamaBlockerService = void 0;
const path = __importStar(__webpack_require__(9));
const fs = __importStar(__webpack_require__(12));
const os = __importStar(__webpack_require__(35));
const child_process_1 = __webpack_require__(31);
const util_1 = __webpack_require__(53);
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class OllamaBlockerService {
    static instance;
    extensionContext;
    blockerProcess = null;
    constructor(context) {
        this.extensionContext = context;
    }
    static getInstance(context) {
        if (!OllamaBlockerService.instance) {
            OllamaBlockerService.instance = new OllamaBlockerService(context);
        }
        return OllamaBlockerService.instance;
    }
    /**
     * ollama-blocker 바이너리 경로 반환
     */
    getBlockerPath() {
        // 디버그 모드에서는 현재 프로젝트의 ollama-blocker 디렉토리 사용
        const debugPath = path.join(this.extensionContext.extensionPath, '..', 'ollama-blocker', 'ollama-blocker-embedded');
        const releasePath = path.join(this.extensionContext.extensionPath, 'assets', 'ollama-blocker', 'ollama-blocker-embedded');
        // console.log('ollama-blocker 디버그 경로:', debugPath);
        // console.log('ollama-blocker 릴리스 경로:', releasePath);
        // console.log('extensionPath:', this.extensionContext.extensionPath);
        // 디버그 모드 파일이 존재하는지 확인
        if (fs.existsSync(debugPath)) {
            console.log('디버그 모드 ollama-blocker 사용');
            return debugPath;
        }
        // 릴리스 모드 파일이 존재하는지 확인
        if (fs.existsSync(releasePath)) {
            // console.log('릴리스 모드 ollama-blocker 사용');
            return releasePath;
        }
        // 기본적으로 릴리스 경로 반환 (에러 메시지용)
        console.log('ollama-blocker 파일을 찾을 수 없음, 릴리스 경로 반환');
        return releasePath;
    }
    /**
     * 서비스 계정 키 파일 경로 반환
     */
    getServiceAccountKeyPath() {
        // 디버그 모드에서는 현재 프로젝트의 ollama-blocker 디렉토리 사용
        const debugPath = path.join(this.extensionContext.extensionPath, '..', 'ollama-blocker', 'service-account-key.json');
        const releasePath = path.join(this.extensionContext.extensionPath, 'assets', 'ollama-blocker', 'service-account-key.json');
        // console.log('서비스 계정 키 디버그 경로:', debugPath);
        // console.log('서비스 계정 키 릴리스 경로:', releasePath);
        // 디버그 모드 파일이 존재하는지 확인
        if (fs.existsSync(debugPath)) {
            console.log('디버그 모드 서비스 계정 키 사용');
            return debugPath;
        }
        // 릴리스 모드 파일이 존재하는지 확인
        if (fs.existsSync(releasePath)) {
            // console.log('릴리스 모드 서비스 계정 키 사용');
            return releasePath;
        }
        // 기본적으로 릴리스 경로 반환 (에러 메시지용)
        console.log('서비스 계정 키 파일을 찾을 수 없음, 릴리스 경로 반환');
        return releasePath;
    }
    /**
     * ollama-blocker가 설치되어 있는지 확인
     */
    async isInstalled() {
        try {
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            return fs.existsSync(blockerPath) && fs.existsSync(keyPath);
        }
        catch (error) {
            console.error('ollama-blocker 설치 확인 중 오류:', error);
            return false;
        }
    }
    /**
     * ollama-blocker 설치
     */
    async install() {
        try {
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            // 파일 존재 확인
            if (!fs.existsSync(blockerPath)) {
                return {
                    success: false,
                    message: 'ollama-blocker 바이너리를 찾을 수 없습니다.'
                };
            }
            if (!fs.existsSync(keyPath)) {
                return {
                    success: false,
                    message: '서비스 계정 키 파일을 찾을 수 없습니다.'
                };
            }
            // 실행 권한 설정
            await execAsync(`chmod +x "${blockerPath}"`);
            return {
                success: true,
                message: 'ollama-blocker가 성공적으로 설치되었습니다.'
            };
        }
        catch (error) {
            console.error('ollama-blocker 설치 중 오류:', error);
            return {
                success: false,
                message: `ollama-blocker 설치 실패: ${error}`
            };
        }
    }
    /**
     * ollama-blocker 시작
     */
    async start() {
        try {
            console.log('[OllamaBlockerService] start() 메서드 호출됨');
            if (this.blockerProcess) {
                console.log('[OllamaBlockerService] 이미 실행 중인 프로세스가 있음');
                return {
                    success: false,
                    message: 'ollama-blocker가 이미 실행 중입니다.'
                };
            }
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            console.log('[OllamaBlockerService] blockerPath:', blockerPath);
            console.log('[OllamaBlockerService] keyPath:', keyPath);
            // 파일 존재 여부 확인
            if (!fs.existsSync(blockerPath)) {
                console.error('[OllamaBlockerService] blockerPath 파일이 존재하지 않음:', blockerPath);
                return {
                    success: false,
                    message: `ollama-blocker 바이너리를 찾을 수 없습니다: ${blockerPath}`
                };
            }
            if (!fs.existsSync(keyPath)) {
                console.error('[OllamaBlockerService] keyPath 파일이 존재하지 않음:', keyPath);
                return {
                    success: false,
                    message: `서비스 계정 키 파일을 찾을 수 없습니다: ${keyPath}`
                };
            }
            // 서비스 계정 키 파일을 임시 디렉토리에 복사
            const tempDir = os.tmpdir();
            const targetKeyPath = path.join(tempDir, 'service-account-key.json');
            console.log('[OllamaBlockerService] tempDir:', tempDir);
            console.log('[OllamaBlockerService] targetKeyPath:', targetKeyPath);
            if (fs.existsSync(targetKeyPath)) {
                fs.unlinkSync(targetKeyPath);
            }
            fs.copyFileSync(keyPath, targetKeyPath);
            console.log('[OllamaBlockerService] 서비스 계정 키 파일 복사 완료');
            // ollama-blocker 시작 (작업 디렉토리를 임시 디렉토리로 설정)
            const command = `"${blockerPath}" start`;
            console.log('[OllamaBlockerService] 실행 명령어:', command);
            console.log('[OllamaBlockerService] 작업 디렉토리:', tempDir);
            this.blockerProcess = (0, child_process_1.exec)(command, { cwd: tempDir }, (error, stdout, stderr) => {
                console.log('[OllamaBlockerService] exec 콜백 호출됨');
                if (error) {
                    console.error('[OllamaBlockerService] ollama-blocker 실행 오류:', error);
                }
                if (stderr) {
                    console.error('[OllamaBlockerService] ollama-blocker stderr:', stderr);
                }
                if (stdout) {
                    console.log('[OllamaBlockerService] ollama-blocker stdout:', stdout);
                }
            });
            console.log('[OllamaBlockerService] ollama-blocker 프로세스 시작됨, PID:', this.blockerProcess.pid);
            return {
                success: true,
                message: 'ollama-blocker가 시작되었습니다.'
            };
        }
        catch (error) {
            console.error('[OllamaBlockerService] ollama-blocker 시작 중 오류:', error);
            return {
                success: false,
                message: `ollama-blocker 시작 실패: ${error}`
            };
        }
    }
    /**
     * ollama-blocker 중지
     */
    async stop() {
        try {
            if (!this.blockerProcess) {
                return {
                    success: false,
                    message: 'ollama-blocker가 실행 중이 아닙니다.'
                };
            }
            this.blockerProcess.kill();
            this.blockerProcess = null;
            return {
                success: true,
                message: 'ollama-blocker가 중지되었습니다.'
            };
        }
        catch (error) {
            console.error('ollama-blocker 중지 중 오류:', error);
            return {
                success: false,
                message: `ollama-blocker 중지 실패: ${error}`
            };
        }
    }
    /**
     * ollama-blocker 상태 확인
     */
    async getStatus() {
        try {
            console.log('[OllamaBlockerService] getStatus() 메서드 호출됨');
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            console.log('[OllamaBlockerService] getStatus - blockerPath:', blockerPath);
            console.log('[OllamaBlockerService] getStatus - keyPath:', keyPath);
            if (!fs.existsSync(blockerPath)) {
                console.log('[OllamaBlockerService] getStatus - blockerPath 파일이 존재하지 않음');
                return {
                    running: false,
                    message: 'ollama-blocker가 설치되지 않았습니다.'
                };
            }
            if (!fs.existsSync(keyPath)) {
                console.log('[OllamaBlockerService] getStatus - keyPath 파일이 존재하지 않음');
                return {
                    running: false,
                    message: '서비스 계정 키 파일을 찾을 수 없습니다.'
                };
            }
            // 서비스 계정 키 파일을 임시 디렉토리에 복사
            const tempDir = os.tmpdir();
            const targetKeyPath = path.join(tempDir, 'service-account-key.json');
            console.log('[OllamaBlockerService] getStatus - tempDir:', tempDir);
            console.log('[OllamaBlockerService] getStatus - targetKeyPath:', targetKeyPath);
            if (fs.existsSync(targetKeyPath)) {
                fs.unlinkSync(targetKeyPath);
            }
            fs.copyFileSync(keyPath, targetKeyPath);
            console.log('[OllamaBlockerService] getStatus - 서비스 계정 키 파일 복사 완료');
            console.log('[OllamaBlockerService] getStatus - blockerProcess 상태:', this.blockerProcess !== null);
            console.log('[OllamaBlockerService] getStatus - blockerProcess PID:', this.blockerProcess?.pid);
            const command = `"${blockerPath}" status`;
            console.log('[OllamaBlockerService] getStatus - 실행 명령어:', command);
            console.log('[OllamaBlockerService] getStatus - 작업 디렉토리:', tempDir);
            const { stdout } = await execAsync(command, { cwd: tempDir });
            console.log('[OllamaBlockerService] getStatus - stdout:', stdout);
            return {
                running: this.blockerProcess !== null,
                message: stdout || '상태 확인 완료'
            };
        }
        catch (error) {
            console.error('[OllamaBlockerService] ollama-blocker 상태 확인 중 오류:', error);
            return {
                running: false,
                message: `상태 확인 실패: ${error}`
            };
        }
    }
    /**
     * 시리얼 번호로 인증
     */
    async authenticate(serialNumber) {
        try {
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            if (!fs.existsSync(blockerPath)) {
                return {
                    success: false,
                    message: 'ollama-blocker가 설치되지 않았습니다.'
                };
            }
            if (!fs.existsSync(keyPath)) {
                return {
                    success: false,
                    message: '서비스 계정 키 파일을 찾을 수 없습니다.'
                };
            }
            // 서비스 계정 키 파일을 임시 디렉토리에 복사
            const tempDir = os.tmpdir();
            const targetKeyPath = path.join(tempDir, 'service-account-key.json');
            if (fs.existsSync(targetKeyPath)) {
                fs.unlinkSync(targetKeyPath);
            }
            fs.copyFileSync(keyPath, targetKeyPath);
            const { stdout, stderr } = await execAsync(`"${blockerPath}" auth "${serialNumber}"`, { cwd: tempDir });
            if (stderr && stderr.includes('Authentication failed')) {
                return {
                    success: false,
                    message: '인증 실패: 잘못된 시리얼 번호입니다.'
                };
            }
            // 인증 성공 시 ollama-blocker 프로세스 중지
            if (this.blockerProcess) {
                console.log('[OllamaBlockerService] ollama-blocker 인증 성공, 프로세스 중지');
                this.blockerProcess = null;
            }
            return {
                success: true,
                message: '인증 성공: Ollama가 시작되었습니다.'
            };
        }
        catch (error) {
            console.error('ollama-blocker 인증 중 오류:', error);
            return {
                success: false,
                message: `인증 실패: ${error}`
            };
        }
    }
    /**
     * Ollama 프로세스 강제 종료
     */
    async killOllamaProcesses() {
        try {
            const blockerPath = this.getBlockerPath();
            const keyPath = this.getServiceAccountKeyPath();
            if (!fs.existsSync(blockerPath)) {
                return {
                    success: false,
                    message: 'ollama-blocker가 설치되지 않았습니다.'
                };
            }
            if (!fs.existsSync(keyPath)) {
                return {
                    success: false,
                    message: '서비스 계정 키 파일을 찾을 수 없습니다.'
                };
            }
            // 서비스 계정 키 파일을 임시 디렉토리에 복사
            const tempDir = os.tmpdir();
            const targetKeyPath = path.join(tempDir, 'service-account-key.json');
            if (fs.existsSync(targetKeyPath)) {
                fs.unlinkSync(targetKeyPath);
            }
            fs.copyFileSync(keyPath, targetKeyPath);
            await execAsync(`"${blockerPath}" kill`, { cwd: tempDir });
            return {
                success: true,
                message: 'Ollama 프로세스가 종료되었습니다.'
            };
        }
        catch (error) {
            console.error('Ollama 프로세스 종료 중 오류:', error);
            return {
                success: false,
                message: `Ollama 프로세스 종료 실패: ${error}`
            };
        }
    }
    /**
     * Ollama Blocker 서비스 연결을 테스트합니다.
     */
    async testConnection() {
        try {
            const blockerPath = this.getBlockerPath();
            if (!fs.existsSync(blockerPath)) {
                return { success: false, error: 'Ollama blocker binary not found' };
            }
            // 간단한 상태 확인
            const tempDir = os.tmpdir();
            const result = await execAsync(`"${blockerPath}" status`, { cwd: tempDir });
            return { success: true, data: { status: result.stdout } };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
}
exports.OllamaBlockerService = OllamaBlockerService;


/***/ })

};
;
//# sourceMappingURL=3.extension.js.map