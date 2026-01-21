"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.javaQuery = exports.pythonQuery = exports.javascriptQuery = exports.typescriptQuery = void 0;
var typescript_1 = require("./typescript");
Object.defineProperty(exports, "typescriptQuery", { enumerable: true, get: function () { return __importDefault(typescript_1).default; } });
var javascript_1 = require("./javascript");
Object.defineProperty(exports, "javascriptQuery", { enumerable: true, get: function () { return __importDefault(javascript_1).default; } });
var python_1 = require("./python");
Object.defineProperty(exports, "pythonQuery", { enumerable: true, get: function () { return __importDefault(python_1).default; } });
var java_1 = require("./java");
Object.defineProperty(exports, "javaQuery", { enumerable: true, get: function () { return __importDefault(java_1).default; } });
// 추가 언어는 필요시 여기에 export 추가
// export { default as rustQuery } from './rust';
// export { default as goQuery } from './go';
// etc...
//# sourceMappingURL=index.js.map