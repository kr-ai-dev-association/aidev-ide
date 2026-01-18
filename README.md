<p align="right">
  🇰🇷 <a href="README.ko.md">한국어로 보기</a>
</p>

# aidev-ide README

VSCode base code assistant plugin with LLM and LM support.

## v8.8.1 (Summary Improvements & Session History Restoration)
- **Improved Summary Format**: Enhanced task completion summary output with markdown formatting.
  - Structured with `### Task Complete ✅`, `### Changes`, `### Usage` sections
  - File changes displayed as `**filename**: description` format
  - Project execution instructions provided in code blocks
  - Added retry logic when LLM responds with tool tags (max 3 attempts)
- **Complete Session History Restoration**: Full conversation restoration on VSCode restart.
  - Restores code blocks (created/modified file contents)
  - Restores action areas (📖 [Read], ✅ [Created], 📝 [Updated], etc.)
  - All messages displayed in webview are saved via `uiMessages` field
  - Backwards compatibility with older data format
- **Action Tracker UI Removed**: Removed unnecessary real-time action tracker UI.
  - Removed displays like "Working... 📖Reading file: App.tsx"
  - Removed `WebviewBridge.updateActionTracker`, `clearActionTracker` methods
  - Removed action tracker calls from `ToolExecutor`
  - Reduced bundle size by removing related CSS styles

## v8.8.0 (Real-time Action Tracker & Context Improvements)
- **Real-time Action Tracker**: Added Windsurf-style real-time action tracking UI during AI operations.
  - Shows live progress of file reads, creates, modifies, deletes
  - Displays command execution status in real-time
  - Search and analysis operations are tracked with visual indicators
  - Each action shows start/complete/error status with icons
  - Animated spinner and status indicators for active operations
  - Maximum 10 actions displayed with auto-scroll
- **WebviewBridge Enhancement**: Added `updateActionTracker` and `clearActionTracker` methods
- **ToolExecutor Integration**: Automatic action tracking for all tool executions
- **Visual Improvements**:
  - Action-specific icons and color coding (read: blue, create: green, modify: orange, delete: red)
  - Smooth slide-in animations for new actions
  - Completed actions fade to indicate progress
- **Open Tabs Context**: Added ability to include open editor tabs in LLM context.
  - `ContextManager.getOpenTabsContext()` returns list of all open tabs
  - Includes file path, name, language, active status, and dirty status
  - Helps LLM understand which files user is working with
- **Partial File Reading**: Enhanced `read_file` tool with line range support.
  - `startLine` and `endLine` parameters for reading specific portions of large files
  - Returns line numbers with content for easy reference
  - Reduces token usage when only part of a file is needed

## v8.7.8 (Input Area Styling Improvements)
- **Input Area Border Styling**: Improved input area border appearance for cleaner UI.
  - Added subtle light gray border to input area (`.input-row`)
  - Removed blue focus border, maintaining consistent light gray border on focus
  - Provides cleaner, more consistent visual appearance
- **File Selection UX**: Improved '@' command file selection behavior.
  - File name no longer remains in input field after selection
  - Selected files are only shown in the file selection area
  - Cleaner input experience when using '@' command
- **UI Text Consistency**: Standardized text capitalization in Pending Changes button.
  - Changed "file/files" to "File/Files" for consistency

## v8.7.7 (UI Improvements & Code Block Toggle Refactoring)
- **Code Block Toggle Refactoring**: Refactored code block toggle functionality to use event delegation pattern.
  - Changed from direct event listeners to `codepilot://toggle` scheme-based event delegation
  - Each code block now has a unique ID for reliable toggle state management
  - Improved click handling to prevent conflicts with file open and diff icons
  - Toggle button and header use anchor tags with custom scheme for better event handling
- **UI Simplification**: Removed borders and backgrounds from dropdown buttons and options for cleaner text-like appearance.
  - Model selector and Code/ASK mode selector buttons now appear as plain text
  - Removed all left-side color indicators from dropdown buttons and options
  - File button already had no border/background, now consistent across all controls
- **Token Usage Tooltip Enhancement**: Added context information to token usage tooltip.
  - Tooltip now shows both token usage and context message count
  - Format: "Token usage: X / Y\nContext: Z messages"
  - Provides comprehensive context information at a glance
- **Notification Cleanup**: Removed approval notification messages for cleaner user experience.
  - File change approval no longer shows "Changes approved" notification
  - Reduces notification noise during development workflow

## v8.7.6 (Conversation History Management Architecture Improvements)
- **Unified History System**: Consolidated 4 duplicate storage systems into a single SessionManager repository for clearer context management.
  - `SessionManager.conversationHistory` as the single source of truth
  - Stores both full conversation content and structured metadata
  - Both ASK and CODE modes use the same storage
- **ConversationEntry Type Extensions**: Stores both full responses and metadata.
  - `assistantResponse`: Stores complete LLM response (for ASK mode context reuse)
  - `filesCreated`, `filesModified`, `commandsExecuted`: Structured metadata
  - `compactedSummaryId`: Reference to compressed summary
  - `durationMs`: Execution time tracking
- **Automatic Session Compaction**: Intelligent history compression using LLM summarization.
  - Auto-compacts when token threshold exceeds 80%
  - Summarizes old conversations with LLM and persistently stores in `compactedSummaries`
  - Keeps recent 20 conversations in original form
  - Falls back to simple trim on compression failure
- **ASK Mode Context Improvements**: Provides context in summary + recent conversation structure.
  - `getHistoryContext()` method combines compressed summaries with recent conversations
  - Past conversation context is preserved as summaries, not lost
  - Context management quality on par with Cursor/Copilot/Claude Code
- **ConversationCompactor Integration**: Integrated SessionManager with ConversationCompactor.
  - `generateSummaryFromText()` method for direct summary generation
  - SessionManager handles compression timing and summary persistence
  - Dual strategy: in-loop temporary compression + session persistent compression
- **Performance Optimizations**: Removed unnecessary LLM calls and utilized caching.
  - CODE mode can store only file change information (full response optional)
  - Fast search and filtering with structured metadata
  - Reduced token costs through compressed summary reuse

## v8.7.6 (Context Visualization & Token Usage Display)
- **Context Visualization**: Added real-time context information display in the input area.
  - Shows current number of messages in context
  - Displays token usage with visual indicators
  - Color-coded token usage warnings (yellow at 70%, red at 90%)
  - Updates automatically during conversation
- **Token Usage Tracking**: Real-time token consumption monitoring.
  - Shows current tokens / max tokens
  - Percentage-based display for easy understanding
  - Helps users manage context length effectively

## v8.7.5 (Session History Management & Code Cleanup)
- **Session Conversation History**: Now saves conversation history to sessions.
  - User messages and AI responses are automatically saved to the current session
  - Conversation history is stored with each session (up to 100 entries per session)
  - Clear History button now clears the actual session conversation history
- **Code Cleanup**: Removed unused TabHistory system.
  - Removed legacy TabHistory methods (getTabHistory, addTabHistoryEntry, getTabHistoryContext, clearTabHistory)
  - Simplified conversation history management
  - ConversationCompactor handles context management (keeps recent 12 messages + summarizes older ones)
- **Improved Session Restoration**: Sessions now include full conversation context when restored

## v8.7.4 (Project Context Caching & Slash Commands)
- **Project Context Caching**: Significantly improved performance by caching frequently accessed files and project structures.
  - Automatic caching of priority files (package.json, tsconfig.json, pyproject.toml, etc.)
  - Automatic file change detection and cache invalidation
  - Memory-efficient management with LRU cache policy
  - TTL (Time To Live) based automatic expiration (5 minutes default)
  - Maximum cache size limit (10MB default)
  - Disk persistence for cache retention after restart
  - Project structure caching (file tree, config file list)
  - Cache hit rate and statistics viewing
- **Slash Commands in Chat Panel**: Added slash command support in chat input.
  - Type `/` in chat input to see available commands
  - `/cache` - View cache statistics
  - `/clear-cache` - Clear context cache
  - `/sessions` - List saved sessions
  - `/restore` - Restore saved session
  - Keyboard navigation support (Arrow Up/Down, Enter, Escape)
- **New Commands Added**:
  - `Codepilot: View Cache Statistics` - View cache statistics with QuickPick UI
  - `Codepilot: Clear Context Cache` - Clear context cache with confirmation prompt
  - `Codepilot: List Saved Sessions` - View all saved sessions
  - `Codepilot: Restore Saved Session` - Restore a previously saved session
- **SessionManager Enhancement**: Integrated project context caching for improved performance

## v8.7.3 (Retry Count Default Update & UI Improvements)
- **Default Retry Count Increase**: Increased default retry counts for better error recovery.
  - Error auto-correction default retry count: 3 → 5
  - Auto test retry default count: 3 → 5
- **UI Terminology Update**: Changed "Auto Test Retry on Failure" to "Auto Code Validation" for clearer semantics
- **Pending Changes Synchronization**: Improved synchronization between chat panel and dropdown.
  - Clicking Keep/Undo in chat panel now removes all buttons for the same file across all code blocks
  - Pending changes dropdown automatically updates when changes are accepted/rejected from chat panel

## v8.7.2 (Prompt Rules Conflict Resolution)
- **Prompt Rules Priority Clarification**: Resolved prompt rule conflicts that caused LLM confusion and inaction.
  - Added clear priority order: 1) Information gathering first, 2) Complex tasks need planning, 3) Action priority, 4) Execution-focused
  - Updated `getBaseRules()` with prioritized rule structure and practical examples
  - Added "When in doubt, read files and execute" guideline to prevent analysis paralysis
  - Enhanced `getNoInternalMonologueRules()` with exception clause for unclear situations
  - Improved `getCodeWorkPrompt()` and `getExecutionWorkPrompt()` with task mode decision guidelines
  - Fixed issue where LLM would output internal reasoning ("We need to...", "According to...") without taking action
  - Added explicit examples showing correct workflow (read → execute) vs incorrect workflow (internal monologue only)

## v8.7.1 (Pending Changes UI Improvements)
- **Pending Changes Dropdown UI Enhancements**: Improved the pending changes dropdown interface with better usability.
  - File path display: Shows full relative path (e.g., `src/app.ts`) instead of just filename
  - Button labels: Changed "Accept" → "Keep", "Reject" → "Undo" for clearer action semantics
  - Undo button styling: Black background (#1e1e1e) for Undo button to distinguish from Keep button
  - Dropdown width: Increased from 320px to 420px to accommodate file paths
  - Icon update: Changed arrow icon from `>` to `›` for better visual consistency
  - Chat panel buttons: Updated Accept/Reject buttons below code blocks to match dropdown styling (Keep/Undo with same colors)

## v8.7.0 (Pending Changes Popup)
- **Pending Changes Popup**: Added a popup UI to manage pending file changes (diffs) that haven't been accepted or rejected yet.
  - New button in the input panel (next to model selector) shows pending changes count badge
  - Click to open popup showing all files with pending changes
  - Each file displays: filename, added/deleted line counts
  - Per-file actions: View Diff, Accept, Reject
  - Global actions: Accept All, Reject All
  - Automatically updates when file changes occur
- **InlineDiffManager Enhancements**: Added `getPendingChangesStats()` and `hasPendingChanges()` methods for UI integration
- **Real-time Updates**: Pending changes popup automatically refreshes after tool execution

## v8.6.0 (Automatic Context Compaction)
- **Automatic Context Compaction**: Added automatic context compaction feature to manage long conversations. When conversation context exceeds 80% of the model's token limit, the system automatically:
  - Summarizes older messages using LLM
  - Keeps recent 12 messages in original form
  - Creates a compact [Previous Conversation Summary] + [Recent Messages] structure
  - Falls back to sliding window if LLM summarization fails
- **ConversationCompactor**: New class (`ConversationCompactor.ts`) implementing hybrid summarization strategy:
  - Token threshold monitoring (configurable, default 80%)
  - LLM-based intelligent summarization for old messages
  - Sliding window fallback for reliability
  - Compaction statistics tracking
- **UI Notification**: Users are notified when context compaction occurs with token savings information

## v8.5.1 (Prompt System Cleanup)
- **Prompt System Cleanup**: Cleaned up duplicate and unused prompt rules to improve maintainability.
  - Removed unused `getXmlToolRules()` function from base prompts
  - Removed duplicate XML/markdown rules from task-specific prompts (already covered in base rules)
  - Simplified and consolidated global rules in base.ts for better clarity
  - Streamlined prompt structure while preserving all essential functionality

## v8.5.0 (Development Rules Auto-Loading)
- **Development Rules Auto-Loading**: Added automatic loading of development rules from `.agent/rules` directory. The system now automatically reads markdown files (stable-version.md, coding-style.md, project-architecture.md, dependency-policy.md, db-policy.md) from the `.agent/rules` directory and includes them as mandatory rules in the system prompt. Only existing files are loaded, so partial rule sets are supported.

## v8.4.0 (Framework-Specific Prompts Removal)
- **Framework-Specific Prompts Removal**: Removed all framework-specific prompt files to simplify the prompt system. The system now relies on LLM to dynamically detect and handle framework-specific requirements by reading project files (package.json, pom.xml, etc.) instead of using hardcoded framework prompts.

## v8.2.0 (File Diff Display & Formatter Integration Improvements)
- **File Diff Display**: Enhanced file diff display in code blocks with improved visual indicators for added and removed lines. Diff blocks now show line count changes in the header.
- **Formatter-Aware Decoration Management**: Improved decoration handling during and after formatter execution. Decorations are now properly preserved and re-applied after code formatting, preventing decoration loss when formatters modify files.
- **Document Change Detection**: Enhanced document change detection to properly handle formatter-triggered changes. First document change after formatter completion is automatically ignored to prevent false reconciliation.

## v8.1.0 (Diff UI/UX Improvements & Code Block Enhancements)
- **Accept/Reject All Buttons**: Added "Accept" and "Reject" buttons below code blocks that display diffs, allowing users to accept or reject all changes for a file at once. Buttons are automatically removed after being clicked.
- **Code Block Syntax Highlighting**: Implemented syntax highlighting for code blocks using Highlight.js with VS Code dark theme colors. Added comprehensive language mapping to support various language aliases.
- **Button Visibility Improvements**: Copy and Run buttons for Bash/PowerShell/Cmd blocks are now always visible (not just on hover). Copy button removed from general code blocks, kept only for Bash blocks.
- **New File Decoration Timing Fix**: Fixed decoration application timing issues for newly created files. Decorations now apply correctly even when files are created and immediately formatted.
- **Formatter Integration**: Improved decoration re-application after formatter execution. Decorations are now properly restored after code formatting completes.
- **File Path Resolution**: Fixed file path matching issues in Accept/Reject All functionality by normalizing relative paths to absolute paths.

## v8.0.0 (CryptoUtils Enhancements)
- **CryptoUtils Security Improvements**: Enhanced security, code quality, type safety, and error handling in `cryptoUtils.ts`. Added license serial encryption functionality.

## v7.0.1 (Probability-Based Decision Logic Consistency Improvements)
- **Centralized Threshold Management**: All probability-based decision thresholds (confidence, thresholds, percentages) are now centralized in `AgentConfig.ts` for better maintainability and consistency.
- **Consistent Confidence Values**: Unified confidence values for the same purposes:
  - Local detection: All set to 0.8 (previously 0.7, 0.8 mixed)
  - Framework detection: Express also set to 0.8 (previously 0.7)
  - Python project detection: Django 0.9, Flask/FastAPI 0.85, General 0.8
  - Error fix confidence: Automated 0.9, Semi-auto 0.85, Manual 0.7
- **Hierarchical Confidence System**: Implemented a hierarchical confidence system based on detection methods:
  - `DEPENDENCY_BASED` (0.95): package.json dependencies (most accurate)
  - `FILE_BASED` (0.9): Configuration file existence
  - `LOCAL_HEURISTIC` (0.8): Local file pattern matching
  - `KEYWORD_BASED` (0.7): User query keywords (least certain)
- **Updated Files**: Replaced hardcoded values with `AgentConfig` constants in:
  - `ProjectManager.ts`, `ProjectDetector.ts`, `FileMutationManager.ts`
  - `UpdateFileToolHandler.ts`, `tokenUtils.ts`, `ActionMapper.ts`
  - `ErrorManager.ts`, `KeywordSelector.ts`
- **Documentation**: Created `PROBABILITY_BASED_DECISIONS.md` documenting all probability-based decision logic, improvements, and removed logic history.

## v7.1.0 (Prompt File Consolidation and Structure Improvements)
- **Prompt File Consolidation**: Consolidated scattered prompt files by category to significantly improve maintainability.
  - `base/` directory (11 files) → consolidated into `base.ts`: All basic prompt components including `agentRole`, `objective`, `rules`, `fileOperations`, `codeVsScript`, `codeGeneration`, `errorCorrection`, `outputFormat`, `tools`, `terminalCommands`, `commonRules` unified into a single file
  - `rules/` directory (2 files) → consolidated into `rules.ts`: `executionFirst` and `errorRetry` rule prompts unified
  - `task/` directory (3 files) → consolidated into `task.ts`: `CodeWorkPrompt`, `ExecutionWorkPrompt`, and `summarize` task-type prompts unified
  - `phase/` directory (2 files) → consolidated into `phase.ts`: `investigation` and `execution` phase prompts unified
- **Import Path Cleanup**: Updated all prompt import paths across the codebase to match the consolidated file structure for consistency.
- **Code Structure Improvement**: Reduced prompt files from 18 to 4, making file navigation and modification much easier.

## v7.0.0 (Refactoring & Analysis Response Generation Logic Improvements)
- **Refactoring: Improved `ripgrep_search` Result Parsing**: Modified `RipgrepSearchToolHandler` to return the original `SearchResult[]` array as `rawResults` alongside formatted results, enabling the auto-answer generation logic to parse correctly.
- **Refactoring: Improved Function Name Extraction Logic**: Changed the priority to extract function names from user queries first. Now accurately extracts "test" from queries like "test 함수가 어디에 있어?".
- **Refactoring: Prevent Duplicate Auto-Investigation Tool Execution**: Added auto-investigation tools to `executedInTurn` to prevent duplicate execution when the LLM calls the same tool again.
- **Analysis Response Generation Logic Improvements**: Enhanced to automatically generate answers when `ripgrep_search` results exist, even without `investigation_done` token. Generates answers by directly parsing search results without LLM calls.
- **Fixed Duplicate Output Issue**: When `ripgrep_search` results exist, the auto-answer generation logic takes priority over LLM-generated direct answers to prevent duplicate output.
- **`ripgrep_search` Pattern Parsing Error Handling**: Added validation logic to skip calls and add warnings when `ripgrep_search`'s `pattern` parameter is missing or empty.
- **Summary Korean Language Enforcement**: Added explicit instructions to the prompt to ensure summaries generated in the REVIEW phase are always output in Korean.

## v6.10.0 (Execution-First Detection Logic Unification & FSM Consistency)
- **Execution-First Detection Logic Unification**: Unified execution-first task detection into a common function `isExecutionFirstTask()` to apply consistent criteria across all locations. Tasks like `code_generate` and `code_run` are now consistently handled in both initial and subsequent detections, ensuring correct FSM state transitions, tool permissions, and retry/auto-transition behavior.
- **Logical Operator Precedence Clarification**: Added parentheses to clarify logical operator precedence in phase transition conditions for correct behavior.

## v6.9.0 (Analysis Response Display Fix)
- **Analysis Response Panel Display Fix**: Fixed the issue where analysis responses generated after `investigation_done` were not displayed in the panel. Changed the `'Assistant'` sender to `'CODEPILOT'` in `WebviewBridge.receiveMessage` so that the webview processes it correctly.

## v6.8.0 (Test Retry Logic Improvements & TypeScript Validation Order Optimization)
- **EXECUTION Phase Tool Execution Guarantee**: Fixed the issue where `run_command` was blocked in EXECUTION phase. Now, fix commands suggested by the LLM after test failures (e.g., `npm install`) execute properly.
- **Test Retry Prompt Enhancement**: Added guidance "Do not create files that already exist" to the test retry prompt to prevent duplicate file creation issues.
- **Improved REVIEW Transition After Test Success**: Enhanced logic to immediately transition to REVIEW phase after test success. When all tools are blocked in EXECUTION phase and there are no remaining tasks, the system automatically transitions to REVIEW.
- **TypeScript Validation Order Optimization**: Improved validation order for TypeScript projects to run `tsc --noEmit` first, then lint tools. Type errors are checked before lint errors.
- **Settings Panel UI Synchronization Fix**: Fixed the issue where saved `autoTestRetryEnabled` value was not reflected in the toggle when reopening the settings panel.
- **Validation Command Decision Criteria**: When `getValidationCommand()` returns null, the system queries the LLM. null indicates that no validation command can be safely determined through rule-based logic, and the LLM is used only as a fallback inference mechanism in this case. This design handles project types or special cases not covered by hardcoded rules.

## v6.7.0 (Auto Test Control & Investigation Phase Improvements)
- **Auto Test Execution Control**: Automated tests (Smoke Test, Lint Check) and error messages are now only executed and displayed when the "auto test retry" setting is enabled. When disabled, tests are skipped entirely and no error messages are shown.
- **INVESTIGATION Phase Tool Transition**: When execution tools are blocked in the INVESTIGATION phase, the system now automatically transitions to EXECUTION phase and executes the tools together, ensuring smooth phase transitions.
- **Unified File List Format**: INVESTIGATION phase now uses the same `[D] [F]` formatted file inventory as EXECUTION phase for consistency. The `formatFileTree` method has been removed in favor of `buildProjectInventorySection`.

## v6.6.0 (LLM Call Optimization Complete & Execution Guarantee)
- **LLM Call Optimization Complete**: 
  - Completely removed LLM calls in the DONE phase.
  - Ensured that both test pass and failure cases go through the REVIEW phase for summary generation.
  - Prevented duplicate test execution before loop termination to eliminate unnecessary LLM calls.
- **EXECUTION Phase Execution Guarantee**: 
  - Strengthened FSM transition conditions to prevent transitioning to EXECUTION when only a plan is provided without tool calls during INVESTIGATION.
  - Improved the EXECUTION phase to call the LLM when a plan item has no executable tool calls, ensuring all plan items are actually executed.
  - All plan items are now guaranteed to be executed and files are created.
- **CODE/ASK Color Swap**: Swapped colors so CODE mode is blue and ASK mode is green for better visual distinction.

## v6.5.0 (LLM Call Optimization & Execution Logic Improvements)
- **EXECUTION Phase Execution Logic Improvement**: Fixed the issue where the system would transition to EXECUTION phase even when only a plan was provided without tool calls during INVESTIGATION. Now, the system only transitions to EXECUTION after investigation is complete, preventing premature termination without file creation.
- **Plan Item Execution Guarantee**: Improved the EXECUTION phase to call the LLM when a plan item has no executable tool calls, ensuring all plan items are actually executed and files are created.
- **LLM Call Optimization**: 
  - Confirmed and fixed that no LLM calls occur in the DONE phase.
  - Improved flow so that both test pass and failure cases go through the REVIEW phase for summary generation.
  - Prevented duplicate test execution before loop termination to eliminate unnecessary LLM calls.
- **CODE/ASK Color Swap**: Swapped colors so CODE mode is blue and ASK mode is green for better visual distinction.

## v6.4.0 (Investigation Phase Strengthening & UI Improvements)
- **Enhanced Investigation Phase Prompts**: Strengthened prompts to strictly prohibit including execution tools (`<create_file>`, `<update_file>`, etc.) alongside `<plan>` tags in the same response. The investigation phase now clearly instructs to use only read-only tools and submit plans only.
- **Task Plan Popup UI Improvement**: Fixed the issue where task titles and details were displayed on the same line in the task plan popup. Titles and details are now displayed on separate lines for improved readability.
- **Verification Step-by-Step Status Display**: Real-time display of code verification (Smoke Test, Lint Check) progress. Each step (project type detection, Smoke Test execution, Lint Check execution) is shown in `processSteps` so users can clearly track the verification process.
- **REVIEW Phase LLM Call Optimization**: Fixed the issue where the LLM was called twice during summary generation in the REVIEW phase. `generateVerifiedSummary` now only calls the LLM when there is no original summary, optimizing it to a single call.

## v6.3.0 (Lightweight FSM & Plan-First Architecture)
- **Lightweight FSM Implementation**: Introduced `AgentStateManager` for centralized state management with strict transition rules and output contracts.
- **State Transition Validation**: Enforces valid state transitions (INVESTIGATION → EXECUTION) with pre-transition condition checks.
- **Output Contract Enforcement**: Each state (INVESTIGATION, EXECUTION) has explicit rules for allowed outputs (plan tags, tool calls, text-only responses).
- **Blind Planning Prevention**: INVESTIGATION phase now requires tool calls or investigation history before transitioning to EXECUTION, preventing plans without information gathering.
- **Batch File Reading**: `read_file` tool now supports reading multiple files in a single call using multiple `<path>` tags or a `<paths>` parameter.
- **Automatic Plan Item Completion**: EXECUTION phase automatically marks plan items as done when LLM provides summary-only responses without tool calls.
- **Investigation History Tracking**: System tracks investigation tool usage to validate state transitions and prevent premature execution.

## v6.2.0 (High-Performance Search & Token Efficiency)
- **Ripgrep-Powered Fast Search**: Added `ripgrep_search` tool for high-speed keyword and regex searching in large codebases.
- **Contextual Results**: Search results now include multi-line code context (before/after matching lines) with pipe separators for better LLM understanding.
- **Token Usage Optimization**: 
  - Prohibited intermediate text summaries during tool calls to save tokens and improve speed. 
  - Detailed Korean summaries are now only provided at the final turn of the task.
- **Improved JSONC Parsing**: Added support for comments and trailing commas in configuration files (e.g., `tsconfig.json`, `jsconfig.json`) using a custom JSONC cleaner.
- **Gemini Plan Parsing Fix**: Added explicit prompt instructions to prevent Gemini from using numbered lists in plans, enforcing the required XML structure.
- **Log Management**: Truncated long LLM responses and removed redundant logging in the console to improve developer experience.

## v6.1.1 (True LLM-Only Intent & Bug Fixes)
- **True LLM-Only Intent Detection**: Completely removed `keywords` dependency from the intent analysis pipeline. The system now relies 100% on LLM reasoning for classification without any heuristic keyword matching.
- **UI Simplification**: Removed the redundant "Keyword Analysis" step from the processing steps UI for a faster and cleaner agentic flow.
- **Intent Engine Stability**: Fixed critical compilation errors in the `IntentDetector` by restoring subtype-to-category mapping logic.

## v6.1.0 (UI Refinement & Unified Intent Detection)
- **Model Selection UI Refinement**: Added visual color bars (Gemini: Blue, Ollama: Orange) to the chat model dropdown for better differentiation and consistent styling.
- **LLM-Only Intent Detection Engine**: Refactored `IntentDetector` to rely 100% on the currently active LLM (Gemini or Ollama) for intent classification, removing all hardcoded keyword matching and heuristic fallbacks.
- **Branding Consistency (CODEPILOT)**: Standardized branding to "CODEPILOT" across the chat panel, settings UI, and localization files.
- **Gemini Model Optimization**: Updated the default Gemini model to `gemini-3-pro-preview` and refined selection options.
- **Responsive UI Layout**: Fixed layout issues in the settings panel where dropdowns would not expand correctly on narrower screens.
- **Simplified Features**: Removed the unused "Planning (Reasoning)" feature to provide a cleaner and more focused user experience.

## v6.0.0 (LLM-Only Intent & Intelligent Error Handling)
- **LLM-Only Intent Detection**: Completely removed hardcoded keyword matching in favor of 100% LLM-driven intent classification for higher accuracy and flexibility.
- **Intelligent Repeated Failure Detection**: Implemented logic to detect and alert the LLM when the same tool fails repeatedly, providing specific guidance (e.g., checking file existence) to encourage self-correction.
- **Enhanced UI Localization**: Replaced raw English tool names with user-friendly Korean labels in the process steps UI.
- **Improved Task Queue Visibility**: Fixed rendering issues where the task queue popup was hidden or non-interactive in the webview.
- **Softened Agent Constraints**: Updated the Investigation phase to allow more autonomous agent behavior, permitting the LLM to decide when to move from investigation to execution.
- **Aggressive Self-Correction**: Enhanced API-level retries for empty responses and added strict rules to ensure every turn produces actionable output.

## v5.2.2 (LLM Autonomy & Intent Refactor)
- **Enhanced Intent Refactor**: Moved towards a more LLM-driven intent detection, reducing reliance on hardcoded keywords for better flexibility.
- **LLM Self-Correction (Ollama)**: Implemented a robust self-correction logic that automatically retries and nudges the model if it provides internal thoughts (`thinking`) without actionable XML tool calls.
- **Action-First System Prompts**: Strengthened global rules to enforce that every turn must include at least one XML tool call, treating explanation-only responses as system errors.
- **Cleaned Conversation Loop**: Removed redundant manual nudging in favor of improved system prompts and API-level self-correction for a more natural agentic flow.

## v5.2.1 (Task Queue UI Revolution & Reliability)
- **Floating Task Queue**: Re-introduced the Task Queue as a dynamic, React-based floating popup.
  - **Live Status Sync**: Real-time synchronization of task status (`pending`, `in_progress`, `done`).
  - **Visual Progress**: Completion progress indicator (e.g., "2/5 tasks done") in the header.
  - **Animated Status**: Pulsing circle icons for active tasks to provide clear visual feedback.
  - **Control Features**: Minimize/maximize and close functionality for a less intrusive UI.
- **Reliability Improvements**:
  - **Automatic Cleanup**: Task queue is now automatically cleared and hidden when a new request starts.
  - **Turn-based Deduplication**: Prevents duplicate tool execution (e.g., redundant `read_file` calls) within a single turn to declutter UI logs.
  - **Smart Task Completion**: Automatically marks remaining tasks as done when the agent successfully finishes the loop.
  - **Side-Effect Tracking**: Immediate status updates for tasks causing file or system changes.
- **Log Optimization**: Removed unnecessary internal system headers from console output for a cleaner debugging experience.

## v5.2.0 (Investigation Manager & UI/UX Transformation)
- **Investigation Manager**:
  - **Read-Only Phase**: Enforces a mandatory "Investigation" phase before any code modification. Only read tools (`read_file`, `list_files`, `search_files`) are allowed.
  - **Strict Phase Transition**: Transition to the "Execution" phase occurs only after a valid, strictly formatted `<plan>` is submitted and approved.
  - **Safe Deletion Rules**: Implemented strict rules against arbitrary file deletion. `remove_file` is only permitted when explicitly requested by the user or specified in an approved plan.
- **UI/UX Revolution**:
  - **Phase Labels**: Real-time status now includes `[Investigation]` and `[Execution]` labels to clearly show the agent's current mode.
  - **Consolidated Status**: Removed `TaskQueue` panel and top `ProcessingSteps`. All progress is integrated into a terminal-style loading area with typing animation.
  - **Conditional Sticky Bar**: The processing status bar stays inline when visible and sticks to the top when scrolled out of view.
- **Enhanced Agentic Loop**:
  - **Strict Plan Format**: Enforces a strict XML structure for plans (`<plan><item>...`) to ensure clarity and actionable steps.
  - **Interleaved Execution**: Displays LLM reasoning and tool results (with code previews) in sequence for maximum transparency.
  - **Smart Nudging**: Nudges the LLM to take action or create plans when it only provides analysis without proceeding.
- **Robust Tooling & Intent Detection**:
  - **Advanced update_file**: Implemented fuzzy matching, block anchors, and structural matching for resilient file edits.
  - **Intent Detection Fix**: Improved classification for TypeScript compilation and lint errors, correctly routing them to code modification tasks.
  - **Smart list_files Filtering**: Automatically excludes `node_modules`, `.git`, and build folders from listings.

## v5.1.3 (External API Removal)
- **External API removal**: Removed all external API integrations (Weather, Stock, News APIs)
  - Removed Weather API integration (Korean Meteorological Administration API)
  - Removed Stock API integration (Alpha Vantage API)
  - Removed News API integration (Naver News API)
  - Removed all related UI components, settings, and handlers
  - Cleaned up configuration entries and state management code

## v5.1.2 (LLM Autonomy & Enhanced File Modification)
- **LLM autonomy**: Removed system-generated follow-ups. LLM now autonomously decides when to retry failed operations and generate subsequent tool calls
- **Enhanced update_file matching**: 
  - Line-trimmed matching: Compares lines after trimming whitespace (preserves indentation structure)
  - Block anchor matching: Uses first/last lines as anchors for 3+ line blocks
  - Improved error messages: Includes latest file content when SEARCH pattern fails, allowing LLM to self-correct
- **Korean prompt translation**: All tool-related prompts translated to Korean for better LLM understanding.
- **CDATA section handling**: Added `removeCDataSections()` utility to handle LLM-generated CDATA sections in file operations.
- **Error handling improvements**: Failed `update_file` operations now include latest file content in error messages, enabling LLM to retry with correct patterns.

## v5.1.1 (Tree-sitter Based Function Location Search & read_file Display Improvement)
- **Tree-sitter integration**: Uses tree-sitter AST parsing instead of regex to accurately find function/class locations.
- **read_file display improvement**: Shows only the context around a specific line (5 lines above and below) instead of the entire file for better readability.
- **Task queue count alignment**: Excludes `list_files` from successCount/failCount so the task queue display count matches the execution completion count.
- **Duplicate display removal**: Follow-up tool call `read_file` results are not displayed to prevent duplicate output.
- **Automatic function location search**: Extracts function names from user queries and uses tree-sitter to find accurate declaration locations.

## v5.0.11 (Processing Steps UI Improvement)
- **ProcessingSteps status update fix**: Fixed issue where `updateProcessingStatus` messages were not displaying progress when no initial step was set. Now automatically creates a new step if it doesn't exist when receiving status updates.
- **Debug logging**: Added console logging for `setProcessingStep` and `updateProcessingStatus` commands to help diagnose progress display issues.

## v5.0.10 (File Context Tracker Integration & Stability Guard)
- **FileContextTracker integration**: `FileContextTracker` is now wired into both `ContextManager.collectFileContext` and `ActionManager` so that files are only read after they have stabilized on disk.
- **Pre-action stability guard**: Before executing `CODE_GENERATION` and `FILE_OPERATION` actions, `ActionManager` calls `trackFile()` and `waitForFileStability()` to avoid reading half-written files when immediately re-collecting context.
- **Safer large-file handling**: Context collection waits briefly for file size/mtime to stop changing, reducing race conditions with auto-save or long writes.

## v5.0.9 (Unified Code Panel & Live Ollama Selector)
- **Single Codepilot panel**: CODE/ASK 모드를 하나의 Codepilot 패널에서 드롭다운으로 전환
- **Live Ollama model picker**: 상단 Model 드롭다운이 로컬 Ollama `/api/tags`에서 실시간 모델 목록을 불러와 선택/저장
- **UI 정리**: 기존 ASK 패널 제거, 코드 입력창/아이콘 정돈

## v5.0.8 (Code Analysis & File Search Enhancement, Structure Refactoring)
- **AST 기반 코드 분석**: Tree-sitter를 통한 고급 코드 분석 기능 추가
  - 코드 정의 이름 목록 추출 (`listCodeDefinitionNames`)
  - 정의 사용 위치 검색 (`findDefinitionUsages`) - import, call, reference, extend, implement
  - import/export 관계 기반 관련 파일 찾기 (`findRelatedFiles`)
- **Regex 기반 파일 검색**: ripgrep을 통한 빠른 파일 검색 기능 추가
  - VS Code 내장 ripgrep 또는 시스템 ripgrep 사용
  - ripgrep 없을 때 네이티브 검색으로 자동 폴백
  - 검색 결과에 주변 컨텍스트 포함
  - 파일 패턴 필터링 (include/exclude)
- **구조 리팩토링**:
  - `src/core/file/` → `src/core/action/file/`로 이동 (FileChangeTracker)
  - `src/core/context/file/` 구조로 파일 관련 컨텍스트 수집 기능 통합
    - FileContext, RelevantFilesFinder, FileSearcher를 한 곳에 모음
- **Files Added**:
  - `src/core/context/file/FileSearcher.ts` - Regex 기반 파일 검색
  - `src/core/project/codeParser/types.ts` - AST 분석 타입 정의
- **Files Moved**:
  - `src/core/file/` → `src/core/action/file/` (FileChangeTracker)
  - `src/core/context/FileContext.ts` → `src/core/context/file/FileContext.ts`
  - `src/core/context/RelevantFilesFinder.ts` → `src/core/context/file/RelevantFilesFinder.ts`

## v5.0.7 (File Change Tracking & Verification)
- **File Change Tracking**: Track all file changes (create, modify, delete) with before/after states
  - Automatic tracking: All file operations through ActionManager are automatically tracked
  - Change history: View complete change history for any file
  - Diff generation: Automatic diff generation showing added, removed, and modified lines
  - Revert capability: Revert files to any previous change point
  - Persistent storage: All change history stored in VS Code globalState
  - Change listeners: Register callbacks to be notified of file changes
- **Files Added**:
  - `src/core/action/file/FileChangeTracker.ts` - File change tracking and verification
  - `src/core/action/file/types.ts` - Type definitions (FileChange, FileChangeHistory, FileChangeDiff, RevertOptions)
  - `src/core/action/file/index.ts` - Barrel file

## v5.0.6 (Context History Management & Auto Summarization)
- **Context History Management**: Track context changes per message, monitor context size, and manage checkpoints
  - Context update tracking: Record file, selection, cursor, terminal, and error context changes
  - Size monitoring: Real-time monitoring of context size (character count, token count)
  - Automatic compression: Token usage-based automatic compression strategies (none, lastTwo, half, quarter)
  - Checkpoint management: Save and restore context snapshots at specific points
- **Automatic Summarization**: Automatically summarize conversations when context size exceeds limits
  - LLM-powered summarization: Generate comprehensive summaries using LLM (10-section structure)
  - Auto-trigger: Automatically triggers when token usage exceeds 95%
  - Summary storage: Permanently stores summaries in VS Code globalState
  - Session continuation: Converts summaries to continuation prompts for seamless session resumption
  - Deleted range tracking: Tracks deleted message ranges with `conversationHistoryDeletedRange`
- **Dual History Structure**: Separate API history and UI messages for future expansion
- **Files Added**:
  - `src/core/context/ContextHistoryManager.ts` - Context history management
  - `src/core/context/ConversationSummarizer.ts` - Conversation summarization
  - `src/core/context/types/contextHistory.ts` - Type definitions
  - `src/core/context/prompts/task/summarize.ts` - Summarization prompt

## v5.0.5 (FrameworkAdapter removal )
- Removed FrameworkAdapter structure: Transitioned to approach where LLM reads project files (package.json, pom.xml, etc.) to determine appropriate commands and configurations.
- Framework directory removed: Eliminated `src/core/project/framework/` directory (TypeScriptAdapter, SpringBootAdapter, IFrameworkAdapter, FrameworkAdapterFactory).
- Prompt improvements: Added instructions for LLM to read project files first before generating commands or configurations.
- Simplified architecture: Framework-specific prompts now use name-based matching only, with LLM handling dynamic detection from project files.

## v5.0.4 (Chat bubble layout fix)
- Chat webview bubbles now stretch to full panel width and remove background/border padding for clearer, text-first display.

## v5.0.3 (Framework prompt improvements & fixes)
- Framework prompt improvements: Added "check files first" priority and "new project only" conditions to Vite, NodeTypeScript, and Express prompts.
- Removed hardcoded versions from framework prompts: LLM now reads project files to determine appropriate configurations.
- Fixed ESM import errors in extension.ts: Added explicit `.js` extensions to all dynamic imports for Node16/NodeNext module resolution.
- Task queue display: Actions are now registered in task queue and status updates in real-time during execution.

## v5.0.2 (Complete prompt system integration)
- All prompts consolidated into `context/prompts/`: removed `commonGuides.ts` and `helpers.ts`, moved all prompt guides to appropriate component directories.
- Unified OS prompt access: removed `os/helpers.ts`, integrated into `PromptComposer.getOSPrompt()` public method.
- Adapter simplification: GptAdapter and GemmaAdapter now directly use PromptComposer for consistent prompt generation.
- Complete deduplication: eliminated all prompt-related code duplication, simplified architecture.

## v5.0.1 (Prompt system refactor)
- New modular prompt stack (`PromptComposer`) combining base/OS/LLM/framework/task components.
- OSAdapter & FrameworkAdapter context is now injected into prompts for consistent instructions.
- GptAdapter uses PromptComposer; legacy `COMMON_SYSTEM_PROMPTS` removed.
- Version bumped to 5.0.1.

## Features

<img src="https://drive.google.com/uc?export=view&id=1Qnb_rdSzjfSR34o4lZB5nDCCTuwD7lLJ" width="700" height="500"/>
<img src="https://drive.google.com/uc?export=view&id=1BpN9SVQiEnxi0R67NFzQceRkhgQyogic" width="700" height="500"/><br>
<img src="https://drive.google.com/uc?export=view&id=1KYN5wO_lE8lBgyrldAtMpKReJYUYnwTO" width="700" height="500"/><br>
<img src="https://drive.google.com/uc?export=view&id=1sADJQZCmOatGiHyeop1pa0dipg_Zs5SP" width="700" height="500"/><br>

- **Planning**: Select a local Ollama reasoning model to generate an actionable to-do plan and manage items in the new Plan Queue panel (run/complete/cancel/persist)
- **Bash Script Execution Fix**: Multi-line bash constructs (if/then/else/fi) are now merged into single commands and executed in the same terminal session, preventing syntax errors

### 🤖 AI-Powered Code Assistance
- **Multi-Model AI Support**: 
  - **Gemini 2.5 Pro Flash**: Google's advanced LLM for intelligent code generation and analysis
  - **Ollama Integration**: Local Ollama server integration for offline AI processing
    - **gpt-oss:120b-cloud**: 120B parameter model for advanced reasoning and code generation
    - **gemma3:27b**: 27B parameter model with 128K token limit for code generation and analysis
    - **llama3.1:8b**: 8B parameter model optimized for general-purpose tasks
    - **codellama:7b**: 7B parameter model specialized for code generation and analysis
    - **gemma2:2b**: 2B parameter model for quick responses and basic tasks
    - **banya-llama31-lora-merged:latest**: Custom fine-tuned model for specialized tasks
- **Smart Context Management**:
  - **Intelligent File Filtering**: Automatically includes all `src/` directory files and filters other files based on keywords
  - **Framework-Aware Context**: Automatically detects project type and includes relevant configuration files
    - Node.js: `package.json`, `tsconfig.json`, build configs
    - Java/Spring: `pom.xml`, `build.gradle`, application properties
    - Python Django/Flask/FastAPI: `manage.py`, `requirements.txt`, `main.py`
    - And more frameworks supported
  - **Context History Management**: Track and manage context changes across conversations
    - Context update tracking per message (file, selection, cursor, terminal, error)
    - Real-time context size monitoring (character count, token count)
    - Automatic compression when approaching limits
    - Checkpoint management for context snapshots
  - **Automatic Summarization**: Automatically summarize long conversations to prevent context window overflow
    - LLM-powered comprehensive summaries (10-section structure)
    - Auto-trigger when token usage exceeds 95%
    - Permanent summary storage in VS Code globalState
    - Seamless session continuation with continuation prompts
  - **File Change Tracking**: Track all file modifications with complete history
    - Automatic tracking of all file operations (create, modify, delete)
    - Complete change history with before/after states
    - Diff view showing added, removed, and modified lines
    - Revert to any previous change point
    - Persistent storage in VS Code globalState
  - **Dynamic Model Selection**: Switch between cloud and local AI models in settings
  - **Intuitive UI**: Simplified model selection (Gemini vs Ollama) with specific model selection below
- **Dual-Mode Interface**: 
  - **CODE Tab**: Specialized for code generation, modification, and project-specific tasks
  - **ASK Tab**: General Q&A and real-time information queries
- **Context-Aware Responses**: Analyzes your project structure and existing code for relevant suggestions
- **Natural Language Processing**: Understands complex requests in plain English
- **Local AI Processing**: Full offline capability with Ollama integration

### 🚀 **NEW in v4.10.0 - Manager-Based Architecture & Smart Action System**

#### **Manager-Based Architecture**
- **Action Manager**: Automatically extracts and validates actions from LLM responses
  - 7 action types: CODE_GENERATION, FILE_OPERATION, TERMINAL_COMMAND, ANALYSIS, VERIFICATION, SEARCH, REFACTOR
  - Smart validation with dependency checking
  - Circular dependency detection
  - Permission control and dangerous command detection
- **Execution Manager**: Process lifecycle management with error detection
  - Synchronous/asynchronous command execution
  - Process monitoring (PID tracking)
  - 10 error types auto-detection (port conflict, permission denied, syntax error, etc.)
  - Long-running process support (dev servers, build processes)
  - Grace period shutdown (SIGTERM → SIGKILL)
- **Terminal Manager**: Terminal session lifecycle management
  - Multi-terminal session management
  - Command history tracking (1000 entries)
  - Most-used command statistics
  - Session reuse and auto-creation

#### **Smart Action Extraction**
- **Code Block Recognition**: Automatically detects ` ```language:path/to/file ... ``` ` patterns
- **Command Extraction**: Recognizes bash/shell code blocks and execution requests
- **File Operation Detection**: Identifies create/delete/rename/move operations
- **Confidence Scoring**: Action extraction with 85-95% confidence scores
- **Validation System**: Required field checking, path validation, dangerous command blocking

#### **Error Detection & Recovery**
- **10 Error Types Supported**: PORT_CONFLICT, COMMAND_NOT_FOUND, PERMISSION_DENIED, SYNTAX_ERROR, RUNTIME_ERROR, NETWORK_ERROR, FILE_NOT_FOUND, OUT_OF_MEMORY, TIMEOUT, UNKNOWN
- **Port Conflict Detection**: Automatically detects EADDRINUSE and suggests solutions
- **Stack Trace Parsing**: Extracts file/line/column from error messages
- **Auto Fix Suggestions**: Intelligent fix recommendations for common errors
- **Error History**: Tracks and analyzes error patterns

#### **Integration Layer**
- **ManagerAdapter**: Seamless integration with existing code
- **Flag-Based Control**: Enable/disable new system via `useNewManagerSystem` flag
- **Graceful Fallback**: Falls back to legacy system on error
- **Dual Execution**: New action system + legacy UI processor run in parallel

### 🚀 **NEW in v4.9.3 - Tree-sitter Code Parsing & Framework Abstraction**

#### **Tree-sitter Integration**
- **Code Structure Parsing**: Automatically extracts code definitions (classes, functions, interfaces) from project files
- **Token Optimization**: Sends only code structure instead of full file contents to LLM (70-80% token reduction)
- **Multi-language Support**: TypeScript, JavaScript, Python, Java, and more via WASM parsers
- **Smart Timeout**: 3-second timeout for parsing to prevent blocking
- **On-premise Ready**: All WASM files bundled, no external dependencies required

#### **Framework Abstraction Layer**
- **Unified Architecture**: Clean abstraction layers for OS, LLM, and Framework detection
- **Framework Detection**: Automatic detection of TypeScript, Spring Boot, and other frameworks
- **OS-Specific Handling**: Darwin (macOS), Windows, Linux adapters for terminal/file operations
- **LLM Adapters**: Pluggable LLM adapters (GPT, Gemini, Ollama) with model-specific prompts
- **Build Tool Awareness**: Framework-specific commands (npm, maven, gradle) automatically detected

#### **Enhanced Code Context**
- **Definition-Only Context**: LLM receives class/function signatures without implementation details
- **Faster Response**: Reduced token usage leads to faster LLM responses
- **Better Understanding**: Structured code definitions help LLM understand project architecture
- **Automatic Integration**: Works seamlessly in CODE tab for code-related queries

### 🚀 **NEW in v4.6.0 - Plan Queue Management & Bash Script Execution Fix**

#### **Plan Queue Management**
- **Planning Model Selection**: Select specialized reasoning models from local Ollama installations for plan generation
- **Plan Queue Panel**: New webview panel to manage actionable to-do items with run/complete/cancel/persist functionality
- **Structured Plan Generation**: Convert user queries into organized, actionable plan items using reasoning LLMs
- **Plan Item Management**: Individual control over each plan item with status tracking and execution

#### **Bash Script Execution Fix**
- **Multi-line Script Merging**: Complex bash constructs (if/then/else/fi) are automatically merged into single commands
- **Single Session Execution**: Scripts execute in the same terminal session using heredoc/here-string syntax
- **Syntax Error Prevention**: Eliminates "unexpected end of file" and "unexpected token" errors from line-by-line execution
- **Command Normalization**: Improved command preprocessing for idempotent, OS-specific shell commands

### 🚀 **NEW in v4.5.0 - Auto Command Execution & Individual Callout Execution Status**

#### **Auto Command Execution Feature**
- **Auto Execution Toggle**: Enable/disable automatic execution of bash/powershell/cmd commands from LLM responses in settings
- **Smart Execution Control**: Automatically detects commands in LLM responses and executes based on settings
- **Real-time Status Display**: Shows "Executing commands..." status in real-time during auto execution
- **Manual Execution Support**: When auto execution is disabled, manually click Run buttons to execute commands

#### **Individual Callout Execution Status Display**
- **Individual Execution Animation**: Each shell script callout box displays its own independent "Executing..." animation
- **Real-time Feedback**: When Run button is clicked, only that specific callout box shows executing status
- **Global Display for Auto Execution**: When auto command execution is enabled, all callout boxes show executing status
- **Visual Distinction**: Clear separation between Auto Correcting and Run button execution status

#### **Settings System Improvements**
- **Settings Registration Complete**: `aidevIde.autoExecuteCommands` setting is now properly registered in package.json
- **Global Settings Support**: Saved as user global settings for consistent behavior across all workspaces
- **Real-time Settings Reflection**: Dynamic settings system that applies changes immediately

### 🚀 **NEW in v4.4.1 - Executing Commands Step & Stability**

#### **Commands-Only Refinement**
- Adds an Executing Commands step: detects bash/powershell callouts and re-asks the LLM to output a single, OS-specific commands-only code block (Windows=powershell, macOS/Linux=bash)
- Strict system prompt prohibiting narrative/mixed-OS instructions; preserves correct execution order

#### **Processing Steps**
- Ensure only one processing steps box is rendered (React-only); add executing in the step order

#### **Auto Error Correction**
- New toggle in Settings (disables retry spinner when off)
- Persists across reloads (workspace scope)

### 🚀 **NEW in v4.3 - OUTPUT Log Control & Enhanced Bash Command Execution**

#### **OUTPUT Log Control Feature**
- **Complete Log Control**: Enable/disable all logs displayed in VS Code's OUTPUT panel
- **Terminal Log Optimization**: Easier terminal log checking when OUTPUT logs are disabled
- **Real-time Setting Changes**: Log control settings applied immediately
- **Memory Optimization**: Reduced memory usage by clearing log entries when disabled

#### **Enhanced Bash Command Execution**
- **New Terminal Creation**: "Run" button in bash callouts creates new VS Code terminal for command execution
- **Sequential Command Execution**: Safely executes multiple commands with 500ms intervals
- **Enhanced Debugging**: Detailed logging system to track command execution process
- **Terminal Preparation Time**: Improved stability by waiting for terminal to be fully ready

#### **Auto Error Correction Settings**
- **Customizable Retry Count**: Set automatic error correction attempts from 1-10 times
- **Real-time Setting Reflection**: Error correction count adjustments applied immediately
- **Status Display**: View current error correction count setting in UI

### 🚀 **NEW in v4.2 - Intelligent Auto Error Correction System**

#### **Automatic Terminal Error Detection & Correction**
- **Real-time Error Monitoring**: Automatically detects errors in terminal output
- **Smart Error Pattern Recognition**: 
  - Java environment variable issues (JAVA_HOME, PATH)
  - Maven POM configuration errors (spring-boot.version variables)
  - Port conflicts (8080 port already in use)
  - Dependency download failures
  - Java version compatibility issues (UnsupportedClassVersionError)
- **LLM-Powered Error Analysis**: Uses AI to understand error root causes
- **Automatic Command Correction**: Suggests and executes corrected commands
- **Retry Mechanism**: Intelligent retry with cooldown periods
- **Dynamic Error Pattern Learning**: Learns new error patterns and solutions

#### **Enhanced Processing Steps Visualization**
- **React-based Dynamic UI**: Real-time processing step display with typing animations
- **Auto-Correcting Indicator**: Visual feedback when error correction is active
- **Step-by-Step Progress**: Shows analysis, correction, and retry steps
- **Blinking Cursor Effects**: Engaging UI with typing and blinking animations

#### **Comprehensive Error Support**
- **Maven Build Errors**: MojoExecutionException, ProjectBuildingException
- **Spring Boot Issues**: Version compatibility, POM configuration
- **Java Environment**: JDK/JRE issues, class version mismatches
- **Network Issues**: Connection failures, server unavailability
- **File System**: Permission denied, file not found errors

### 🚀 **NEW in v4.1 - Enhanced Settings UI & Configuration Management**

#### **Improved Ollama Configuration**
- **Local Ollama Section**: Dedicated section for local machine Ollama configurations
- **Remote Server Section**: New section for remote Ollama server configurations
- **Server Type Toggle**: Easy switching between local and remote server types
- **Flexible Model Configuration**: 
  - Local: Automatic model detection from Ollama server
  - Remote: Manual model name input (e.g., `gemma3:27b`)
- **Enhanced User Experience**: Cleaner, more intuitive settings interface

#### **Streamlined Interface**
- **Removed Terminal Daemon**: Eliminated unnecessary Terminal Daemon configuration
- **Better Organization**: Clear separation between local and remote configurations
- **Consistent Styling**: Unified design language across all settings sections

### 🚀 **NEW in v4.0 - Revolutionary Terminal Auto-Error Correction System**

#### **Real-Time Terminal Monitoring & Error Detection**
- **Continuous Terminal Watching**: Monitors all terminal output in real-time using VS Code's terminal API
- **Intelligent Error Pattern Recognition**: Detects 50+ error patterns across multiple technologies
- **Context-Aware Error Analysis**: Analyzes error context including command history and project structure
- **Multi-Language Support**: Handles errors from various programming languages and build tools

#### **LLM-Powered Error Correction**
- **AI-Driven Error Analysis**: Uses local or cloud LLM to analyze error patterns and suggest corrections
- **Intelligent Command Generation**: Generates corrected commands based on error context and best practices
- **Learning from Context**: Considers project type, dependencies, and environment for accurate corrections
- **Multiple Correction Strategies**: Provides various correction approaches for complex errors

#### **Smart Auto-Retry System**
- **Automatic Command Retry**: Automatically executes corrected commands with intelligent retry logic
- **Retry Limit Management**: Prevents infinite loops with configurable retry limits (default: 3 attempts)
- **Cooldown Periods**: Implements smart cooldown periods to prevent rapid retry attempts
- **Success/Failure Tracking**: Tracks retry success rates and learns from previous attempts

#### **Comprehensive Error Pattern Support**
- **Maven/Java Ecosystem**:
  - Build failures (`BUILD FAILURE`, `MojoExecutionException`)
  - Compilation errors (`No compiler is provided`, `COMPILATION ERROR`)
  - JAVA_HOME configuration issues
  - Spring Boot version conflicts and startup failures
  - JAR file access problems and version compatibility issues
- **Node.js/npm Ecosystem**:
  - Package installation failures (`npm error code`, `ENOTEMPTY`)
  - Dependency conflicts and esbuild errors
  - Module resolution issues (`ERR_MODULE_NOT_FOUND`)
  - Vite configuration and startup problems
- **Python Ecosystem**:
  - Import errors and virtual environment issues
  - Package conflicts and dependency resolution
  - Python version compatibility problems
- **Docker & Containerization**:
  - Container build failures and image pull errors
  - Network connectivity issues
  - Port conflicts and resource allocation problems
- **Git & Version Control**:
  - Merge conflicts and authentication failures
  - Branch management issues
  - Repository access and permission problems

#### **Advanced Terminal Integration**
- **VS Code Terminal API Integration**: Seamlessly works with VS Code's built-in terminal
- **Cross-Platform Support**: Works on Windows, macOS, and Linux
- **Terminal Session Management**: Handles multiple terminal sessions and command history
- **Real-Time Output Processing**: Processes terminal output as it's generated

#### **Terminal Watching & Monitoring Features**
- **Continuous Background Monitoring**: Runs in the background to monitor all terminal activity
- **Command Execution Tracking**: Tracks command execution status and output
- **Error Detection Pipeline**: Real-time error detection with immediate response
- **User Notification System**: 
  - Real-time notifications for error detection
  - Progress updates for correction attempts
  - Success/failure feedback for retry operations
- **Terminal Output Analysis**: 
  - Parses terminal output for error patterns
  - Extracts relevant error information
  - Maintains command context and history
- **Smart Intervention**: 
  - Only intervenes when actual errors are detected
  - Respects user workflow and doesn't interrupt normal operations
  - Provides optional manual override for auto-correction

### 🔧 **NEW in v4.0 - Advanced DIFF Processing**
- **DIFF Callout Support**: Automatically processes DIFF format code blocks in AI responses
- **Smart File Modification**: Intelligently applies changes to existing files without data loss
- **Context-Aware Path Resolution**: Automatically resolves file paths relative to project structure
- **Preserves Existing Content**: Only modifies specified sections while preserving other file content
- **Batch DIFF Processing**: Handles multiple DIFF operations in a single response

### 📁 Advanced File Management
- **Smart File Selection**: Use the @ button to select specific files for context inclusion
  - **CODE Tab**: Full file operations with context-aware code generation and modification
  - **ASK Tab**: File selection for context-aware queries (read-only, no file operations)
- **Persistent File Context**: Selected files remain available across multiple conversations
- **Multi-File Operations**: Support for creating, modifying, and deleting multiple files simultaneously
- **Project Root Configuration**: Configurable project root path for accurate file operations
- **Auto File Updates**: Optional automatic file creation and modification based on AI suggestions
- **File Tag Management**: Visual file tags with individual remove and clear all functionality

### 🖼️ Visual Code Analysis
- **Image Support**: Upload images for code analysis and debugging
- **Drag & Drop Interface**: Easy image attachment via clipboard paste
- **Visual Context**: AI can analyze screenshots, diagrams, and code images


### 🔢 Token Management System
- **Input Token Calculation**: Automatic token counting for both Gemini and Ollama models
- **Model-Specific Limits**: 
  - Gemini 2.5 Flash: 1,000,000 input tokens, 500,000 output tokens
  - Gemma3:27b: 128,000 input/output tokens
  - DeepSeek R1:70B: 200,000 input/output tokens
  - CodeLlama 7B: 8,192 input/output tokens
- **Token Limit Warnings**: Automatic detection and user warnings when input tokens exceed model limits
- **Usage Monitoring**: Real-time token usage logging and percentage tracking
- **Safe Fallback**: Automatic fallback to default token limits for unknown model types

### ⚙️ Comprehensive Configuration
- **Multi-Model AI Configuration**:
  - **AI Model Selection**: Choose between Gemini 2.5 Pro Flash and Ollama
  - **Ollama Model Selection**: Select specific Ollama model (Gemma3:27b, DeepSeek R1:70B, or CodeLlama 7B)
  - **Ollama Server Setup**: Configure Ollama API URL and endpoint selection
    - Local Ollama: `http://localhost:11434` + `/api/generate`
    - External Server: `https://your-server.com` + `/api/chat`
    - Vessl AI Cluster: `https://model-service-gateway-xxx.eu.h100-cluster.vessl.ai` + `/api/chat`
  - **Dynamic Settings**: Enable/disable model-specific settings based on selection
  - **Automatic Migration**: Legacy 'ollama' settings automatically converted to specific model types
- **API Key Management**: Secure storage for API keys
  - Gemini API key configuration
  - **Banya License Management**: 
    - Encrypted license serial storage with AES-256-CBC
    - Firebase Firestore verification system
    - Read-only display of stored licenses
    - License deletion and re-verification capabilities
- **Source Path Configuration**: Customizable paths for code context inclusion
- **Auto-Update Settings**: Toggle automatic file operations on/off
- **Project Root Settings**: Flexible project directory configuration

### 💻 Enhanced Development Experience
- **Code Block Display**: Syntax-highlighted code blocks with language detection
- **Copy-to-Clipboard**: One-click code copying functionality
- **File Operation Tracking**: Real-time feedback on file creation, modification, and deletion
- **Diff Viewing**: Side-by-side comparison of original vs. AI-suggested code
- **Error Handling**: Comprehensive error reporting and user feedback

### 🔒 Security & Privacy
- **Secure API Storage**: VS Code SecretStorage for sensitive API keys
- **Encrypted License Storage**: AES-256-CBC encryption for Banya license serial numbers
- **License Protection**: CODE and ASK tabs require valid Banya license for activation
- **Local Processing**: No internet required for core functionality
- **Privacy-First**: Local code analysis without external data transmission

### 🎨 Modern User Interface
- **VS Code Integration**: Native VS Code theming and styling
- **Responsive Design**: Adapts to different screen sizes and themes
- **Intuitive Navigation**: Easy switching between CODE and ASK modes
- **Loading Indicators**: Visual feedback during AI processing
- **Message History**: Persistent chat history with clear conversation flow
- **Multi-Language Support**: Complete internationalization for 7 languages (Korean, English, Japanese, German, Spanish, French, Chinese)
- **License Status Display**: Visual indicators for license verification status and read-only license fields

### 🚀 Performance Features
- **Abort Controller**: Ability to cancel ongoing AI requests
- **Context Optimization**: Smart context length management for optimal performance
- **File Type Filtering**: Automatic exclusion of binary and non-code files
- **Memory Management**: Efficient handling of large codebases
- **Network Resilience**: Node.js HTTP module for reliable local network connections
- **Webview Safety**: Protected message handling to prevent disposed webview errors

### 🧪 What's New (2025/01/15)

#### Version 3.1.0 - Settings & Spring Support Update
- **Spring Project Auto-Detection**: Automatic detection and optimization for Spring Boot projects
  - Maven/Gradle build file prioritization (pom.xml, build.gradle, build.gradle.kts)
  - Spring-specific file patterns and directory structure recognition
  - Enhanced keyword extraction for Spring-related queries (controller, service, repository, entity, etc.)
- **Ollama Cloud Model Authentication**: Support for gpt-oss-120b:cloud model with authentication
  - Automatic authentication section display when cloud model is selected
  - Integrated ollama auth functionality in settings panel
- **Settings Panel Improvements**: Fixed model selection and display issues
  - Proper AI model selection persistence (Gemini/Ollama)
  - Correct Ollama sub-model display and selection
  - One-click project root configuration and removal
- **Enhanced Library Exclusion**: Comprehensive library directory filtering
  - Framework-specific library paths (node_modules, target, build, vendor, etc.)
  - Improved search performance by excluding build artifacts and dependencies
  - Better context relevance for actual project code

#### Version 3.2.0 - Enhanced Context & File Processing (2025/10/17)
- **Smart Context Management**:
  - **Intelligent File Filtering**: Automatically includes all `src/` directory files and filters other files based on keywords from user queries
  - **Framework-Aware Context**: Automatically detects project type and includes relevant configuration files
    - Node.js: `package.json`, `tsconfig.json`, build configs
    - Java/Spring: `pom.xml`, `build.gradle`, application properties  
    - Python Django/Flask/FastAPI: `manage.py`, `requirements.txt`, `main.py`
    - .NET: `*.csproj`, `appsettings.json`
    - Go: `go.mod`, `go.sum`
    - Rust: `Cargo.toml`, `Cargo.lock`
    - PHP: `composer.json`
    - Ruby: `Gemfile`
- **Enhanced File Processing**:
  - **Callout Cleanup**: Automatically removes callout artifacts (`*`, `**`, backticks, quotes) from file paths
  - **Path Validation**: Validates file paths to prevent dangerous operations and system directory access
  - **Long Response Handling**: Processes very long AI responses in chunks to prevent memory issues
  - **Improved Parsing**: Better regex patterns for file operations with fallback mechanisms
- **Bash Command Execution**:
  - **Comment Filtering**: Automatically filters out comment lines (`#`) from bash commands
  - **Inline Comment Removal**: Removes inline comments from command lines while preserving quoted content
  - **Run Button**: Added run button for bash callouts in chat responses (CODE and ASK tabs)
- **Error Handling & Recovery**:
  - **Graceful Degradation**: Fallback processing for failed operations
  - **Better Error Messages**: More descriptive error messages for file operations
  - **Memory Optimization**: Chunked processing for large responses

#### Version 3.2.1 - Terminal Auto-Error Correction & DIFF Processing (2025/10/17)

#### 🚀 **Version 4.1.0 - Enhanced Settings UI & Configuration Management (2025/10/18)**
- **Enhanced Ollama Configuration**: Separate sections for local and remote Ollama configurations
- **Server Type Toggle**: Easy switching between local machine and remote server types
- **Streamlined Interface**: Removed Terminal Daemon configuration for cleaner UI
- **Better Organization**: Clear separation between local and remote configurations
- **Consistent Styling**: Unified design language across all settings sections

#### 🚀 **Version 4.0.0 - Revolutionary AI-Powered Development Experience (2025/10/18)**

**🎯 Major Features:**

- **🚀 Revolutionary Terminal Auto-Error Correction System**:
  - **Real-time Error Detection**: Automatically monitors terminal output and detects errors in real-time
  - **LLM-Powered Error Correction**: Uses AI to analyze errors and suggest corrected commands
  - **Auto-Retry with Smart Logic**: Automatically retries failed commands with intelligent corrections
  - **Comprehensive Error Pattern Recognition**: Supports 50+ error patterns including:
    - **Maven/Java**: Build failures, compilation errors, JAVA_HOME issues, version conflicts
    - **Node.js/npm**: Package installation failures, dependency conflicts, esbuild errors
    - **Python**: Import errors, virtual environment issues, package conflicts
    - **Docker**: Container build failures, image pull errors, network issues
    - **Git**: Merge conflicts, authentication failures, branch issues
  - **Smart Retry Management**: Prevents infinite loops with intelligent retry limits and cooldown periods
  - **User Notification System**: Real-time notifications for error detection and correction attempts
  - **Terminal Integration**: Seamlessly integrates with VS Code's built-in terminal API

- **🔧 Advanced DIFF Processing**:
  - **DIFF Callout Support**: Automatically processes DIFF format code blocks in AI responses
  - **Smart File Modification**: Intelligently applies changes to existing files without data loss
  - **Context-Aware Path Resolution**: Automatically resolves file paths relative to project structure
  - **Preserves Existing Content**: Only modifies specified sections while preserving other file content
  - **Batch DIFF Processing**: Handles multiple DIFF operations in a single response

- **🎨 Enhanced Project Type Detection**:
  - **LLM-based Detection**: Uses AI to detect project types from user queries and file analysis
  - **Hybrid Detection**: Combines file-based and query-based detection for maximum accuracy
  - **Extended Framework Support**: Supports 24+ project types including:
    - **Web Frameworks**: React, Vue, Angular, Next.js, Nuxt.js, Svelte
    - **Backend Frameworks**: Spring Boot, Django, Flask, FastAPI, Express.js
    - **Mobile**: React Native, Flutter, iOS, Android
    - **Desktop**: Electron, .NET, Java Swing
  - **Default File Inclusion**: Automatically includes essential files for each project type

- **📊 Processing Steps Visualization**:
  - **Real-time Step Display**: Shows current processing step with animated indicators
  - **Detailed Step Information**: Displays comprehensive information for each processing step
  - **Debug Console Integration**: Provides detailed debugging information in the console
  - **Token Usage Display**: Shows input token count and usage statistics
  - **User Notification**: Shows error correction progress and results in real-time
  - **Terminal Integration**: Works with both VS Code integrated terminal and direct command execution
- **DIFF Callout Processing**:
  - **DIFF Format Support**: Processes ````diff` callouts in LLM responses
  - **Smart File Modification**: Applies only the changes specified in DIFF format to existing files
  - **Context-aware Path Resolution**: Resolves file paths using project context and attached files
  - **Preserves Existing Content**: Only modifies the specific lines mentioned in DIFF, preserving other content
- **Enhanced Project Type Detection**:
  - **LLM-based Detection**: Uses LLM to detect project type from user queries
  - **Hybrid Detection System**: Combines LLM-based and file-based project type detection
  - **Extended Framework Support**: Added support for Vue, Angular, Next.js, Nuxt.js, Svelte, Django, Flask, FastAPI, .NET, Go, Rust, PHP, Ruby, iOS, Android, Flutter, React Native
  - **Default File Inclusion**: Automatically includes framework-specific essential files in context
- **Processing Steps Visualization**:
  - **Real-time Step Display**: Shows LLM processing steps with animated progress indicators
  - **Detailed Step Information**: Displays intent analysis, keyword selection, file analysis, and response generation progress
  - **Debug Console Integration**: Provides detailed debugging information for each processing step
  - **Token Usage Display**: Shows input token count during response assembly

#### Version 3.0.0 - Major Update (2025/10/04)
- **Terminal-Daemon Integration**:
  - Non-interactive and long-running dev commands are now executed via a Go-based terminal-daemon using a Unix domain socket for accurate exit codes and real-time logs
  - Logs stream to the `CODEPILOT Terminal Capture` output channel
  - Only truly interactive commands open the single reused `aidev-ide Terminal`
- **Cleaner Output**: PTY ANSI control sequences are stripped so logs render cleanly in Output
- **Stronger Error Monitoring**: Expanded detection for npm errors (e.g., "Missing script:"), "Exit status X", and "Process exited (code X)", auto-forwarded to chat and LLM for fixes
- **Smarter Node Context**: For Node.js projects, `package.json` is always included first in the prompt; Node frontend projects search only `package.json` and `src/**` and exclude `node_modules/`. Searched file list is logged to the debug console
- **CWD Handling**: The effective working directory for command execution prefers `aidevIde.projectRoot` (if set), otherwise uses the workspace root; the chosen CWD is logged with each run
- **Chat Send Queue & Pending UI**:
  - New pending send queue buffers user questions while AI is responding and auto-sends them in order once the current response finishes
  - A bottom queue bar shows pending questions with individual cancel (×); layout auto-adjusts to avoid overlap
  - New questions typed during an in-flight call are still displayed immediately in the chat for context
- **Error-first Orchestration**:
  - File/terminal errors automatically generate a short remediation prompt sent with priority
  - Any in-flight AI call is silently aborted to prioritize error fixes; delete ENOENT no longer blocks the queue
- **Clickable File List in Execution Queue**:
  - The "🧩 Execution Queue Enqueued" section now lists all created/modified/deleted files
  - Created/modified files are rendered as clickable absolute paths; clicking opens the file in the editor
- **Full Prompt Logging & Timing**:
  - Start/finish banners with timestamps wrap LLM calls
  - Full system prompt and user parts printed to logs to diagnose latency (context logs aren’t sent to the model)
- **Long-running Dev Command Handling**:
  - `npm run dev`, `vite`, etc. treated as long-running and routed via the daemon, not misclassified as failures
  - Removed programmatic npm script pre-validation; the LLM decides script existence/alternatives

### 🔐 License Protection System
- **Banya License Verification**: 
  - Firebase Firestore-based license validation
  - 16-digit serial number format with hyphens
  - Real-time license verification against cloud database
- **Encrypted Storage**: 
  - AES-256-CBC encryption for license serial numbers
  - Secure storage in VS Code SecretStorage
  - Automatic encryption/decryption with SHA-256 key hashing
- **Access Control**: 
  - CODE and ASK tabs require valid license for activation
  - Graceful error handling with multi-language support
  - License status indicators and read-only display
- **License Management**: 
  - License serial input with validation
  - License deletion and re-verification
  - Visual feedback for license operations

### 📋 Usage Examples
- **Code Generation**: "Create a React component for user authentication"
- **Code Modification**: "Add error handling to this function"
- **File Operations**: "Create a new utility file for date formatting"
- **File Selection**: Use the @ button to select specific files for context inclusion
- **CODE Tab Operations**: "Analyze and refactor this code" (full file operations)
- **ASK Tab Queries**: "Analyze the performance of this code" (read-only analysis)
- **Token Management**: Automatic token usage monitoring and limit warnings

## Requirements

- nvm 0.39.1
- node v21.7.1
- npm install

## Installation & Setup

### Prerequisites
1. **Node.js Environment**
   ```bash
   # Install nvm (Node Version Manager)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
   
   # Install Node.js v21.7.1
   nvm install 21.7.1
   nvm use 21.7.1
   ```

2. **VS Code Extension Development Tools**
   ```bash
   # Install VS Code Extension Generator
   npm install -g yo generator-code
   ```

### Development Setup
1. **Clone and Install Dependencies**
   ```bash
   git clone https://github.com/DAIOSFoundation/aidev-ide.git
   cd aidev-ide
   npm install
   ```

2. **Build the Extension**
   ```bash
   # Development build with watch mode
   npm run watch
   
   # Production build
   npm run package
   ```

3. **Run in Development Mode**
   ```bash
   # Press F5 in VS Code to launch extension host
   # Or use the command palette: "Developer: Reload Window"
   ```

### Configuration
1. **AI Model Setup**
   - Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "aidev-ide: Open Settings Panel"
   - **For Gemini**: Enter your Gemini API key (get from [Google AI Studio](https://aistudio.google.com/app/apikey))
   - **For Ollama**: Install Ollama and set API URL (default: http://localhost:11434)

2. **Ollama Setup (Optional)**
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Start Ollama server
   ollama serve
   
   # Pull models
   ollama pull gemma3:27b
   ollama pull deepseek-r1:70b
   ollama pull codellama:7b
   ```


### CLI binaries: PATH and aliases (optional)
To run bundled binaries directly from your terminal, add PATH entries or aliases in your shell profile (macOS zsh example).

1) Add to PATH (recommended during development)

```bash
# ~/.zshrc
export PATH="$PATH:/Users/tony/Projects/aidev-ide/assets/ollama-blocker"
export PATH="$PATH:/Users/tony/Projects/aidev-ide/assets/terminal-daemon"
```

2) Define aliases

```bash
# ~/.zshrc
alias ollama-blocker-embedded="/Users/tony/Projects/aidev-ide/assets/ollama-blocker/ollama-blocker-embedded"
alias terminal-daemon="/Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-daemon"
alias terminal-client="/Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-client"
```

3) System-wide install (optional)

```bash
sudo cp /Users/tony/Projects/aidev-ide/assets/ollama-blocker/ollama-blocker-embedded /usr/local/bin/
sudo cp /Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-daemon /usr/local/bin/
sudo cp /Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-client /usr/local/bin/
sudo chmod +x /usr/local/bin/ollama-blocker-embedded /usr/local/bin/terminal-daemon /usr/local/bin/terminal-client
```

After updating your profile, apply changes:

```bash
source ~/.zshrc
```

## Testing

### Unit Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run watch-tests

# Run linting
npm run lint
```

### Manual Testing
1. **Extension Activation**
   - Open VS Code
   - Navigate to Extensions view (`Ctrl+Shift+X`)
   - Find "aidev-ide" in the activity bar
   - Verify both CODE and ASK tabs are visible

2. **CODE Tab Testing**
   ```bash
   # Test code generation
   - Open CODE tab
   - Type: "Create a simple React component"
   - Verify AI response with code blocks
   
   # Test file operations
   - Use @ button to select files
   - Request file modifications
   - Verify file creation/modification
   ```

3. **ASK Tab Testing**
   ```bash
   # Test general Q&A
   - Open ASK tab
   - Ask: "What is TypeScript?"
   - Verify informative response
   
   ```

4. **Settings Testing**
   ```bash
   # Test API key management
   - Open Settings panel
   - Add/update API keys
   - Verify secure storage
   
   # Test language switching
   - Change language setting
   - Verify UI updates immediately
   ```

### Integration Testing
1. **File Context Testing**
   - Create a test project with multiple files
   - Use @ button to select specific files
   - Verify context is included in AI responses

2. **Image Analysis Testing**
   - Upload code screenshots or diagrams
   - Request code analysis
   - Verify AI understands visual content

3. **Multi-language Testing**
   - Test all supported languages
   - Verify proper localization
   - Test language persistence

### Performance Testing
1. **Large Codebase Testing**
   - Test with projects containing 100+ files
   - Monitor memory usage
   - Verify response times

2. **API Rate Limiting**
   - Test multiple rapid requests
   - Verify proper error handling
   - Check abort functionality

### Debugging
```bash
# Enable debug logging
# Add to VS Code settings.json:
{
  "aidev-ide.debug": true
}

# View extension logs
# In VS Code: Help > Toggle Developer Tools > Console
```

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes
Please see [RELEASE.md](RELEASE.md).

### Latest Release
- **🚀 Version 5.1.0** (2025/12/23) - XML Tool-Only Prompts & Tool UX Polish  
  - **XML-only prompts**: Removed markdown file directives; fileOperations/outputFormat/CodeWorkPrompt simplified to XML tool calls only.  
  - **Required content for create_file**: Prompt enforces non-empty `content`; prevents empty-file errors.  
  - **Task queue UX**: `list_files` tool calls are hidden from the job queue to reduce noise.  
  - **Tool docs**: Added `prompt.md` and updated `ARCHITECTURE.md` for new tool layout (`tools/file`, `tools/terminal`, `tools/code`).  
  - **Response discipline**: Stronger guidance to leave `thinking` empty and place XML tool calls in `response` only.
- **Version 4.9.0** (2025/11/05) - Command Execution Summary Enhancement & Task Queue Completion Status
  - **Command Execution Summary Descriptions**: User-friendly description phrases for each command in execution summary
  - **Automatic Task Queue Status Updates**: Task queue items automatically update status when terminal commands are executed
  - **Real-time Webview Updates**: Task queue status changes are immediately reflected in the webview
  - **Command Pattern Recognition**: Automatically recognizes Maven, Gradle, npm, yarn, Git, Docker, and more command patterns
- **Version 3.0.0** (2025/10/04)
  - Terminal-daemon integration and command routing
  - Chat send queue with pending UI and per-item cancel
  - Error-first orchestration and clickable execution-queue file list
  - Full prompt logging with timestamps; better long-running dev command handling

### For more information
I'm seeking individuals to help me grow this source code. Please contact me at: tony@banya.ai

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%E2%9D%A4%EF%B8%8F-red?style=for-the-badge&logo=github)](https://github.com/sponsors/tonythefreedom)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E2%98%95%EF%B8%8F-purple?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/lizsong)

**Enjoy!**
