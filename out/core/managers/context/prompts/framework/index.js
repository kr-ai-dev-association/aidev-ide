"use strict";
/**
 * Framework Prompt Components
 * 프레임워크별 프롬프트 컴포넌트 배럴 파일
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpressPrompt = exports.getNodeTypeScriptPrompt = exports.getSpringBootPrompt = exports.getViteTypePrompt = void 0;
var ViteTypeScriptPrompt_1 = require("./ViteTypeScriptPrompt");
Object.defineProperty(exports, "getViteTypePrompt", { enumerable: true, get: function () { return ViteTypeScriptPrompt_1.getViteTypePrompt; } });
var SpringBootPrompt_1 = require("./SpringBootPrompt");
Object.defineProperty(exports, "getSpringBootPrompt", { enumerable: true, get: function () { return SpringBootPrompt_1.getSpringBootPrompt; } });
var NodeTypeScriptPrompt_1 = require("./NodeTypeScriptPrompt");
Object.defineProperty(exports, "getNodeTypeScriptPrompt", { enumerable: true, get: function () { return NodeTypeScriptPrompt_1.getNodeTypeScriptPrompt; } });
var ExpressPrompt_1 = require("./ExpressPrompt");
Object.defineProperty(exports, "getExpressPrompt", { enumerable: true, get: function () { return ExpressPrompt_1.getExpressPrompt; } });
//# sourceMappingURL=index.js.map