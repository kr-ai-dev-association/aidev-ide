"use strict";
exports.id = 2;
exports.ids = [2];
exports.modules = {

/***/ 713:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CodePilotApiClient: () => (/* binding */ CodePilotApiClient)
/* harmony export */ });
/**
 * CodePilot Backend API 클라이언트 (no-op stub)
 * 모든 네트워크 호출이 제거된 스텁 구현
 */
class CodePilotApiClient {
    static instance;
    constructor() { }
    static getInstance() {
        if (!CodePilotApiClient.instance) {
            CodePilotApiClient.instance = new CodePilotApiClient();
        }
        return CodePilotApiClient.instance;
    }
    async get(_path, _params) {
        return {};
    }
    async post(_path, _body) {
        return {};
    }
    async patch(_path, _body) {
        return {};
    }
    async delete(_path) {
        return {};
    }
    async getEffectiveSettings(_category, _orgId) {
        return [];
    }
    async getAllEffectiveSettings(_orgId) {
        return {};
    }
    async updateUserSetting(_category, _key, _value, _orgId) {
        return null;
    }
    async searchRag(_query, _orgId, _sourceIds, _topK = 5) {
        return [];
    }
    async getRagSources(_orgId) {
        return [];
    }
    async reportUsage(_data) { }
    async reportError(_data) { }
}


/***/ })

};
;
//# sourceMappingURL=2.extension.js.map