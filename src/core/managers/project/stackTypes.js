/**
 * Stack Types
 * 프레임워크별 세부 스택 타입 정의
 *
 * v9.2.1: 동적 프롬프트 주입을 위한 세부 스택 감지
 * v9.2.5: project/ 디렉토리로 이동
 */
/**
 * Android 세부 스택
 */
export var AndroidStack;
(function (AndroidStack) {
    AndroidStack["COMPOSE"] = "compose";
    AndroidStack["COMPOSE_MULTIPLATFORM"] = "compose-multiplatform";
    AndroidStack["KSP"] = "ksp";
    AndroidStack["ROOM"] = "room";
    AndroidStack["HILT"] = "hilt";
    AndroidStack["DAGGER"] = "dagger";
    AndroidStack["RETROFIT"] = "retrofit";
    AndroidStack["NAVIGATION"] = "navigation-compose";
    AndroidStack["VIEWMODEL"] = "viewmodel";
    AndroidStack["DATASTORE"] = "datastore";
    AndroidStack["KOTLIN_SERIALIZATION"] = "kotlin-serialization";
    AndroidStack["COROUTINES"] = "coroutines";
    AndroidStack["FLOW"] = "flow";
})(AndroidStack || (AndroidStack = {}));
/**
 * React 세부 스택
 */
export var ReactStack;
(function (ReactStack) {
    ReactStack["NEXTJS"] = "nextjs";
    ReactStack["NEXTJS_APP_ROUTER"] = "nextjs-app-router";
    ReactStack["NEXTJS_PAGES_ROUTER"] = "nextjs-pages-router";
    ReactStack["VITE"] = "vite";
    ReactStack["CRA"] = "create-react-app";
    ReactStack["REMIX"] = "remix";
    ReactStack["GATSBY"] = "gatsby";
    ReactStack["REACT_ROUTER"] = "react-router";
    ReactStack["TANSTACK_QUERY"] = "tanstack-query";
    ReactStack["REDUX"] = "redux";
    ReactStack["ZUSTAND"] = "zustand";
    ReactStack["JOTAI"] = "jotai";
    ReactStack["TAILWIND"] = "tailwind";
    ReactStack["STYLED_COMPONENTS"] = "styled-components";
    ReactStack["EMOTION"] = "emotion";
    ReactStack["TYPESCRIPT"] = "typescript";
})(ReactStack || (ReactStack = {}));
/**
 * Flutter 세부 스택
 */
export var FlutterStack;
(function (FlutterStack) {
    FlutterStack["RIVERPOD"] = "riverpod";
    FlutterStack["BLOC"] = "bloc";
    FlutterStack["PROVIDER"] = "provider";
    FlutterStack["GETX"] = "getx";
    FlutterStack["FREEZED"] = "freezed";
    FlutterStack["JSON_SERIALIZABLE"] = "json-serializable";
    FlutterStack["HIVE"] = "hive";
    FlutterStack["SQFLITE"] = "sqflite";
    FlutterStack["FIREBASE"] = "firebase";
    FlutterStack["GO_ROUTER"] = "go-router";
})(FlutterStack || (FlutterStack = {}));
/**
 * Spring Boot 세부 스택
 */
export var SpringStack;
(function (SpringStack) {
    SpringStack["SPRING_DATA_JPA"] = "spring-data-jpa";
    SpringStack["SPRING_SECURITY"] = "spring-security";
    SpringStack["SPRING_WEBFLUX"] = "spring-webflux";
    SpringStack["SPRING_CLOUD"] = "spring-cloud";
    SpringStack["MYBATIS"] = "mybatis";
    SpringStack["QUERYDSL"] = "querydsl";
    SpringStack["KOTLIN"] = "kotlin";
    SpringStack["GRADLE_KOTLIN_DSL"] = "gradle-kotlin-dsl";
})(SpringStack || (SpringStack = {}));
/**
 * Python 세부 스택
 */
export var PythonStack;
(function (PythonStack) {
    PythonStack["DJANGO"] = "django";
    PythonStack["FASTAPI"] = "fastapi";
    PythonStack["FLASK"] = "flask";
    PythonStack["PYTORCH"] = "pytorch";
    PythonStack["TENSORFLOW"] = "tensorflow";
    PythonStack["PANDAS"] = "pandas";
    PythonStack["NUMPY"] = "numpy";
    PythonStack["SQLALCHEMY"] = "sqlalchemy";
    PythonStack["PYDANTIC"] = "pydantic";
    PythonStack["POETRY"] = "poetry";
    PythonStack["UV"] = "uv";
})(PythonStack || (PythonStack = {}));
//# sourceMappingURL=stackTypes.js.map