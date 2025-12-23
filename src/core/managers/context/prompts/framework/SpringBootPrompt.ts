/**
 * Spring Boot 프레임워크 프롬프트 컴포넌트
 */

export function getSpringBootPrompt(): string {
    return `**Spring Boot 프로젝트 특화 규칙:**

**중요**: 프로젝트의 build.gradle 또는 pom.xml을 먼저 확인하여 현재 설정에 맞게 작업을 수행하세요.

- Spring Boot 3.4.0 이상 사용
- 프로젝트 컨텍스트: Spring Boot / Java
- 의존성 관리: build.gradle 또는 pom.xml에 모든 외부 라이브러리 명시
- 빈/의존성 주입 패턴 준수 (@Configuration, @Bean, @ComponentScan)
- REST API 작성 시 @RestController / @RequestMapping 명확히 지정`;
}

