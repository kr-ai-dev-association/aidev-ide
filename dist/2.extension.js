"use strict";
exports.id = 2;
exports.ids = [2];
exports.modules = {

/***/ 711:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CodePilotApiClient: () => (/* binding */ CodePilotApiClient)
/* harmony export */ });
/**
 * CodePilot Backend API 클라이언트
 * 설정 동기화, RAG 검색, 사용량 보고 등
 */
class CodePilotApiClient {
    static instance;
    baseUrl;
    constructor() {
        // vscode import를 지연로딩
        const vscode = __webpack_require__(1);
        const config = vscode.workspace.getConfiguration("codepilot");
        this.baseUrl = config.get("backendUrl") || "https://api-codepilot.banya.ai/api/v1";
    }
    static getInstance() {
        if (!CodePilotApiClient.instance) {
            CodePilotApiClient.instance = new CodePilotApiClient();
        }
        return CodePilotApiClient.instance;
    }
    /**
     * GET 요청
     */
    async get(path, params) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        }
        return this.request(url.toString(), { method: "GET" });
    }
    /**
     * POST 요청
     */
    async post(path, body) {
        return this.request(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }
    /**
     * PATCH 요청
     */
    async patch(path, body) {
        return this.request(`${this.baseUrl}${path}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }
    /**
     * DELETE 요청
     */
    async delete(path) {
        return this.request(`${this.baseUrl}${path}`, { method: "DELETE" });
    }
    // ── 편의 메서드 ──────────────────────────────────────────
    /**
     * 유효 설정 조회 (병합된 최종 설정)
     */
    async getEffectiveSettings(category, orgId) {
        return this.get(`/settings/effective/${category}/`, { org_id: orgId });
    }
    /**
     * 전체 유효 설정 조회
     */
    async getAllEffectiveSettings(orgId) {
        const params = {};
        if (orgId)
            params.org_id = orgId;
        return this.get("/settings/effective/all/", params);
    }
    /**
     * 사용자 설정 업데이트
     */
    async updateUserSetting(category, key, value, orgId) {
        return this.patch(`/settings/user/${category}/${key}/?org_id=${orgId}`, { value });
    }
    /**
     * RAG 검색
     */
    async searchRag(query, orgId, sourceIds, topK = 5) {
        const body = { query, top_k: topK };
        if (orgId)
            body.org_id = orgId;
        if (sourceIds)
            body.source_ids = sourceIds;
        return this.post("/rag/search/", body);
    }
    /**
     * RAG 소스 목록 조회 (조직 또는 개인)
     */
    async getRagSources(orgId) {
        const params = {};
        if (orgId)
            params.org_id = orgId;
        return this.get("/rag/sources/", params);
    }
    /**
     * 사용량 보고 (IDE → 백엔드)
     */
    async reportUsage(data) {
        const body = {
            model_name: data.model_name,
            token_input: data.token_input,
            token_output: data.token_output,
            api_calls: data.api_calls,
        };
        if (data.org_id)
            body.org_id = data.org_id;
        await this.post("/monitoring/usage/report/", body);
    }
    /**
     * 에러 로그 전송 (IDE → 백엔드)
     */
    async reportError(data) {
        await this.post("/monitoring/error-logs/", {
            ...data,
            source: data.source || "ide",
        });
    }
    // ── 내부 메서드 ──────────────────────────────────────────
    static TIMEOUT_MS = 15_000;
    async request(url, options) {
        const headers = {
            ...options.headers,
        };
        // JWT 토큰 첨부
        try {
            const { AuthService } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 677));
            const auth = AuthService.getInstance();
            const token = await auth.getAccessToken();
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
        }
        catch {
            // AuthService 미초기화 시 무시 (토큰 없이 요청)
        }
        const response = await this.fetchWithTimeout(url, { ...options, headers });
        // 401 → 토큰 리프레시 시도 (auth 엔드포인트 자체는 재귀 방지)
        if (response.status === 401 && !url.includes("/auth/refresh/") && !url.includes("/auth/logout/")) {
            try {
                const { AuthService } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 677));
                const auth = AuthService.getInstance();
                const newToken = await auth.refreshAccessToken();
                if (newToken) {
                    headers["Authorization"] = `Bearer ${newToken}`;
                    const retryResponse = await this.fetchWithTimeout(url, { ...options, headers });
                    if (!retryResponse.ok) {
                        throw new Error(await this.extractErrorMessage(retryResponse));
                    }
                    return retryResponse.json();
                }
            }
            catch {
                // 리프레시 실패
            }
            throw new Error("인증이 필요합니다. 다시 로그인해주세요.");
        }
        if (!response.ok) {
            throw new Error(await this.extractErrorMessage(response));
        }
        // 204 No Content
        if (response.status === 204)
            return null;
        return response.json();
    }
    async fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CodePilotApiClient.TIMEOUT_MS);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        }
        catch (e) {
            if (e?.name === "AbortError") {
                throw new Error(`요청 시간 초과 (${CodePilotApiClient.TIMEOUT_MS / 1000}초)`);
            }
            throw e;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async extractErrorMessage(response) {
        try {
            const data = await response.json();
            return data?.error?.message || `HTTP ${response.status}`;
        }
        catch {
            return `HTTP ${response.status}`;
        }
    }
}


/***/ })

};
;
//# sourceMappingURL=2.extension.js.map