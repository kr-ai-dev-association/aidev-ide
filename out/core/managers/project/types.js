"use strict";
/**
 * Project Manager 타입 정의
 * 프로젝트 구조 및 메타데이터를 관리하는 매니저의 타입들
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildTool = exports.ProjectType = void 0;
/**
 * 프로젝트 타입
 */
var ProjectType;
(function (ProjectType) {
    ProjectType["TYPESCRIPT"] = "typescript";
    ProjectType["JAVASCRIPT"] = "javascript";
    ProjectType["REACT"] = "react";
    ProjectType["REACT_NATIVE"] = "react-native";
    ProjectType["VUE"] = "vue";
    ProjectType["ANGULAR"] = "angular";
    ProjectType["NODE"] = "node";
    ProjectType["SPRING_BOOT"] = "spring-boot";
    ProjectType["JAVA"] = "java";
    ProjectType["PYTHON"] = "python";
    ProjectType["DJANGO"] = "django";
    ProjectType["FLASK"] = "flask";
    ProjectType["FASTAPI"] = "fastapi";
    ProjectType["GO"] = "go";
    ProjectType["RUST"] = "rust";
    ProjectType["FLUTTER"] = "flutter";
    ProjectType["PHP"] = "php";
    ProjectType["CSHARP"] = "csharp";
    ProjectType["RUBY"] = "ruby";
    ProjectType["SWIFT"] = "swift";
    ProjectType["C_CPP"] = "c-cpp";
    ProjectType["UNKNOWN"] = "unknown";
})(ProjectType || (exports.ProjectType = ProjectType = {}));
/**
 * 빌드 도구
 */
var BuildTool;
(function (BuildTool) {
    BuildTool["NPM"] = "npm";
    BuildTool["YARN"] = "yarn";
    BuildTool["PNPM"] = "pnpm";
    BuildTool["BUN"] = "bun";
    BuildTool["MAVEN"] = "maven";
    BuildTool["GRADLE"] = "gradle";
    BuildTool["CARGO"] = "cargo";
    BuildTool["GO_MOD"] = "go-mod";
    BuildTool["PIP"] = "pip";
    BuildTool["POETRY"] = "poetry";
    BuildTool["PUB"] = "pub";
    BuildTool["COMPOSER"] = "composer";
    BuildTool["BUNDLER"] = "bundler";
    BuildTool["DOTNET"] = "dotnet";
    BuildTool["CMAKE"] = "cmake";
    BuildTool["UNKNOWN"] = "unknown";
})(BuildTool || (exports.BuildTool = BuildTool = {}));
//# sourceMappingURL=types.js.map