"use strict";
exports.id = 1;
exports.ids = [1];
exports.modules = {

/***/ 167:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LicenseService = void 0;
const app_1 = __webpack_require__(168);
const firestore_1 = __webpack_require__(176);
// Firebase 설정 (ollama-blocker와 동일한 프로젝트)
const firebaseConfig = {
    projectId: "aidev-ass"
};
// Firebase 초기화
let app;
let db;
try {
    app = (0, app_1.initializeApp)(firebaseConfig);
    db = (0, firestore_1.getFirestore)(app);
    // console.log('Firebase 초기화 성공');
}
catch (error) {
    console.error('Firebase 초기화 실패:', error);
}
class LicenseService {
    /**
     * Firebase 연결 테스트
     */
    async testFirebaseConnection() {
        try {
            if (!db) {
                return {
                    success: false,
                    message: 'Firebase가 초기화되지 않았습니다.'
                };
            }
            // 간단한 Firestore 연결 테스트
            const testDoc = (0, firestore_1.doc)(db, 'test', 'connection');
            await (0, firestore_1.getDoc)(testDoc);
            return {
                success: true,
                message: 'Firebase 연결이 정상입니다.'
            };
        }
        catch (error) {
            console.error('Firebase 연결 테스트 실패:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            return {
                success: false,
                message: `Firebase 연결 실패: ${errorMessage}`
            };
        }
    }
    /**
     * ollama-blocker와 동일한 방식으로 시리얼 번호 검증
     * @param serialNumber 검증할 시리얼 번호
     * @returns 검증 결과 (성공/실패)
     */
    async verifyLicense(serialNumber) {
        try {
            // 입력된 시리얼 번호 정리 (공백 제거, 대문자 변환)
            const cleanedSerialNumber = serialNumber.trim().toUpperCase();
            if (!cleanedSerialNumber) {
                return {
                    success: false,
                    message: '시리얼 번호를 입력해주세요.'
                };
            }
            // 임시: 개발용 테스트 시리얼 번호
            if (cleanedSerialNumber === 'TEST_SERIAL_123' || cleanedSerialNumber === 'DEMO_SERIAL_456') {
                return {
                    success: true,
                    message: '개발용 시리얼 번호가 인증되었습니다.'
                };
            }
            // Firestore에서 serial_numbers 컬렉션에서 시리얼 번호 조회 (ollama-blocker와 동일)
            const serialDocRef = (0, firestore_1.doc)(db, 'serial_numbers', cleanedSerialNumber);
            const serialDoc = await (0, firestore_1.getDoc)(serialDocRef);
            if (!serialDoc.exists()) {
                return {
                    success: false,
                    message: '시리얼 번호를 찾을 수 없습니다.'
                };
            }
            const serialData = serialDoc.data();
            // 시리얼 번호가 유효한지 확인
            if (!serialData.valid) {
                return {
                    success: false,
                    message: '유효하지 않은 시리얼 번호입니다.'
                };
            }
            // 만료일 확인 (선택사항)
            if (serialData.expires_at) {
                const expiresAt = new Date(serialData.expires_at);
                const now = new Date();
                if (now > expiresAt) {
                    return {
                        success: false,
                        message: '만료된 시리얼 번호입니다.'
                    };
                }
            }
            return {
                success: true,
                message: '시리얼 번호 검증이 성공했습니다.'
            };
        }
        catch (error) {
            console.error('시리얼 번호 검증 중 오류 발생:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error('오류 상세:', {
                name: errorName,
                message: errorMessage,
                stack: errorStack
            });
            // Firebase 연결 오류인지 확인
            if (errorMessage.includes('firebase')) {
                return {
                    success: false,
                    message: 'Firebase 연결 오류: Firebase 설정을 확인해주세요.'
                };
            }
            // 네트워크 오류인지 확인
            if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
                return {
                    success: false,
                    message: '네트워크 연결 오류: 인터넷 연결을 확인해주세요.'
                };
            }
            return {
                success: false,
                message: `시리얼 번호 검증 중 오류가 발생했습니다: ${errorMessage}`
            };
        }
    }
    /**
     * 시리얼 번호 정보 조회 (디버깅용)
     * @param serialNumber 조회할 시리얼 번호
     * @returns 시리얼 번호 데이터
     */
    async getSerialNumberInfo(serialNumber) {
        try {
            const cleanedSerialNumber = serialNumber.trim().toUpperCase();
            const serialDocRef = (0, firestore_1.doc)(db, 'serial_numbers', cleanedSerialNumber);
            const serialDoc = await (0, firestore_1.getDoc)(serialDocRef);
            if (!serialDoc.exists()) {
                return null;
            }
            return serialDoc.data();
        }
        catch (error) {
            console.error('시리얼 번호 정보 조회 중 오류 발생:', error);
            return null;
        }
    }
}
exports.LicenseService = LicenseService;


/***/ })

};
;
//# sourceMappingURL=1.extension.js.map