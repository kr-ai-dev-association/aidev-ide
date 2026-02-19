/**
 * Task Manager 타입 정의
 * 비동기 작업 큐를 관리하는 매니저의 타입들
 */
/**
 * 작업 우선순위
 */
export var Priority;
(function (Priority) {
    Priority[Priority["CRITICAL"] = 0] = "CRITICAL";
    Priority[Priority["HIGH"] = 1] = "HIGH";
    Priority[Priority["NORMAL"] = 2] = "NORMAL";
    Priority[Priority["LOW"] = 3] = "LOW";
    Priority[Priority["BACKGROUND"] = 4] = "BACKGROUND";
})(Priority || (Priority = {}));
/**
 * 작업 상태
 */
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["PAUSED"] = "paused";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["CANCELLED"] = "cancelled";
    TaskStatus["SKIPPED"] = "skipped";
})(TaskStatus || (TaskStatus = {}));
/**
 * 작업 타입
 */
export var TaskType;
(function (TaskType) {
    TaskType["ACTION"] = "action";
    TaskType["COMMAND"] = "command";
    TaskType["FILE_OPERATION"] = "file_operation";
    TaskType["CODE_GENERATION"] = "code_generation";
    TaskType["ANALYSIS"] = "analysis";
    TaskType["REFACTOR"] = "refactor";
})(TaskType || (TaskType = {}));
/**
 * 작업 이벤트
 */
export var TaskEvent;
(function (TaskEvent) {
    TaskEvent["ENQUEUED"] = "enqueued";
    TaskEvent["STARTED"] = "started";
    TaskEvent["PROGRESS"] = "progress";
    TaskEvent["COMPLETED"] = "completed";
    TaskEvent["FAILED"] = "failed";
    TaskEvent["CANCELLED"] = "cancelled";
    TaskEvent["RETRYING"] = "retrying";
})(TaskEvent || (TaskEvent = {}));
//# sourceMappingURL=types.js.map