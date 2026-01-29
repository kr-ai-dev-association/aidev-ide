/**
 * Project Manager Module
 * 프로젝트 구조 및 타입을 파악
 *
 * v9.2.5: StackDetector 추가 (frameworks/ 디렉토리에서 이동)
 */

export * from './types';
export * from './stackTypes';
export { ProjectManager } from './ProjectManager';
export { ProjectDetector } from './ProjectDetector';
export { ProjectIndexer } from './ProjectIndexer';
export { ConfigParser } from './ConfigParser';
export { StackDetector } from './StackDetector';
export type { ProjectProfile, FrameworkMatch } from './types';
export type { DetailedStack, StackInfo, VersionInfo, CompatibilityIssue } from './stackTypes';

