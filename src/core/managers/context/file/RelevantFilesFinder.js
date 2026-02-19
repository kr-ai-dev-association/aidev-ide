/**
 * Relevant Files Finder
 * 사용자 쿼리와 관련된 파일을 찾는 서비스
 */
import * as path from "path";
import * as fs from "fs/promises";
import { glob } from "glob";
import { FileSearcher } from "./FileSearcher";
import { getBatchScoringPrompt } from "../prompts/analysis/generalAnalysis";
import { ProjectContextCache } from "../ProjectContextCache";
export class RelevantFilesFinder {
    projectManager;
    llmManager;
    fileSearcher;
    MAX_TOTAL_CONTENT_LENGTH = 1000000; // LLM 컨텍스트 최대 길이
    MAX_LLM_SCORING_FILES = 30; // LLM scoring을 수행할 최대 파일 수
    MIN_RELEVANCE_SCORE = 30; // 최소 relevance score (0-100)
    LLM_BATCH_SIZE = 8; // 한 번에 LLM에 전달할 파일 수
    MAX_FILE_PREVIEW_LENGTH = 2000; // 파일 미리보기 최대 길이
    constructor(projectManager) {
        this.projectManager = projectManager;
        this.fileSearcher = FileSearcher.getInstance();
    }
    /**
     * 캐시를 우선 사용하여 파일 내용 읽기
     */
    async readFileWithCache(filePath) {
        const cache = ProjectContextCache.getInstance();
        const cachedContent = await cache.getFile(filePath);
        if (cachedContent) {
            console.log(`[RelevantFilesFinder] Using cached content: ${filePath}`);
            return cachedContent;
        }
        const content = await fs.readFile(filePath, "utf8");
        // 캐시에 저장 (백그라운드)
        cache.cacheFile(filePath).catch(() => { });
        return content;
    }
    /**
     * LLM Manager를 설정합니다 (내용 기반 relevance scoring용)
     */
    setLLMManager(llmManager) {
        this.llmManager = llmManager;
    }
    /**
     * 사용자 질의와 관련된 파일들을 자동으로 찾아서 컨텍스트에 추가합니다
     */
    async getRelevantFilesContext(userQuery, projectRoot, abortSignal, conversationHistory) {
        const defaultResult = {
            fileContentsContext: "",
            includedFilesForContext: [],
            extractedKeywords: [],
        };
        let fileContentsContext = "";
        let currentTotalContentLength = 0;
        const includedFilesForContext = [];
        const includedPathSet = new Set();
        try {
            // 1. 사용자 쿼리에서 명시적으로 언급된 파일 먼저 찾기 (최우선)
            const explicitFiles = await this.findExplicitFilesInQuery(userQuery, projectRoot, abortSignal);
            console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일 찾기 완료: ${explicitFiles.length}개`);
            for (const filePath of explicitFiles) {
                if (abortSignal?.aborted) {
                    break;
                }
                if (includedPathSet.has(filePath)) {
                    console.log(`[RelevantFilesFinder] 이미 포함된 파일 스킵: ${filePath}`);
                    continue; // 이미 포함된 파일은 스킵
                }
                if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                    console.warn(`[RelevantFilesFinder] 컨텍스트 길이 제한으로 파일 읽기 중단: ${filePath}`);
                    break;
                }
                try {
                    console.log(`[RelevantFilesFinder] 파일 읽기 시도: ${filePath}`);
                    const content = await this.readFileWithCache(filePath);
                    const relativePath = path.relative(projectRoot, filePath);
                    const fileExtension = path.extname(filePath).substring(1) || "text";
                    console.log(`[RelevantFilesFinder] 파일 읽기 성공: ${relativePath} (${content.length} bytes)`);
                    if (currentTotalContentLength + content.length <=
                        this.MAX_TOTAL_CONTENT_LENGTH) {
                        const fileContext = `파일명: ${relativePath}\n코드:\n\`\`\`${fileExtension}\n${content}\n\`\`\`\n\n`;
                        fileContentsContext += fileContext;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({
                            name: relativePath,
                            fullPath: filePath,
                        });
                        includedPathSet.add(filePath);
                        console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일 컨텍스트에 추가: ${relativePath} (총 ${currentTotalContentLength} bytes)`);
                    }
                    else {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                        console.warn(`[RelevantFilesFinder] 파일이 너무 커서 생략: ${relativePath}`);
                    }
                }
                catch (error) {
                    console.error(`[RelevantFilesFinder] 명시적 파일 읽기 실패: ${filePath}`, error);
                }
            }
            console.log(`[RelevantFilesFinder] 명시적 파일 처리 완료. 현재 컨텍스트 길이: ${fileContentsContext.length} bytes`);
            // 키워드 추출
            const keywords = this.extractKeywordsFromQuery(userQuery);
            console.log(`[RelevantFilesFinder] 추출된 키워드: ${keywords.join(", ")}`);
            // 대화 히스토리에서 키워드 확장
            const expandedKeywords = this.expandKeywordsWithHistory(keywords, conversationHistory);
            // ✅ STEP 1: Ripgrep 기반 키워드 검색으로 사전 필터링
            const ripgrepFilteredFiles = await this.findRelevantFilesWithRipgrep(projectRoot, expandedKeywords, userQuery, abortSignal);
            console.log(`[RelevantFilesFinder] Ripgrep 필터링 완료: ${ripgrepFilteredFiles.length}개 파일`);
            // ✅ STEP 2: 키워드 기반 파일 탐색 (fallback)
            const keywordBasedFiles = await this.findRelevantFiles(projectRoot, expandedKeywords, abortSignal);
            // 두 결과 병합 (중복 제거)
            const allCandidateFiles = Array.from(new Set([...ripgrepFilteredFiles, ...keywordBasedFiles]));
            console.log(`[RelevantFilesFinder] 전체 후보 파일: ${allCandidateFiles.length}개`);
            // ✅ STEP 3: 키워드 기반 점수로 사전 스크리닝
            const preScoredFiles = this.preScoreFilesWithKeywords(allCandidateFiles, userQuery, projectRoot, expandedKeywords);
            const topPreScoredFiles = preScoredFiles
                .sort((a, b) => b.score - a.score)
                .slice(0, this.MAX_LLM_SCORING_FILES)
                .map((item) => item.filePath);
            console.log(`[RelevantFilesFinder] 사전 스크리닝 완료: ${topPreScoredFiles.length}개 파일 (LLM scoring 대상)`);
            // ✅ STEP 4: 배치 LLM 기반 내용 relevance scoring
            let selectedFiles;
            if (this.llmManager && topPreScoredFiles.length > 0) {
                try {
                    console.log(`[RelevantFilesFinder] 배치 LLM scoring 시작: ${topPreScoredFiles.length}개 파일`);
                    selectedFiles = await this.selectFilesWithBatchLLMScoring(topPreScoredFiles, userQuery, projectRoot, abortSignal);
                    console.log(`[RelevantFilesFinder] 배치 LLM scoring 완료: ${selectedFiles.length}개 파일 선택`);
                }
                catch (error) {
                    console.warn("[RelevantFilesFinder] 배치 LLM scoring 실패, 사전 점수 기반 선택으로 fallback:", error);
                    // Fallback: 사전 점수 기반 선택
                    selectedFiles = topPreScoredFiles.slice(0, 20);
                }
            }
            else {
                // LLM Manager가 없으면 사전 점수 기반 선택
                selectedFiles = topPreScoredFiles.slice(0, 20);
            }
            // 2. 키워드 기반으로 찾은 파일 내용 수집 (명시적 파일 제외)
            for (const filePath of selectedFiles) {
                if (abortSignal?.aborted) {
                    break;
                }
                if (includedPathSet.has(filePath)) {
                    continue;
                } // 이미 명시적 파일로 포함된 경우 스킵
                if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                    fileContentsContext +=
                        "\n[INFO] 컨텍스트 길이 제한으로 일부 파일 내용이 생략되었습니다.\n";
                    break;
                }
                try {
                    const content = await this.readFileWithCache(filePath);
                    const relativePath = path.relative(projectRoot, filePath);
                    const fileExtension = path.extname(filePath).substring(1) || "text";
                    if (currentTotalContentLength + content.length <=
                        this.MAX_TOTAL_CONTENT_LENGTH) {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n\`\`\`${fileExtension}\n${content}\n\`\`\`\n\n`;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({
                            name: relativePath,
                            fullPath: filePath,
                        });
                        includedPathSet.add(filePath);
                    }
                    else {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                    }
                }
                catch (error) {
                    console.warn(`[RelevantFilesFinder] 파일 읽기 실패: ${filePath}`, error);
                }
            }
            return {
                fileContentsContext,
                includedFilesForContext,
                extractedKeywords: expandedKeywords,
            };
        }
        catch (error) {
            console.error("[RelevantFilesFinder] 관련 파일 컨텍스트 수집 중 오류:", error);
            return {
                fileContentsContext: fileContentsContext || "",
                includedFilesForContext: includedFilesForContext || [],
                extractedKeywords: [],
            };
        }
    }
    /**
     * 키워드를 추출합니다 (범용적 - 언어/프레임워크에 의존하지 않음)
     */
    extractKeywordsFromQuery(userQuery) {
        return userQuery
            .toLowerCase()
            .replace(/[^\w\s\uAC00-\uD7AF]/g, " ") // 영문, 숫자, 한글만 유지
            .split(/\s+/)
            .filter((word) => word.length > 1 && word.length <= 30) // 2~30자
            .filter((word, index, self) => self.indexOf(word) === index) // 중복 제거
            .slice(0, 10); // 상위 10개
    }
    /**
     * 대화 히스토리에서 키워드를 확장합니다
     */
    expandKeywordsWithHistory(keywords, conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return keywords;
        }
        const expandedKeywords = new Set(keywords);
        // 최근 대화에서 키워드 추출
        for (const entry of conversationHistory.slice(-5)) {
            const historyKeywords = this.extractKeywordsFromQuery(entry.userQuery);
            historyKeywords.forEach((k) => expandedKeywords.add(k));
        }
        return Array.from(expandedKeywords);
    }
    /**
     * 관련 파일을 찾습니다
     */
    async findRelevantFiles(projectRoot, keywords, abortSignal) {
        const relevantFiles = [];
        const projectInfo = this.projectManager.getCurrentProject();
        // 프로젝트 타입에 따른 검색 패턴
        let searchPatterns;
        if (projectInfo?.type === "spring-boot" || projectInfo?.type === "java") {
            searchPatterns = [
                "pom.xml",
                "build.gradle",
                "build.gradle.kts",
                "src/main/resources/application.properties",
                "src/main/resources/application.yml",
                "src/main/resources/application.yaml",
                "src/main/java/**/*.java",
                "src/test/java/**/*.java",
            ];
        }
        else if (projectInfo?.type === "react" ||
            projectInfo?.type === "vue" ||
            projectInfo?.type === "angular") {
            searchPatterns = [
                "package.json",
                "src/**/*.ts",
                "src/**/*.js",
                "src/**/*.tsx",
                "src/**/*.jsx",
                "src/**/*.vue",
                "src/**/*.css",
                "src/**/*.scss",
                "src/**/*.html",
            ];
        }
        else {
            searchPatterns = [
                "**/*.ts",
                "**/*.js",
                "**/*.tsx",
                "**/*.jsx",
                "**/*.py",
                "**/*.java",
                "**/*.html",
                "**/*.css",
                "**/*.json",
                "**/*.yaml",
                "**/*.yml",
            ];
        }
        // 키워드 패턴 생성
        const keywordPatterns = this.generateKeywordPatterns(keywords);
        const allPatterns = [...searchPatterns, ...keywordPatterns];
        try {
            const indexer = this.projectManager.indexer;
            if (!indexer) {
                return [];
            }
            for (const pattern of allPatterns) {
                if (abortSignal?.aborted) {
                    break;
                }
                try {
                    const files = await glob(pattern, { cwd: projectRoot, nodir: true });
                    const fullPaths = files.map((file) => path.join(projectRoot, file));
                    for (const filePath of fullPaths) {
                        if (abortSignal?.aborted) {
                            break;
                        }
                        if (indexer.isLibraryPath &&
                            indexer.isLibraryPath(filePath, projectRoot)) {
                            continue;
                        }
                        const fileName = path.basename(filePath).toLowerCase();
                        const relativePath = path
                            .relative(projectRoot, filePath)
                            .toLowerCase();
                        const isRelevant = keywords.some((keyword) => fileName.includes(keyword.toLowerCase()) ||
                            relativePath.includes(keyword.toLowerCase()));
                        if (isRelevant && !relevantFiles.includes(filePath)) {
                            relevantFiles.push(filePath);
                        }
                    }
                }
                catch (error) {
                    console.warn(`[RelevantFilesFinder] 패턴 검색 중 오류: ${pattern}`, error);
                }
            }
        }
        catch (error) {
            console.error("[RelevantFilesFinder] 파일 검색 중 오류:", error);
        }
        return relevantFiles;
    }
    /**
     * 키워드 기반 검색 패턴을 생성합니다
     */
    generateKeywordPatterns(keywords) {
        const patterns = [];
        const addedPatterns = new Set();
        const topKeywords = keywords.slice(0, 5);
        for (const keyword of topKeywords) {
            const basicPatterns = [`**/*${keyword}*`, `**/${keyword}/**/*`];
            for (const pattern of basicPatterns) {
                if (!addedPatterns.has(pattern)) {
                    patterns.push(pattern);
                    addedPatterns.add(pattern);
                }
            }
        }
        return patterns;
    }
    /**
     * 토큰 제한 기반 파일 선택
     */
    selectFilesBasedOnTokenLimit(relevantFiles, userQuery, projectRoot) {
        const fileScores = new Map();
        const indexer = this.projectManager.indexer;
        for (const filePath of relevantFiles) {
            if (indexer &&
                indexer.isLibraryPath &&
                indexer.isLibraryPath(filePath, projectRoot)) {
                continue;
            }
            let score = 0;
            const fileName = path.basename(filePath).toLowerCase();
            const relativePath = path.relative(projectRoot, filePath).toLowerCase();
            if (userQuery.toLowerCase().includes(fileName.split(".")[0])) {
                score += 20;
            }
            if (fileName === "package.json" ||
                fileName === "tsconfig.json" ||
                fileName === "pom.xml" ||
                fileName === "build.gradle") {
                score += 15;
            }
            if (fileName.endsWith(".ts") ||
                fileName.endsWith(".js") ||
                fileName.endsWith(".tsx") ||
                fileName.endsWith(".jsx") ||
                fileName.endsWith(".java")) {
                score += 10;
            }
            if (relativePath.includes("src/main/java") ||
                relativePath.includes("src/main/resources")) {
                score += 8;
            }
            fileScores.set(filePath, score);
        }
        return Array.from(fileScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([filePath]) => filePath);
    }
    /**
     * 사용자 쿼리에서 명시적으로 언급된 파일 경로를 추출하고 읽습니다.
     * 예: "design.md 파일 읽고", "App.tsx 수정", "package.json 확인" 등
     */
    async findExplicitFilesInQuery(userQuery, projectRoot, abortSignal) {
        const explicitFiles = [];
        // 파일명 패턴 추출 (예: design.md, App.tsx, package.json, 환급금조회_요구사항정의서.md 등)
        // 정규식: 파일명.확장자 형식 (공백, 따옴표, 백틱 등으로 구분)
        const filePatterns = [
            // 백틱으로 감싼 파일명: `design.md`, `App.tsx`
            /`([^\s`]+\.\w+)`/g,
            // 따옴표로 감싼 파일명: "design.md", 'App.tsx'
            /["']([^\s"']+\.\w+)["']/g,
            // 일반 파일명 패턴: design.md, App.tsx, 환급금조회_요구사항정의서.md (앞뒤에 공백이나 특수문자)
            // 언더스코어, 하이픈, 한글, 영문, 숫자 모두 포함
            /\b([a-zA-Z0-9가-힣_\-]+\.(md|ts|tsx|js|jsx|json|css|html|py|java|xml|yml|yaml|txt|sh|bat|ps1))\b/gi,
        ];
        console.log(`[RelevantFilesFinder] 명시적 파일 찾기 시작: "${userQuery}"`);
        const foundFileNames = new Set();
        for (const pattern of filePatterns) {
            let match;
            // 정규식의 lastIndex를 초기화하기 위해 새로 생성
            const regex = new RegExp(pattern.source, pattern.flags);
            while ((match = regex.exec(userQuery)) !== null) {
                const fileName = match[1];
                console.log(`[RelevantFilesFinder] 파일명 패턴 매칭: ${fileName}`);
                if (fileName && !foundFileNames.has(fileName.toLowerCase())) {
                    foundFileNames.add(fileName.toLowerCase());
                    console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일: ${fileName}`);
                    // 프로젝트 루트에서 파일 찾기
                    const possiblePaths = [
                        path.join(projectRoot, fileName), // 루트에 직접
                        path.join(projectRoot, "src", fileName), // src/ 하위
                        path.join(projectRoot, "src", "**", fileName), // src/ 하위 어디든
                    ];
                    for (const filePath of possiblePaths) {
                        if (abortSignal?.aborted) {
                            break;
                        }
                        try {
                            const fs = await import("fs/promises");
                            // glob 패턴이면 glob으로 검색
                            if (filePath.includes("**")) {
                                const glob = await import("glob");
                                const files = await glob.glob(filePath, {
                                    cwd: projectRoot,
                                    nodir: true,
                                });
                                if (files.length > 0) {
                                    const foundPath = path.join(projectRoot, files[0]);
                                    explicitFiles.push(foundPath);
                                    console.log(`[RelevantFilesFinder] 파일 찾기 성공 (glob): ${foundPath}`);
                                    break;
                                }
                            }
                            else {
                                // 직접 경로 확인 - fs.existsSync 사용 (동기 방식이지만 파일 존재 확인에는 충분)
                                const fsSync = await import("fs");
                                if (fsSync.existsSync(filePath)) {
                                    explicitFiles.push(filePath);
                                    console.log(`[RelevantFilesFinder] 파일 찾기 성공: ${filePath}`);
                                    break;
                                }
                            }
                        }
                        catch (error) {
                            // 파일이 없으면 다음 경로 시도
                            console.log(`[RelevantFilesFinder] 파일 찾기 실패 (다음 경로 시도): ${filePath}`);
                            continue;
                        }
                    }
                }
            }
        }
        console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일: ${explicitFiles.map((f) => path.relative(projectRoot, f)).join(", ")}`);
        return explicitFiles;
    }
    /**
     * Ripgrep 기반 키워드 검색으로 관련 파일 찾기
     * ✅ 핵심: 실제 파일 내용에서 키워드 검색 → 정확도 향상, 호출 횟수 감소
     */
    async findRelevantFilesWithRipgrep(projectRoot, keywords, userQuery, abortSignal) {
        if (keywords.length === 0) {
            return [];
        }
        const foundFiles = new Set();
        const topKeywords = keywords.slice(0, 5); // 상위 5개 키워드만 사용
        for (const keyword of topKeywords) {
            if (abortSignal?.aborted) {
                break;
            }
            try {
                // Ripgrep으로 키워드 검색
                const results = await this.fileSearcher.searchFiles(keyword, projectRoot, {
                    maxResults: 50, // 키워드당 최대 50개 파일
                    contextLines: 0, // context 불필요
                    caseSensitive: false,
                });
                // 검색 결과에서 파일 경로 추출
                for (const result of results) {
                    if (abortSignal?.aborted) {
                        break;
                    }
                    const filePath = path.isAbsolute(result.file)
                        ? result.file
                        : path.join(projectRoot, result.file);
                    foundFiles.add(filePath);
                }
            }
            catch (error) {
                console.warn(`[RelevantFilesFinder] Ripgrep 검색 실패 (키워드: ${keyword}):`, error);
            }
        }
        return Array.from(foundFiles);
    }
    /**
     * 키워드 기반 사전 점수 계산 (LLM 호출 전 스크리닝)
     * ✅ 핵심: 키워드 매칭 빈도, 파일명/경로 매칭 등으로 점수 계산
     */
    preScoreFilesWithKeywords(files, userQuery, projectRoot, keywords) {
        const scoredFiles = [];
        for (const filePath of files) {
            let score = 0;
            const fileName = path.basename(filePath).toLowerCase();
            const relativePath = path.relative(projectRoot, filePath).toLowerCase();
            const queryLower = userQuery.toLowerCase();
            // 1. 파일명 매칭 (높은 가중치)
            for (const keyword of keywords) {
                if (fileName.includes(keyword.toLowerCase())) {
                    score += 20;
                }
                if (relativePath.includes(keyword.toLowerCase())) {
                    score += 15;
                }
            }
            // 2. 중요 파일 (설정 파일 등)
            if (fileName === "package.json" ||
                fileName === "tsconfig.json" ||
                fileName === "pom.xml" ||
                fileName === "build.gradle") {
                score += 25;
            }
            // 3. 소스 파일 우선순위
            if (fileName.endsWith(".ts") ||
                fileName.endsWith(".js") ||
                fileName.endsWith(".tsx") ||
                fileName.endsWith(".jsx") ||
                fileName.endsWith(".java")) {
                score += 10;
            }
            // 4. 경로 우선순위
            if (relativePath.includes("src/main") || relativePath.includes("src/")) {
                score += 8;
            }
            scoredFiles.push({ filePath, score });
        }
        return scoredFiles;
    }
    /**
     * 배치 LLM 기반 내용 relevance scoring으로 파일 선택
     *
     * ✅ 핵심 개선:
     * - 여러 파일을 한 번에 LLM에 전달 (배치 처리)
     * - LLM 호출 횟수 대폭 감소 (30회 → 4회)
     * - 파일 내용 요약 옵션
     * - False positive/negative 감소
     */
    async selectFilesWithBatchLLMScoring(candidateFiles, userQuery, projectRoot, abortSignal) {
        if (!this.llmManager) {
            throw new Error("LLMManager is not set");
        }
        const filesToScore = candidateFiles.slice(0, this.MAX_LLM_SCORING_FILES);
        console.log(`[RelevantFilesFinder] 배치 LLM scoring 대상: ${filesToScore.length}개 파일`);
        const fileScores = [];
        const fs = await import("fs/promises");
        // ✅ 배치 처리: 파일을 LLM_BATCH_SIZE씩 묶어서 처리
        for (let i = 0; i < filesToScore.length; i += this.LLM_BATCH_SIZE) {
            if (abortSignal?.aborted) {
                break;
            }
            const batch = filesToScore.slice(i, i + this.LLM_BATCH_SIZE);
            console.log(`[RelevantFilesFinder] 배치 ${Math.floor(i / this.LLM_BATCH_SIZE) + 1} 처리 중: ${batch.length}개 파일`);
            try {
                // 배치 내 파일 내용 읽기
                const fileContents = [];
                for (const filePath of batch) {
                    try {
                        const content = await this.readFileWithCache(filePath);
                        const relativePath = path.relative(projectRoot, filePath);
                        // 파일 내용 요약 (큰 파일 처리)
                        const contentPreview = content.length > this.MAX_FILE_PREVIEW_LENGTH
                            ? content.substring(0, this.MAX_FILE_PREVIEW_LENGTH) +
                                "\n... (파일이 너무 커서 일부만 표시)"
                            : content;
                        fileContents.push({
                            filePath,
                            relativePath,
                            content: contentPreview,
                        });
                    }
                    catch (error) {
                        console.warn(`[RelevantFilesFinder] 파일 읽기 실패: ${filePath}`, error);
                    }
                }
                if (fileContents.length === 0) {
                    continue;
                }
                // ✅ 배치 LLM 호출: 여러 파일을 한 번에 평가
                const batchPrompt = this.buildBatchScoring(userQuery, fileContents);
                const response = await this.llmManager.sendMessage(batchPrompt, {
                    signal: abortSignal,
                });
                // 배치 결과 파싱
                const batchScores = this.parseBatchRelevanceScores(response, fileContents);
                // 결과 병합
                for (const fileContent of fileContents) {
                    const scoreResult = batchScores.find((s) => s.filePath === fileContent.filePath);
                    if (scoreResult) {
                        fileScores.push({
                            filePath: fileContent.filePath,
                            score: scoreResult.score,
                            reasoning: scoreResult.reasoning,
                        });
                        console.log(`[RelevantFilesFinder] ${fileContent.relativePath}: score=${scoreResult.score} (${scoreResult.reasoning || "N/A"})`);
                    }
                    else {
                        // 파싱 실패 시 fallback 점수
                        const fallbackScore = this.calculateFallbackScore(fileContent.filePath, userQuery, projectRoot);
                        fileScores.push({
                            filePath: fileContent.filePath,
                            score: fallbackScore,
                        });
                    }
                }
            }
            catch (error) {
                console.warn(`[RelevantFilesFinder] 배치 LLM scoring 실패 (배치 ${Math.floor(i / this.LLM_BATCH_SIZE) + 1}):`, error);
                // 에러 시 fallback 점수 부여
                for (const filePath of batch) {
                    const fallbackScore = this.calculateFallbackScore(filePath, userQuery, projectRoot);
                    fileScores.push({ filePath, score: fallbackScore });
                }
            }
        }
        // Score 기반으로 정렬하고 최소 점수 이상만 선택
        const selectedFiles = fileScores
            .filter((item) => item.score >= this.MIN_RELEVANCE_SCORE)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20) // 상위 20개만 선택
            .map((item) => item.filePath);
        console.log(`[RelevantFilesFinder] 배치 LLM scoring 결과: ${selectedFiles.length}개 파일 선택 (최소 점수: ${this.MIN_RELEVANCE_SCORE})`);
        return selectedFiles;
    }
    /**
     * 배치 scoring용 프롬프트 생성
     */
    buildBatchScoring(userQuery, fileContents) {
        const filesSection = fileContents
            .map((file, index) => {
            return `**파일 ${index + 1}: ${file.relativePath}**
\`\`\`
${file.content}
\`\`\``;
        })
            .join("\n\n");
        return getBatchScoringPrompt(userQuery, filesSection);
    }
    /**
     * 배치 LLM 응답에서 relevance scores 파싱
     */
    parseBatchRelevanceScores(response, fileContents) {
        const scores = [];
        try {
            // JSON 배열 추출 시도
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item.file && typeof item.score === "number") {
                            // relativePath로 filePath 찾기
                            const fileContent = fileContents.find((f) => f.relativePath === item.file);
                            if (fileContent && item.score >= 0 && item.score <= 100) {
                                scores.push({
                                    filePath: fileContent.filePath,
                                    score: Math.round(item.score),
                                    reasoning: item.reasoning,
                                });
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.warn("[RelevantFilesFinder] 배치 relevance score 파싱 실패:", error);
        }
        return scores;
    }
    /**
     * LLM 응답에서 relevance score 파싱
     */
    parseRelevanceScore(response) {
        try {
            // JSON 추출 시도
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (typeof parsed.score === "number" &&
                    parsed.score >= 0 &&
                    parsed.score <= 100) {
                    return {
                        score: Math.round(parsed.score),
                        reasoning: parsed.reasoning,
                    };
                }
            }
            // 숫자만 추출 시도
            const scoreMatch = response.match(/\b(\d{1,3})\b/);
            if (scoreMatch) {
                const score = parseInt(scoreMatch[1], 10);
                if (score >= 0 && score <= 100) {
                    return { score };
                }
            }
            return null;
        }
        catch (error) {
            console.warn("[RelevantFilesFinder] Relevance score 파싱 실패:", error);
            return null;
        }
    }
    /**
     * LLM scoring 실패 시 fallback 점수 계산 (키워드 기반)
     */
    calculateFallbackScore(filePath, userQuery, projectRoot) {
        let score = 0;
        const fileName = path.basename(filePath).toLowerCase();
        const relativePath = path.relative(projectRoot, filePath).toLowerCase();
        const queryLower = userQuery.toLowerCase();
        // 파일명/경로 매칭
        if (queryLower.includes(fileName.split(".")[0])) {
            score += 30;
        }
        // 중요 파일
        if (fileName === "package.json" ||
            fileName === "tsconfig.json" ||
            fileName === "pom.xml") {
            score += 20;
        }
        // 경로 매칭
        if (relativePath.includes("src/main") || relativePath.includes("src/")) {
            score += 10;
        }
        return Math.min(score, 60); // 최대 60점 (LLM scoring 실패 시 보수적 점수)
    }
}
//# sourceMappingURL=RelevantFilesFinder.js.map