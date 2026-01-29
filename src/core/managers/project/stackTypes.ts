/**
 * Stack Types
 * 프레임워크별 세부 스택 타입 정의
 *
 * v9.2.1: 동적 프롬프트 주입을 위한 세부 스택 감지
 * v9.2.5: project/ 디렉토리로 이동
 */

import { ProjectType } from './types';

/**
 * 세부 스택 정보 (프레임워크 내 세부 기술 스택)
 */
export interface DetailedStack {
    /** 기본 프로젝트 타입 */
    projectType: ProjectType;
    /** 감지된 세부 스택 목록 */
    stacks: StackInfo[];
    /** 버전 정보 */
    versions: VersionInfo;
    /** 호환성 이슈 가능성 */
    potentialIssues: CompatibilityIssue[];
}

/**
 * 개별 스택 정보
 */
export interface StackInfo {
    /** 스택 이름 (예: "Compose", "KSP", "Next.js") */
    name: string;
    /** 감지 신뢰도 (0-1) */
    confidence: number;
    /** 감지 근거 */
    evidence: string[];
    /** 버전 (감지된 경우) */
    version?: string;
}

/**
 * 버전 정보
 */
export interface VersionInfo {
    /** 언어 버전 */
    language?: string;
    /** 프레임워크 버전 */
    framework?: string;
    /** 컴파일러/빌드 도구 버전 */
    compiler?: string;
    /** 기타 중요 버전 정보 */
    [key: string]: string | undefined;
}

/**
 * 호환성 이슈
 */
export interface CompatibilityIssue {
    /** 이슈 심각도 */
    severity: 'warning' | 'error' | 'info';
    /** 이슈 설명 */
    description: string;
    /** 관련 스택들 */
    relatedStacks: string[];
    /** 권장 조치 */
    recommendation?: string;
}

/**
 * Android 세부 스택
 */
export enum AndroidStack {
    COMPOSE = 'compose',
    COMPOSE_MULTIPLATFORM = 'compose-multiplatform',
    KSP = 'ksp',
    ROOM = 'room',
    HILT = 'hilt',
    DAGGER = 'dagger',
    RETROFIT = 'retrofit',
    NAVIGATION = 'navigation-compose',
    VIEWMODEL = 'viewmodel',
    DATASTORE = 'datastore',
    KOTLIN_SERIALIZATION = 'kotlin-serialization',
    COROUTINES = 'coroutines',
    FLOW = 'flow',
}

/**
 * React 세부 스택
 */
export enum ReactStack {
    NEXTJS = 'nextjs',
    NEXTJS_APP_ROUTER = 'nextjs-app-router',
    NEXTJS_PAGES_ROUTER = 'nextjs-pages-router',
    VITE = 'vite',
    CRA = 'create-react-app',
    REMIX = 'remix',
    GATSBY = 'gatsby',
    REACT_ROUTER = 'react-router',
    TANSTACK_QUERY = 'tanstack-query',
    REDUX = 'redux',
    ZUSTAND = 'zustand',
    JOTAI = 'jotai',
    TAILWIND = 'tailwind',
    STYLED_COMPONENTS = 'styled-components',
    EMOTION = 'emotion',
    TYPESCRIPT = 'typescript',
}

/**
 * Flutter 세부 스택
 */
export enum FlutterStack {
    RIVERPOD = 'riverpod',
    BLOC = 'bloc',
    PROVIDER = 'provider',
    GETX = 'getx',
    FREEZED = 'freezed',
    JSON_SERIALIZABLE = 'json-serializable',
    HIVE = 'hive',
    SQFLITE = 'sqflite',
    FIREBASE = 'firebase',
    GO_ROUTER = 'go-router',
}

/**
 * Spring Boot 세부 스택
 */
export enum SpringStack {
    SPRING_DATA_JPA = 'spring-data-jpa',
    SPRING_SECURITY = 'spring-security',
    SPRING_WEBFLUX = 'spring-webflux',
    SPRING_CLOUD = 'spring-cloud',
    MYBATIS = 'mybatis',
    QUERYDSL = 'querydsl',
    KOTLIN = 'kotlin',
    GRADLE_KOTLIN_DSL = 'gradle-kotlin-dsl',
}

/**
 * Python 세부 스택
 */
export enum PythonStack {
    DJANGO = 'django',
    FASTAPI = 'fastapi',
    FLASK = 'flask',
    PYTORCH = 'pytorch',
    TENSORFLOW = 'tensorflow',
    PANDAS = 'pandas',
    NUMPY = 'numpy',
    SQLALCHEMY = 'sqlalchemy',
    PYDANTIC = 'pydantic',
    POETRY = 'poetry',
    UV = 'uv',
}
