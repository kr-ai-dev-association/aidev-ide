<p align="right">
  🇰🇷 <a href="README.ko.md">한국어로 보기</a>
</p>

# aidev-ide README

VSCode base code assistant plugin with LLM and LM support.

## v5.1.2 (LLM Autonomy & Enhanced File Modification)
- **LLM autonomy**: Removed system-generated follow-ups. LLM now autonomously decides when to retry failed operations and generate subsequent tool calls, similar to `cline`.
- **Enhanced update_file matching**: Added `cline`-style robust matching strategies:
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

### 🌐 Real-Time Information Services
- **Weather Information**: Korean Meteorological Administration API integration
  - Current weather conditions and forecasts
  - 7-day weather predictions
  - Location-specific weather data
- **News Updates**: NewsAPI integration for latest headlines
  - Topic-specific news searches
  - Real-time news aggregation
  - Source attribution and timestamps
- **Stock Market Data**: Alpha Vantage API integration
  - Real-time stock prices and changes
  - Major stock tracking (AAPL, GOOGL, MSFT, TSLA, AMZN)
  - Percentage change calculations

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
- **API Key Management**: Secure storage for multiple external API keys
  - Gemini API key configuration
  - Weather API key configuration
  - News API credentials (Client ID & Secret)
  - Stock API key management
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
  - Logs stream to the `AIDEV-IDE Terminal Capture` output channel
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
- **Real-time Info**: "What's the weather in Seoul?" or "Show me the latest tech news"
- **Stock Queries**: "What are the current stock prices?"
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

3. **Optional External APIs**
   - **Weather API**: Get API key from [KMA API Hub](https://apihub.kma.go.kr/)
   - **News API**: Get Client ID & Secret from [Naver Developers](https://developers.naver.com/)
   - **Stock API**: Get API key from [Alpha Vantage](https://www.alphavantage.co/)

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
   
   # Test real-time information
   - Ask: "What's the weather in Seoul?"
   - Ask: "Show me latest tech news"
   - Ask: "What are current stock prices?"
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
