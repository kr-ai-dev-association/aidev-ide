/**
 * 추상화 레이어 통합 Export
 * OS, LLM, 기술 스택 추상화를 한 곳에서 관리
 */

// ==================== OS 추상화 ====================
export * from './os/IOperatingSystemAdapter';
export * from './os/DarwinAdapter';
export * from './os/WindowsAdapter';
export * from './os/LinuxAdapter';
export * from './os/OSAdapterFactory';

// ==================== LLM 추상화 ====================
export * from './llm/ILLMAdapter';
export * from './llm/GptOssAdapter';

// ==================== 기술 스택 추상화 ====================
export * from './techStack/ITechStackAdapter';
export * from './techStack/TypeScriptAdapter';
export * from './techStack/SpringBootAdapter';
export * from './techStack/TechStackAdapterFactory';

// ==================== 통합 서비스 ====================
export * from './AbstractionIntegrationService';
export { getAbstractionService } from './AbstractionIntegrationService';

