"use strict";
/**
 * Context Manager Module
 * LLM에게 제공할 컨텍스트를 수집
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
exports.ContextHistoryManager = exports.TerminalContextCollector = exports.EditorContextCollector = exports.PromptBuilder = exports.ContextManager = void 0;
__exportStar(require("./types"), exports);
var ContextManager_1 = require("./ContextManager");
Object.defineProperty(exports, "ContextManager", { enumerable: true, get: function () { return ContextManager_1.ContextManager; } });
var PromptBuilder_1 = require("./PromptBuilder");
Object.defineProperty(exports, "PromptBuilder", { enumerable: true, get: function () { return PromptBuilder_1.PromptBuilder; } });
__exportStar(require("./file"), exports);
var EditorContext_1 = require("./EditorContext");
Object.defineProperty(exports, "EditorContextCollector", { enumerable: true, get: function () { return EditorContext_1.EditorContextCollector; } });
var TerminalContext_1 = require("./TerminalContext");
Object.defineProperty(exports, "TerminalContextCollector", { enumerable: true, get: function () { return TerminalContext_1.TerminalContextCollector; } });
var ContextHistoryManager_1 = require("./ContextHistoryManager");
Object.defineProperty(exports, "ContextHistoryManager", { enumerable: true, get: function () { return ContextHistoryManager_1.ContextHistoryManager; } });
__exportStar(require("./types/contextHistory"), exports);
//# sourceMappingURL=index.js.map