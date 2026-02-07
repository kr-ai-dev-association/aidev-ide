/**
 * Terminal Manager 타입 정의
 * 터미널 세션 생명주기를 관리하는 매니저의 타입들
 */
/**
 * 터미널 상태
 */
export var TerminalStatus;
(function (TerminalStatus) {
    TerminalStatus["CREATING"] = "creating";
    TerminalStatus["READY"] = "ready";
    TerminalStatus["BUSY"] = "busy";
    TerminalStatus["WAITING_INPUT"] = "waiting_input";
    TerminalStatus["CLOSED"] = "closed";
    TerminalStatus["ERROR"] = "error";
})(TerminalStatus || (TerminalStatus = {}));
//# sourceMappingURL=types.js.map