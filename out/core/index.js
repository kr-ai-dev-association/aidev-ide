"use strict";
/**
 * Core Manager System
 * 모든 매니저와 추상화 레이어를 통합
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
exports.ConfigParser = exports.ProjectIndexer = exports.ProjectDetector = exports.ProjectManager = exports.ModelConnectionService = exports.LLMManager = exports.LLMApiClient = exports.PlanManager = exports.TaskRetry = exports.TaskScheduler = exports.TaskQueue = exports.TaskManager = exports.IntentDetector = exports.ActionMapper = exports.ActionValidator = exports.ActionRegistry = exports.ActionManager = void 0;
// =============== Base ===============
__exportStar(require("./managers/base"), exports);
// =============== Action ===============
var ActionManager_1 = require("./managers/action/ActionManager");
Object.defineProperty(exports, "ActionManager", { enumerable: true, get: function () { return ActionManager_1.ActionManager; } });
var ActionRegistry_1 = require("./managers/action/ActionRegistry");
Object.defineProperty(exports, "ActionRegistry", { enumerable: true, get: function () { return ActionRegistry_1.ActionRegistry; } });
var ActionValidator_1 = require("./managers/action/ActionValidator");
Object.defineProperty(exports, "ActionValidator", { enumerable: true, get: function () { return ActionValidator_1.ActionValidator; } });
var ActionMapper_1 = require("./managers/action/ActionMapper");
Object.defineProperty(exports, "ActionMapper", { enumerable: true, get: function () { return ActionMapper_1.ActionMapper; } });
var IntentDetector_1 = require("./managers/action/IntentDetector");
Object.defineProperty(exports, "IntentDetector", { enumerable: true, get: function () { return IntentDetector_1.IntentDetector; } });
__exportStar(require("./managers/action/file"), exports);
// =============== Execution/Terminal/Task ===============
__exportStar(require("./managers/execution"), exports);
__exportStar(require("./managers/terminal"), exports);
var TaskManager_1 = require("./managers/task/TaskManager");
Object.defineProperty(exports, "TaskManager", { enumerable: true, get: function () { return TaskManager_1.TaskManager; } });
var TaskQueue_1 = require("./managers/task/TaskQueue");
Object.defineProperty(exports, "TaskQueue", { enumerable: true, get: function () { return TaskQueue_1.TaskQueue; } });
var TaskScheduler_1 = require("./managers/task/TaskScheduler");
Object.defineProperty(exports, "TaskScheduler", { enumerable: true, get: function () { return TaskScheduler_1.TaskScheduler; } });
var TaskRetry_1 = require("./managers/task/TaskRetry");
Object.defineProperty(exports, "TaskRetry", { enumerable: true, get: function () { return TaskRetry_1.TaskRetry; } });
var PlanManager_1 = require("./managers/task/PlanManager");
Object.defineProperty(exports, "PlanManager", { enumerable: true, get: function () { return PlanManager_1.PlanManager; } });
// =============== Error ===============
__exportStar(require("./managers/error"), exports);
// =============== Investigation ===============
__exportStar(require("./managers/investigation"), exports);
// =============== Context/State/Conversation/Webview/Utils ===============
__exportStar(require("./managers/context"), exports);
__exportStar(require("./managers/state"), exports);
__exportStar(require("./managers/conversation"), exports);
__exportStar(require("./webview"), exports);
__exportStar(require("./utils"), exports);
// =============== Model ===============
__exportStar(require("./managers/model/types"), exports);
var LLMApiClient_1 = require("./managers/model/LLMApiClient");
Object.defineProperty(exports, "LLMApiClient", { enumerable: true, get: function () { return LLMApiClient_1.LLMApiClient; } });
var LLMManager_1 = require("./managers/model/LLMManager");
Object.defineProperty(exports, "LLMManager", { enumerable: true, get: function () { return LLMManager_1.LLMManager; } });
var ModelConnectionService_1 = require("./managers/model/ModelConnectionService");
Object.defineProperty(exports, "ModelConnectionService", { enumerable: true, get: function () { return ModelConnectionService_1.ModelConnectionService; } });
// =============== Project ===============
var ProjectManager_1 = require("./managers/project/ProjectManager");
Object.defineProperty(exports, "ProjectManager", { enumerable: true, get: function () { return ProjectManager_1.ProjectManager; } });
var ProjectDetector_1 = require("./managers/project/ProjectDetector");
Object.defineProperty(exports, "ProjectDetector", { enumerable: true, get: function () { return ProjectDetector_1.ProjectDetector; } });
var ProjectIndexer_1 = require("./managers/project/ProjectIndexer");
Object.defineProperty(exports, "ProjectIndexer", { enumerable: true, get: function () { return ProjectIndexer_1.ProjectIndexer; } });
var ConfigParser_1 = require("./managers/project/ConfigParser");
Object.defineProperty(exports, "ConfigParser", { enumerable: true, get: function () { return ConfigParser_1.ConfigParser; } });
// =============== OS Abstraction (from execution) ===============
__exportStar(require("./managers/execution/os/IOperatingSystemAdapter"), exports);
__exportStar(require("./managers/execution/os/DarwinAdapter"), exports);
__exportStar(require("./managers/execution/os/WindowsAdapter"), exports);
__exportStar(require("./managers/execution/os/LinuxAdapter"), exports);
__exportStar(require("./managers/execution/os/OSAdapterFactory"), exports);
// =============== LLM Abstraction (from model) ===============
__exportStar(require("./managers/model/llm/ILLMAdapter"), exports);
__exportStar(require("./managers/model/llm/GptAdapter"), exports);
// =============== Framework Abstraction (from project) ===============
// =============== Code Parser Abstraction (from project) ===============
__exportStar(require("./managers/project/codeParser/ICodeParserAdapter"), exports);
__exportStar(require("./managers/project/codeParser/TreeSitterAdapter"), exports);
__exportStar(require("./managers/project/codeParser/languageParser"), exports);
//# sourceMappingURL=index.js.map