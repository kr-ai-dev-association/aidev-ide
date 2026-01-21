"use strict";
/**
 * Error Manager Module
 * 에러 감지, 파싱, 분석 및 자동 수정(AutoFix)을 담당
 */
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoFix = exports.ErrorHistory = exports.StackTraceAnalyzer = exports.ErrorParser = exports.ErrorManager = void 0;
__exportStar(require("./types"), exports);
var ErrorManager_1 = require("./ErrorManager");
Object.defineProperty(exports, "ErrorManager", { enumerable: true, get: function () { return ErrorManager_1.ErrorManager; } });
var ErrorParser_1 = require("./ErrorParser");
Object.defineProperty(exports, "ErrorParser", { enumerable: true, get: function () { return ErrorParser_1.ErrorParser; } });
var StackTraceAnalyzer_1 = require("./StackTraceAnalyzer");
Object.defineProperty(exports, "StackTraceAnalyzer", { enumerable: true, get: function () { return StackTraceAnalyzer_1.StackTraceAnalyzer; } });
var ErrorHistory_1 = require("./ErrorHistory");
Object.defineProperty(exports, "ErrorHistory", { enumerable: true, get: function () { return ErrorHistory_1.ErrorHistory; } });
var AutoFix_1 = require("./AutoFix");
Object.defineProperty(exports, "AutoFix", { enumerable: true, get: function () { return AutoFix_1.AutoFix; } });
//# sourceMappingURL=index.js.map