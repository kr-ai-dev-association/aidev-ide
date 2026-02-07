/**
 * TextPatterns
 * 텍스트 처리에 사용되는 정규식 패턴들을 관리하는 클래스
 */
export class TextPatterns {
    // Thinking/Reasoning 태그 패턴
    static THINKING_TAG = /<thinking>[\s\S]*?<\/thinking>/gi;
    static REDACTED_REASONING = /<think>[\s\S]*?<\/redacted_reasoning>/gi;
    static REDACTED_REASONING_ALT = /<think>[\s\S]*?<\/think>/gi;
    static REASONING_TAG = /<reasoning>[\s\S]*?<\/reasoning>/gi;
    static THOUGHT_TAG = /<thought>[\s\S]*?<\/thought>/gi;
    static INTERNAL_TAG = /<internal>[\s\S]*?<\/internal>/gi;
    static META_TAG = /<meta>[\s\S]*?<\/meta>/gi;
    static SYSTEM_TAG = /<system>[\s\S]*?<\/system>/gi;
    static NOTE_TAG = /<note>[\s\S]*?<\/note>/gi;
    static COMMENT_TAG = /<comment>[\s\S]*?<\/comment>/gi;
    static REFLECTION_TAG = /<reflection>[\s\S]*?<\/reflection>/gi;
    static ANALYSIS_TAG = /<analysis>[\s\S]*?<\/analysis>/gi;
    static PLANNING_TAG = /<planning>[\s\S]*?<\/planning>/gi;
    static CONSIDERATION_TAG = /<consideration>[\s\S]*?<\/consideration>/gi;
    static EVALUATION_TAG = /<evaluation>[\s\S]*?<\/evaluation>/gi;
    static THOUGHT_PROCESS_TAG = /<thought_process>[\s\S]*?<\/thought_process>/gi;
    static INTERNAL_THOUGHT_TAG = /<internal_thought>[\s\S]*?<\/internal_thought>/gi;
    static INTERNAL_REASONING_TAG = /<internal_reasoning>[\s\S]*?<\/internal_reasoning>/gi;
    static INTERNAL_MONOLOGUE_TAG = /<internal_monologue>[\s\S]*?<\/internal_monologue>/gi;
    static INTERNAL_DIALOGUE_TAG = /<internal_dialogue>[\s\S]*?<\/internal_dialogue>/gi;
    static INTERNAL_NOTE_TAG = /<internal_note>[\s\S]*?<\/internal_note>/gi;
    static INTERNAL_COMMENT_TAG = /<internal_comment>[\s\S]*?<\/internal_comment>/gi;
    static INTERNAL_REFLECTION_TAG = /<internal_reflection>[\s\S]*?<\/internal_reflection>/gi;
    static INTERNAL_ANALYSIS_TAG = /<internal_analysis>[\s\S]*?<\/internal_analysis>/gi;
    static INTERNAL_PLANNING_TAG = /<internal_planning>[\s\S]*?<\/internal_planning>/gi;
    static INTERNAL_CONSIDERATION_TAG = /<internal_consideration>[\s\S]*?<\/internal_consideration>/gi;
    static INTERNAL_EVALUATION_TAG = /<internal_evaluation>[\s\S]*?<\/internal_evaluation>/gi;
    static INTERNAL_THOUGHT_PROCESS_TAG = /<internal_thought_process>[\s\S]*?<\/internal_thought_process>/gi;
    static INTERNAL_THOUGHTS_TAG = /<internal_thoughts>[\s\S]*?<\/internal_thoughts>/gi;
    static INTERNAL_REASONINGS_TAG = /<internal_reasonings>[\s\S]*?<\/internal_reasonings>/gi;
    static INTERNAL_MONOLOGUES_TAG = /<internal_monologues>[\s\S]*?<\/internal_monologues>/gi;
    static INTERNAL_DIALOGUES_TAG = /<internal_dialogues>[\s\S]*?<\/internal_dialogues>/gi;
    static INTERNAL_NOTES_TAG = /<internal_notes>[\s\S]*?<\/internal_notes>/gi;
    static INTERNAL_COMMENTS_TAG = /<internal_comments>[\s\S]*?<\/internal_comments>/gi;
    static INTERNAL_REFLECTIONS_TAG = /<internal_reflections>[\s\S]*?<\/internal_reflections>/gi;
    static INTERNAL_ANALYSES_TAG = /<internal_analyses>[\s\S]*?<\/internal_analyses>/gi;
    static INTERNAL_PLANNINGS_TAG = /<internal_plannings>[\s\S]*?<\/internal_plannings>/gi;
    static INTERNAL_CONSIDERATIONS_TAG = /<internal_considerations>[\s\S]*?<\/internal_considerations>/gi;
    static INTERNAL_EVALUATIONS_TAG = /<internal_evaluations>[\s\S]*?<\/internal_evaluations>/gi;
    // JSON 응답 패턴
    static JSON_WRAPPER = /^\{[\s\S]*\}$/;
    static JSON_THINKING_FIELD_STRING = /"thinking"\s*:\s*"[^"]*"/gi;
    static JSON_THINKING_FIELD_OBJECT = /"thinking"\s*:\s*\{[^}]*\}/gi;
    // 시스템 토큰 패턴
    static INVESTIGATION_DONE = /<investigation_done\s*\/>/gi;
    // 도구 호출 태그 패턴
    static TOOL_TAGS = ['create_file', 'update_file', 'remove_file', 'read_file', 'list_files', 'search_files', 'run_command', 'task_progress', 'plan'];
    // 자연어 추론 패턴
    static WE_NEED_TO = /We need to[^.]*\./gi;
    static WE_SHOULD = /We should[^.]*\./gi;
    static WE_WILL = /We will[^.]*\./gi;
    static ACCORDING_TO = /According to[^.]*\./gi;
    static LETS = /Let's[^.]*\./gi;
    static I_SHOULD = /I should[^.]*\./gi;
    static I_NEED_TO = /I need to[^.]*\./gi;
    static I_WILL = /I will[^.]*\./gi;
    static ILL = /I'll[^.]*\./gi;
    static BUT_THATS = /But that's[^.]*\./gi;
    static HOWEVER = /However[^.]*\./gi;
    static NOT_SURE = /Not sure[^.]*\./gi;
    static POSSIBLY = /Possibly[^.]*\./gi;
    static THE_RULE_SAYS = /The rule says[^.]*\./gi;
    static GIVEN = /Given[^.]*\./gi;
    static WE_NEED_TO_THUS = /We need to[\s\S]*?Thus:/gi;
    static ACCORDING_TO_SO_WE_SHOULD = /According to[\s\S]*?So we should/gi;
    static LETS_CALL_TOOL = /Let's call[\s\S]*?<[a-z_]+>/gi;
    static WE_WILL_ISSUE = /We will issue[^.]*\./gi;
    static BUT_WE_CAN = /But we can[^.]*\./gi;
    static ACTUALLY_THEY_SAY = /Actually they say[^.]*\./gi;
    static SO_WE_NEED = /So we need[^.]*\./gi;
    // 시스템 메시지 패턴
    static TOOL_EXECUTION_RESULTS = /=== Tool Execution Results [\s\S]*?===/gi;
    static TOOL_STATUS = /\[Tool: [\s\S]*?Status: (Success|Failed)/gi;
    static OUTPUT_DATA = /Output Data:[\s\S]*?"\s*}\s*/gi;
    static OUTPUT_DATA_ALT = /Output Data:[\s\S]*?-------------------/gi;
    static WAIT_PRODUCE_XML = /Wait: We should produce an XML call now\./gi;
    static WE_NEED_RESULT = /We need result\./gi;
    static WE_HAVENT_READ = /We haven't read [\s\S]*?\./gi;
    // 파일 관련 패턴
    static ALREADY_READ_FILE = /이미 읽은 파일.*?\): (.+?)\n/;
    static CODE_BLOCK_CONTENT = /```\n([\s\S]*?)\n```/;
    static FILE_PATH_PATTERN = /(?:이미 읽은 파일.*?:|파일:)\s*(.+?)(?:\n|$)/i;
    /**
     * 모든 thinking/reasoning 태그를 제거하는 정규식 배열
     */
    static getThinkingPatterns() {
        return [
            this.THINKING_TAG,
            this.REDACTED_REASONING,
            this.REDACTED_REASONING_ALT,
            this.REASONING_TAG,
            this.THOUGHT_TAG,
            this.INTERNAL_TAG,
            this.META_TAG,
            this.SYSTEM_TAG,
            this.NOTE_TAG,
            this.COMMENT_TAG,
            this.REFLECTION_TAG,
            this.ANALYSIS_TAG,
            this.PLANNING_TAG,
            this.CONSIDERATION_TAG,
            this.EVALUATION_TAG,
            this.THOUGHT_PROCESS_TAG,
            this.INTERNAL_THOUGHT_TAG,
            this.INTERNAL_REASONING_TAG,
            this.INTERNAL_MONOLOGUE_TAG,
            this.INTERNAL_DIALOGUE_TAG,
            this.INTERNAL_NOTE_TAG,
            this.INTERNAL_COMMENT_TAG,
            this.INTERNAL_REFLECTION_TAG,
            this.INTERNAL_ANALYSIS_TAG,
            this.INTERNAL_PLANNING_TAG,
            this.INTERNAL_CONSIDERATION_TAG,
            this.INTERNAL_EVALUATION_TAG,
            this.INTERNAL_THOUGHT_PROCESS_TAG,
            this.INTERNAL_THOUGHTS_TAG,
            this.INTERNAL_REASONINGS_TAG,
            this.INTERNAL_MONOLOGUES_TAG,
            this.INTERNAL_DIALOGUES_TAG,
            this.INTERNAL_NOTES_TAG,
            this.INTERNAL_COMMENTS_TAG,
            this.INTERNAL_REFLECTIONS_TAG,
            this.INTERNAL_ANALYSES_TAG,
            this.INTERNAL_PLANNINGS_TAG,
            this.INTERNAL_CONSIDERATIONS_TAG,
            this.INTERNAL_EVALUATIONS_TAG
        ];
    }
    /**
     * 모든 자연어 추론 패턴을 제거하는 정규식 배열
     */
    static getNaturalLanguagePatterns() {
        return [
            this.WE_NEED_TO,
            this.WE_SHOULD,
            this.WE_WILL,
            this.ACCORDING_TO,
            this.LETS,
            this.I_SHOULD,
            this.I_NEED_TO,
            this.I_WILL,
            this.ILL,
            this.BUT_THATS,
            this.HOWEVER,
            this.NOT_SURE,
            this.POSSIBLY,
            this.THE_RULE_SAYS,
            this.GIVEN,
            this.WE_NEED_TO_THUS,
            this.ACCORDING_TO_SO_WE_SHOULD,
            this.LETS_CALL_TOOL,
            this.WE_WILL_ISSUE,
            this.BUT_WE_CAN,
            this.ACTUALLY_THEY_SAY,
            this.SO_WE_NEED
        ];
    }
    /**
     * 모든 시스템 메시지 패턴을 제거하는 정규식 배열
     */
    static getSystemMessagePatterns() {
        return [
            this.TOOL_EXECUTION_RESULTS,
            this.TOOL_STATUS,
            this.OUTPUT_DATA,
            this.OUTPUT_DATA_ALT,
            this.WAIT_PRODUCE_XML,
            this.WE_NEED_RESULT,
            this.WE_HAVENT_READ
        ];
    }
    /**
     * 도구 호출 태그를 제거하는 정규식 생성
     */
    static getToolTagPattern(tag) {
        return new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
    }
    /**
     * 모든 도구 호출 태그를 제거하는 정규식 배열
     */
    static getToolTagPatterns() {
        return this.TOOL_TAGS.map(tag => this.getToolTagPattern(tag));
    }
}
//# sourceMappingURL=TextPatterns.js.map