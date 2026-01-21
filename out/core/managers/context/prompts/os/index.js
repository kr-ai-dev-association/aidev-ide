"use strict";
/**
 * OS Prompt Components
 * OS별 프롬프트 컴포넌트 배럴 파일
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultOSPrompt = exports.getLinuxPrompt = exports.getMacOSPrompt = exports.getWindowsPrompt = void 0;
var WindowsPrompt_1 = require("./WindowsPrompt");
Object.defineProperty(exports, "getWindowsPrompt", { enumerable: true, get: function () { return WindowsPrompt_1.getWindowsPrompt; } });
var MacOSPrompt_1 = require("./MacOSPrompt");
Object.defineProperty(exports, "getMacOSPrompt", { enumerable: true, get: function () { return MacOSPrompt_1.getMacOSPrompt; } });
var LinuxPrompt_1 = require("./LinuxPrompt");
Object.defineProperty(exports, "getLinuxPrompt", { enumerable: true, get: function () { return LinuxPrompt_1.getLinuxPrompt; } });
var DefaultOSPrompt_1 = require("./DefaultOSPrompt");
Object.defineProperty(exports, "getDefaultOSPrompt", { enumerable: true, get: function () { return DefaultOSPrompt_1.getDefaultOSPrompt; } });
//# sourceMappingURL=index.js.map