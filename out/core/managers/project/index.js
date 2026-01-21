"use strict";
/**
 * Project Manager Module
 * 프로젝트 구조 및 타입을 파악
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
exports.ConfigParser = exports.ProjectIndexer = exports.ProjectDetector = exports.ProjectManager = void 0;
__exportStar(require("./types"), exports);
var ProjectManager_1 = require("./ProjectManager");
Object.defineProperty(exports, "ProjectManager", { enumerable: true, get: function () { return ProjectManager_1.ProjectManager; } });
var ProjectDetector_1 = require("./ProjectDetector");
Object.defineProperty(exports, "ProjectDetector", { enumerable: true, get: function () { return ProjectDetector_1.ProjectDetector; } });
var ProjectIndexer_1 = require("./ProjectIndexer");
Object.defineProperty(exports, "ProjectIndexer", { enumerable: true, get: function () { return ProjectIndexer_1.ProjectIndexer; } });
var ConfigParser_1 = require("./ConfigParser");
Object.defineProperty(exports, "ConfigParser", { enumerable: true, get: function () { return ConfigParser_1.ConfigParser; } });
//# sourceMappingURL=index.js.map