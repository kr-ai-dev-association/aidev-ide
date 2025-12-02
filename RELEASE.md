# aidev-ide Release Notes

This document contains the complete release history for aidev-ide VSCode extension.

## 🚀 Version 4.10.0 (2025/12/02) - Manager-Based Architecture & Smart Action System

<details>
<summary>Complete Architecture Refactoring with Manager System</summary>

### Added
- **Manager-Based Architecture**: Clean separation of concerns with 3 core managers
  - **Action Manager**: LLM response → executable actions transformation
    - ActionRegistry: Plugin-based action registration
    - ActionValidator: Validation with dependency checking, circular dependency detection
    - ActionMapper: Automatic extraction from code blocks, commands, file operations
    - 7 action types: CODE_GENERATION, FILE_OPERATION, TERMINAL_COMMAND, ANALYSIS, VERIFICATION, SEARCH, REFACTOR
  - **Execution Manager**: Process lifecycle and error detection
    - ProcessManager: PID tracking, long-running process support (11 patterns)
    - StreamManager: stdout/stderr capture with 1MB buffer, handler registration
    - ErrorDetector: 10 error types with auto-suggestions
    - Sync/async execution, timeout handling, grace period shutdown
  - **Terminal Manager**: Terminal session management
    - TerminalSession: Individual session with command history
    - TerminalHistory: Global history (1000 entries), statistics, import/export
    - Multi-session support, session reuse, VS Code event integration
- **Integration Layer**: Seamless integration with existing code
  - ManagerAdapter: Unified interface for all managers
  - Flag-based control: `useNewManagerSystem` toggle
  - Graceful fallback on errors
  - Example implementations with 5 use cases
- **Smart Action Extraction**: 85-95% confidence action recognition
  - Code block pattern: ` ```lang:path ... ``` `
  - Command pattern: ` ```bash ... ``` `, "Run: \`cmd\`"
  - File operation: "Create/Delete/Rename/Move file ..."
- **llmService.ts Integration**: New manager system integrated into main LLM flow
  - Automatic action extraction from LLM responses
  - Action validation before execution
  - Parallel execution with legacy UI processor

### Improved
- **Error Detection**: 10 error types with intelligent fix suggestions
  - PORT_CONFLICT, COMMAND_NOT_FOUND, PERMISSION_DENIED, SYNTAX_ERROR, RUNTIME_ERROR
  - NETWORK_ERROR, FILE_NOT_FOUND, OUT_OF_MEMORY, TIMEOUT, UNKNOWN
- **Process Management**: Long-running command support (npm dev, Spring Boot, Django, Flask, etc.)
- **Terminal History**: Command tracking with statistics and search
- **Type Safety**: 200+ interfaces, complete type coverage

### Technical Details
- **Total Code**: ~6,500 lines across 28 files
- **Type System**: 1,666 lines, 200+ interfaces
- **Compilation**: 0 errors, ~4s build time
- **Architecture**: Singleton patterns, clean dependency injection
- **Documentation**: 4 comprehensive docs (1,000+ lines)

</details>

## 🚀 Version 4.9.3 (2025/11/26) - Tree-sitter Integration & Framework Abstraction

<details>
<summary>Code Parsing System & Architecture Refactoring</summary>

### Added
- **Tree-sitter Code Parser Integration**: Automatic code structure extraction for token-efficient LLM context
  - Multi-language support: TypeScript, JavaScript, Python, Java via WASM parsers
  - Definition-only extraction (classes, functions, interfaces) without implementation details
  - 70-80% token reduction by sending only code structure to LLM
  - 3-second timeout to prevent blocking
  - On-premise ready: All WASM files bundled with webpack
- **Framework Abstraction Layer**: Clean separation of OS, LLM, and Framework concerns
  - `IFrameworkAdapter` interface with TypeScript and Spring Boot implementations
  - `FrameworkAdapterFactory` for automatic framework detection
  - Framework-specific commands, templates, and error handling
- **Code Parser Abstraction**: `ICodeParserAdapter` and `TreeSitterAdapter` for extensible parsing
  - `getProjectCodeSummary()`: Generate formatted project structure summary
  - `parseFile()`: Extract definitions from individual files
  - `findDefinition()`: Search for specific classes/functions across project

### Improved
- **LLM Context Efficiency**: Only sends code definitions instead of full file contents (3-second timeout)
- **Framework Detection**: Automatic detection of TypeScript, Spring Boot projects with improved accuracy
- **Build Command Generation**: Framework-aware build/dev/test command generation
- **Error Messages**: Framework-specific error patterns and fix suggestions

### Technical Improvements
- `webpack.config.js`: Added `copy-webpack-plugin` to bundle tree-sitter WASM files
- `llmService.ts`: Integrated tree-sitter parsing with timeout in CODE tab flow
- `AbstractionIntegrationService.ts`: Centralized access to all abstraction layers
- `languageParser.ts`: Dynamic WASM loading for multiple programming languages
- `TreeSitterAdapter.ts`: Implementation of tree-sitter queries for definition extraction

### Renamed
- **TechStack → Framework**: Comprehensive renaming for clearer domain modeling
  - `ITechStackAdapter` → `IFrameworkAdapter`
  - `TechStackAdapterFactory` → `FrameworkAdapterFactory`
  - `stackId` → `frameworkId`, `stackName` → `frameworkName`
  - Updated all references across codebase

</details>

## 🚀 Version 4.10.0 (2025/11/26) - ActionPlanner and ActionExecutionEngine Main Flow Integration

<details>
<summary>Agent Loop-Based Execution System Integration</summary>

### Added
- **Execution Intent-Based ActionPlan Route**: When execution intent (intent category `execution`) is detected, automatically routes through ActionPlannerService and ActionExecutionEngine for step-by-step execution loop
  - Added `LlmService.handleExecutionIntentWithActionPlan()` method
  - Converts user requests into ActionPlan to generate executable step-by-step task lists
  - Registers each ActionStep to PlanQueueService for real-time synchronization with UI task queue
- **Real File Operation Implementation**: Replaced dummy implementations in ActionExecutionEngine with actual VS Code FS API-based operations
  - `executeCodeGeneration`: Actual file creation/modification using VS Code `workspace.fs.writeFile`
  - `executeFileOperation`: File deletion and automatic directory creation support
  - `executeTerminalCommand`: Command execution integrated with existing TerminalMonitorService
  - `executeVerification`: Error pattern validation based on terminal logs

### Improved
- **Complete Agent Loop**: Full implementation of agent loop: user request → intent analysis → ActionPlan generation → step-by-step execution → verification
- **Task Queue Integration**: Each step of ActionPlan is registered to PlanQueueService, enabling real-time progress tracking in UI
- **File Operation Stability**: More stable and predictable file operations using actual file system APIs

### Technical Improvements
- `llmService.ts`: Added `handleExecutionIntentWithActionPlan()` method to route execution intents through ActionPlanner path
- `actionExecutionEngine.ts`: Uses actual VS Code FS API in `executeCodeGeneration` and `executeFileOperation`
- `actionPlannerService.ts`: Integrates generated ActionPlan with PlanQueueService for UI display
- Removed dummy setTimeout implementations and replaced with actual file system operations

</details>

## 🚀 Version 4.9.1 (2025/11/14) - Terminal Management Improvements & Debugging Guide

<details>
<summary>Terminal Management Improvements & Debugging Guide</summary>

### Added
- **LLM_TASK_QUEUE_FLOW.md**: Comprehensive documentation for LLM code generation → TASK creation → queue execution flow
  - Complete architecture overview with two queue systems (PlanQueueService and TerminalManager)
  - Step-by-step detailed flow documentation
  - Data structures and core configuration values
  - Error handling and troubleshooting guide
- **Debugging Guide**: Added detailed debugging guide for LLM task queue flow

### Improved
- **CWD (Current Working Directory) Handling**: Enhanced CWD processing in terminalManager
  - Automatic conversion of `$PROJECT_ROOT` string variables to actual paths
  - Improved CWD validation and error handling
  - Better handling of project root path resolution
- **Terminal Error Filtering**: Enhanced error detection and filtering
  - npm warn messages are now filtered (not treated as errors)
  - node_modules related ENOENT errors are filtered
  - Vite entry point warnings are filtered
- **Auto Error Recovery**: Improved automatic error recovery mechanisms
  - esbuild binary corruption auto-recovery
  - ts-node-dev ESM module error handling (auto-replace with tsx)
  - npm install ENOTEMPTY error auto-recovery
- **Process Management**: Enhanced process termination for long-running commands
  - Automatic termination of existing processes before starting new long-running dev commands
  - Improved VS Code terminal cleanup
  - Better process detection and termination on macOS/Linux
- **npm Install Optimization**: Added esbuild pre-cleanup before npm install
  - Prevents esbuild binary corruption issues
  - Automatic cleanup of esbuild directories and npm cache
- **File Path Resolution**: Enhanced file path resolution in llmResponseProcessor
  - Improved file system search when files are not found in context
  - Better project root-based path resolution
  - Enhanced markdown file parsing with better whitespace handling
- **Project Type Detection**: Improved project type auto-selection
  - Removed user selection UI for project type
  - Automatic project type detection and usage
- **Task Queue Reset**: Added automatic task queue reset when starting new questions
  - PlanQueueService integration with TerminalManager
  - Better queue state management

### Technical Improvements
- `terminalManager.ts`: Enhanced CWD handling, esbuild pre-cleanup, process termination improvements
- `llmResponseProcessor.ts`: Improved file path resolution and markdown parsing
- `llmService.ts`: Added task queue reset, project type auto-selection
- `terminalMonitorService.ts`: Enhanced error filtering and auto-recovery
- `extension.ts`, `storage.ts`: Improved auto-correction setting management

</details>

## 🚀 Version 4.9.0 (2025/11/05) - Command Execution Summary Enhancement & Task Queue Completion Status

<details>
<summary>Command Execution Summary Enhancement & Task Queue Completion Status</summary>

### Added
- **Command Execution Summary Descriptions**: Added user-friendly description phrases for each command in the execution summary
  - Maven/Gradle build commands: "Package project into executable JAR file", "Compile project source code", etc.
  - npm/yarn commands: "Build project", "Start development server", "Run tests", etc.
  - Installation commands: "Install npm package dependencies", "Install Python packages", "Install Homebrew packages", etc.
  - Execution commands: "Run Java application", "Execute Node.js script", "Run Python script", etc.
  - Git/Docker commands: "Clone Git repository", "Build Docker image", etc.
- **Automatic Task Queue Completion Status Updates**: Task queue item status automatically updates when terminal commands are executed
  - Command execution start: `pending` → `in_progress`
  - Command execution completion: `in_progress` → `done` (success) or `failed` (failure)
  - Real-time webview updates: Task queue status changes are immediately reflected in the webview

### Improved
- **Command Description Pattern Matching**: Automatically generates appropriate descriptions by recognizing various command patterns
- **Task Queue Integration**: Improved task queue status management through integration between TerminalManager and PlanQueueService
- **Enhanced User Experience**: Command execution summaries are now clearer and easier to understand

### Technical Improvements
- `llmResponseProcessor.ts`: Added `describeCommand()` function for command pattern analysis and description generation
- `terminalManager.ts`: Added `setPlanQueueService()` function and automatic task queue status updates in `processQueue()`
- `llmService.ts`: Passes PlanQueueService instance to TerminalManager when creating task queue

</details>

## 🚀 Version 4.6.0 (2025/10/23) - Planning & Plan Queue

<details>
<summary>🧠 Planning 섹션, Plan 단계 요약, Plan Queue 패널</summary>

### Added
- Settings에 Planning 섹션 추가: 로컬 Ollama reasoning 모델 드롭다운 표시, 모델 미존재 시 다운로드 안내
- Plan 단계: 생성된 계획을 자동으로 큐잉, Processing Steps의 plan 단계에 reasoning 모델명과 현재 작업 요약 표시
- Plan Queue 패널: 항목 목록/실행/완료/취소/비우기 및 지속화(globalState)

### Improved
- 내부 오류 처리 및 상태 메시지 가독성 개선

</details>

## 🚀 Version 4.5.0 (2025/10/21) - Auto Command Execution & Individual Callout Execution Status

<details>
<summary>🎯 Auto Command Execution Feature & Individual Callout Execution Status Display</summary>

### Added
- **Auto Command Execution Toggle**: Enable/disable automatic execution of bash/powershell/cmd commands from LLM responses in settings
- **Individual Callout Execution Status Display**: Each shell script callout box displays its own independent "Executing..." animation
- **Global Display for Auto Execution**: When auto command execution is enabled, all callout boxes show executing status
- **Settings Registration Complete**: `aidevIde.autoExecuteCommands` setting is now properly registered in package.json

### Improved
- **Real-time Status Display**: Shows "Executing commands..." status in real-time during auto execution
- **Visual Distinction**: Clear separation between Auto Correcting and Run button execution status
- **Global Settings Support**: Saved as user global settings for consistent behavior across all workspaces
- **Real-time Settings Reflection**: Dynamic settings system that applies changes immediately

### Fixed
- **Settings Save Issue Resolved**: Fixed "Unable to write to User Settings because aidevIde.autoExecuteCommands is not a registered configuration" error
- **Individual Run Button Click**: Only the specific callout box shows executing status when Run button is clicked
- **Auto Execution Disabled**: Shows user notification for manual execution when auto execution is disabled

</details>

## 🚀 Version 4.4.1 (2025/10/20) - Executing Commands Step & Stability

<details>
<summary>🎯 Executing Commands step, OS-specific command refinement, settings persistence</summary>

### Added
- Executing Commands step: After initial LLM response, detect bash/powershell callouts and re-call LLM to output commands-only for the user's OS
- Strict system prompt for commands-only: forces a single code block, enforces Windows (powershell) vs macOS/Linux (bash), forbids mixing and narrative

### Improved
- Processing Steps: Ensure the steps box is rendered only once (remove static HTML duplicate, React-only)
- Steps order updated to include executing between assembling and parsing
- Auto error correction: New toggle in Settings to enable/disable; disables retry spinner when off
- Auto error correction persistence fixed (stored in workspace settings and applied on startup)

### Fixed
- Remote Ollama settings now preload on Settings open and enable proper section visibility
- OS detection value is injected at startup and reused in executing step refinement

</details>

## 🚀 Version 4.4.0 (2025/10/20) - Processing Steps & Remote Settings

<details>
<summary>🎯 Processing steps executing slot, remote settings init</summary>

- Add executing step placeholder and status updates
- Include remote Ollama settings in currentSettings payload and apply on load

</details>

## 🚀 Version 4.3.0 (2025/10/19) - OUTPUT Log Control & Enhanced Bash Command Execution

<details>
<summary>🎯 OUTPUT Log Control & Enhanced Bash Command Execution</summary>

### **OUTPUT Log Control Feature**
- **Complete Log Control**: Enable/disable all logs displayed in VS Code's OUTPUT panel
- **Terminal Log Optimization**: Easier terminal log checking when OUTPUT logs are disabled
- **Real-time Setting Changes**: Log control settings applied immediately
- **Memory Optimization**: Reduced memory usage by clearing log entries when disabled

### **Enhanced Bash Command Execution**
- **New Terminal Creation**: "Run" button in bash callouts creates new VS Code terminal for command execution
- **Sequential Command Execution**: Safely executes multiple commands with 500ms intervals
- **Enhanced Debugging**: Detailed logging system to track command execution process
- **Terminal Preparation Time**: Improved stability by waiting for terminal to be fully ready

### **Auto Error Correction Settings**
- **Customizable Retry Count**: Set automatic error correction attempts from 1-10 times
- **Real-time Setting Reflection**: Error correction count adjustments applied immediately
- **Status Display**: View current error correction count setting in UI

### **Technical Improvements**
- **Dummy Channel Implementation**: Performance optimization with empty channel return when OUTPUT logs disabled
- **Setting Change Detection**: Automatic reflection of VS Code setting changes to TerminalManager
- **Duplicate Code Removal**: Cleaned up duplicate executeBashCommands cases in ChatViewProvider and AskViewProvider
- **Enhanced Error Handling**: More robust error handling and user feedback for bash command execution

</details>

## 🚀 Version 4.2.0 (2025/10/18) - Intelligent Auto Error Correction System

<details>
<summary>🎯 Intelligent Auto Error Correction System</summary>

### **Automatic Terminal Error Detection & Correction**
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

### **Enhanced Processing Steps Visualization**
- **React-based Dynamic UI**: Real-time processing step display with typing animations
- **Auto-Correcting Indicator**: Visual feedback when error correction is active
- **Step-by-Step Progress**: Shows analysis, correction, and retry steps
- **Blinking Cursor Effects**: Engaging UI with typing and blinking animations

### **Comprehensive Error Support**
- **Maven Build Errors**: MojoExecutionException, ProjectBuildingException
- **Spring Boot Issues**: Version compatibility, POM configuration
- **Java Environment**: JDK/JRE issues, class version mismatches
- **Network Issues**: Connection failures, server unavailability
- **File System**: Permission denied, file not found errors

### **Technical Improvements**
- **TerminalMonitorService**: Core service for error detection and correction
- **LLM Integration**: Enhanced error analysis with AI-powered solutions
- **React Webview Components**: Dynamic UI with real-time updates
- **Error Pattern Database**: Comprehensive pattern matching for common errors
- **Storage Service Integration**: Persistent error pattern learning

</details>

## 🚀 Version 4.1.0 (2025/10/18) - Enhanced Settings UI & Configuration Management

<details>
<summary>🎯 Enhanced Settings UI & Configuration Management</summary>

### **Improved Ollama Configuration**
- **Local Ollama Section**: Dedicated section for local machine Ollama configurations
- **Remote Server Section**: New section for remote Ollama server configurations  
- **Server Type Toggle**: Easy switching between local and remote server types
- **Flexible Model Configuration**:
  - Local: Automatic model detection from Ollama server
  - Remote: Manual model name input (e.g., `gemma3:27b`)
- **Enhanced User Experience**: Cleaner, more intuitive settings interface

### **Streamlined Interface**
- **Removed Terminal Daemon**: Eliminated unnecessary Terminal Daemon configuration
- **Better Organization**: Clear separation between local and remote configurations
- **Consistent Styling**: Unified design language across all settings sections

### **Technical Improvements**
- **Separate Storage**: Independent configuration storage for local and remote settings
- **Smart UI Switching**: Automatic section visibility based on server type selection
- **Improved Event Handling**: Enhanced JavaScript event listeners for better responsiveness
- **Better Error Handling**: More robust error handling for configuration changes

</details>

## 🚀 Version 4.0.0 (2025/10/18) - Revolutionary AI-Powered Development Experience

<details>
<summary>🚀 Revolutionary Terminal Auto-Error Correction System</summary>

- **Real-time Error Detection**: 
  - Automatically monitors terminal output and detects errors in real-time
  - Supports 50+ error patterns across multiple technologies and frameworks
  - Seamlessly integrates with VS Code's built-in terminal API
- **LLM-Powered Error Correction**: 
  - Uses AI to analyze errors and suggest corrected commands
  - Intelligent error pattern recognition with context-aware corrections
  - JSON-formatted response parsing for reliable command correction
- **Auto-Retry with Smart Logic**: 
  - Automatically retries failed commands with intelligent corrections
  - Smart retry management prevents infinite loops with intelligent limits
  - Cooldown periods prevent redundant retry attempts
- **Comprehensive Error Pattern Recognition**: 
  - **Maven/Java**: Build failures, compilation errors, JAVA_HOME issues, version conflicts
  - **Node.js/npm**: Package installation failures, dependency conflicts, esbuild errors
  - **Python**: Import errors, virtual environment issues, package conflicts
  - **Docker**: Container build failures, image pull errors, network issues
  - **Git**: Merge conflicts, authentication failures, branch issues
- **User Notification System**: 
  - Real-time notifications for error detection and correction attempts
  - Progress tracking for error correction processes
  - Success/failure feedback for correction attempts

</details>

<details>
<summary>🔧 Advanced DIFF Processing</summary>

- **DIFF Callout Support**: 
  - Automatically processes DIFF format code blocks in AI responses
  - Supports standard DIFF format with proper parsing and validation
- **Smart File Modification**: 
  - Intelligently applies changes to existing files without data loss
  - Preserves existing content while applying only specified changes
- **Context-Aware Path Resolution**: 
  - Automatically resolves file paths relative to project structure
  - Handles both absolute and relative path specifications
- **Batch DIFF Processing**: 
  - Handles multiple DIFF operations in a single response
  - Efficient processing of complex multi-file changes

</details>

<details>
<summary>🎨 Enhanced Project Type Detection</summary>

- **LLM-based Detection**: 
  - Uses AI to detect project types from user queries and file analysis
  - Intelligent project type inference from natural language descriptions
- **Hybrid Detection**: 
  - Combines file-based and query-based detection for maximum accuracy
  - Fallback mechanisms ensure reliable project type identification
- **Extended Framework Support**: 
  - **Web Frameworks**: React, Vue, Angular, Next.js, Nuxt.js, Svelte
  - **Backend Frameworks**: Spring Boot, Django, Flask, FastAPI, Express.js
  - **Mobile**: React Native, Flutter, iOS, Android
  - **Desktop**: Electron, .NET, Java Swing
- **Default File Inclusion**: 
  - Automatically includes essential files for each project type
  - Framework-specific file prioritization and inclusion

</details>

<details>
<summary>📊 Processing Steps Visualization</summary>

- **Real-time Step Display**: 
  - Shows current processing step with animated indicators
  - Dynamic step progression with visual feedback
- **Detailed Step Information**: 
  - Displays comprehensive information for each processing step
  - Context-aware step descriptions and progress tracking
- **Debug Console Integration**: 
  - Provides detailed debugging information in the console
  - Enhanced logging for troubleshooting and development
- **Token Usage Display**: 
  - Shows input token count and usage statistics
  - Real-time token consumption monitoring

</details>

## Version 3.2.1 (2025/10/17) - Terminal Auto-Error Correction & DIFF Processing

<details>
<summary>Terminal Auto-Error Correction System</summary>

- **Real-time Error Detection**: 
  - Monitors terminal output for command execution errors
  - Detects npm, git, docker, python, and other common command failures
  - Supports both VS Code integrated terminal and direct command execution
- **LLM-based Error Correction**: 
  - Automatically sends error details to LLM for correction suggestions
  - Analyzes error patterns and provides intelligent fixes
  - JSON-formatted response parsing for corrected commands
- **Auto-retry with Corrected Commands**: 
  - Automatically executes corrected commands with retry limits (max 3 attempts)
  - Prevents infinite retry loops with cooldown periods
  - User notification system for error correction progress
- **Smart Error Pattern Recognition**: 
  - Comprehensive error pattern matching for various command types
  - Handles syntax errors, missing dependencies, permission issues
  - Supports both interactive and long-running command error correction

</details>

<details>
<summary>DIFF Callout Processing</summary>

- **DIFF Format Support**: 
  - Processes ````diff` callouts in LLM responses
  - Parses standard diff format with file paths and line changes
  - Supports add (+), remove (-), and context ( ) line operations
- **Smart File Modification**: 
  - Applies only the changes specified in DIFF format to existing files
  - Preserves existing content while applying targeted modifications
  - Handles complex multi-line changes and hunks
- **Context-aware Path Resolution**: 
  - Resolves file paths using project context and attached files
  - Supports both relative and absolute path resolution
  - Validates file paths before applying changes

</details>

<details>
<summary>Enhanced Project Type Detection</summary>

- **LLM-based Detection**: 
  - Uses LLM to detect project type from user queries
  - Analyzes user intent and project requirements
  - Provides confidence scores for detection accuracy
- **Hybrid Detection System**: 
  - Combines LLM-based and file-based project type detection
  - Prioritizes LLM detection with file-based fallback
  - Supports 24+ project types and frameworks
- **Extended Framework Support**: 
  - Added support for Vue, Angular, Next.js, Nuxt.js, Svelte
  - Django, Flask, FastAPI, .NET, Go, Rust, PHP, Ruby
  - iOS, Android, Flutter, React Native
- **Default File Inclusion**: 
  - Automatically includes framework-specific essential files in context
  - Ensures proper project structure recognition
  - Improves AI response accuracy for framework-specific tasks

</details>

<details>
<summary>Processing Steps Visualization</summary>

- **Real-time Step Display**: 
  - Shows LLM processing steps with animated progress indicators
  - Visual feedback for each processing phase
  - Responsive UI that adapts to different screen sizes
- **Detailed Step Information**: 
  - Displays intent analysis results and confidence scores
  - Shows keyword selection and file analysis progress
  - Real-time response generation status
- **Debug Console Integration**: 
  - Provides detailed debugging information for each processing step
  - Logs project type detection, keyword extraction, and file selection
  - Comprehensive error tracking and resolution logging
- **Token Usage Display**: 
  - Shows input token count during response assembly
  - Real-time token usage monitoring
  - Helps optimize context size and performance

</details>

## Version 3.2.0 (2025/10/17) - Enhanced Context & File Processing

<details>
<summary>Smart Context Management & Framework Detection</summary>

- **Intelligent File Filtering**: 
  - Automatically includes all `src/` directory files in context
  - Filters other files based on keywords extracted from user queries
  - Removes common stop words and focuses on relevant terms
- **Framework-Aware Context**: Automatic project type detection and relevant config file inclusion:
  - **Node.js**: `package.json`, `package-lock.json`, `tsconfig.json`, build configs
  - **Java/Spring**: `pom.xml`, `build.gradle`, `application.properties`, `application.yml`
  - **Python Django**: `manage.py`, `requirements.txt`, `settings.py`, `urls.py`
  - **Python Flask**: `app.py`, `flask_app.py`, `requirements.txt`, `config.py`
  - **Python FastAPI**: `main.py`, `requirements.txt`, `pyproject.toml`
  - **.NET**: `*.csproj`, `*.sln`, `appsettings.json`
  - **Go**: `go.mod`, `go.sum`, `main.go`
  - **Rust**: `Cargo.toml`, `Cargo.lock`, `main.rs`
  - **PHP**: `composer.json`, `composer.lock`, `index.php`
  - **Ruby**: `Gemfile`, `Gemfile.lock`, `Rakefile`

</details>

<details>
<summary>Enhanced File Processing & Path Validation</summary>

- **Callout Cleanup**: 
  - Automatically removes callout artifacts (`*`, `**`, backticks, quotes) from file paths
  - Handles various markdown formatting issues in AI responses
  - Preserves valid file paths while cleaning unwanted characters
- **Path Validation**: 
  - Validates file paths to prevent dangerous operations
  - Blocks access to system directories (`/etc`, `/usr`, `/var`, etc.)
  - Prevents directory traversal attacks (`../` patterns)
  - Enforces file name and path length limits
- **Long Response Handling**: 
  - Processes very long AI responses in chunks to prevent memory issues
  - Splits responses by file operations for better processing
  - Maintains code block integrity during chunking
- **Improved Parsing**: 
  - Better regex patterns for file operations
  - Fallback mechanisms for parsing failures
  - Enhanced error handling and recovery

</details>

<details>
<summary>Bash Command Execution Improvements</summary>

- **Comment Filtering**: 
  - Automatically filters out comment lines (`#`) from bash commands
  - Preserves only executable commands in bash callouts
- **Inline Comment Removal**: 
  - Removes inline comments from command lines
  - Preserves quoted content and escaped characters
  - Handles complex command structures with comments
- **Run Button**: 
  - Added run button for bash callouts in chat responses
  - Available in both CODE and ASK tabs
  - Positioned next to copy button for easy access
  - Provides visual feedback during command execution

</details>

<details>
<summary>Error Handling & Recovery</summary>

- **Graceful Degradation**: 
  - Fallback processing for failed operations
  - Continues processing other files when one fails
  - Provides meaningful error messages to users
- **Better Error Messages**: 
  - More descriptive error messages for file operations
  - Clear indication of what went wrong and why
  - Suggestions for resolving common issues
- **Memory Optimization**: 
  - Chunked processing for large responses
  - Memory cleanup between processing chunks
  - Prevents memory leaks during long operations

</details>

## Version 3.1.0 (2025/10/15) - Settings & Spring Support Update

<details>
<summary>Spring Project Auto-Detection & Enhanced Context</summary>

- **Spring Boot Project Detection**: Automatic detection of Spring Boot projects based on:
  - Maven build files (pom.xml) containing Spring Boot dependencies
  - Gradle build files (build.gradle, build.gradle.kts) with Spring Boot plugins
  - Application configuration files (application.properties, application.yml, application.yaml)
  - Java files with @SpringBootApplication or @SpringBootTest annotations
- **Build File Prioritization**: Spring projects now prioritize pom.xml, build.gradle, or build.gradle.kts in context
- **Enhanced Keyword Extraction**: Added Spring-specific keywords (controller, service, repository, entity, config, application)
- **Spring File Patterns**: Optimized search patterns for Java source files, configuration files, and Spring-specific directories

</details>

<details>
<summary>Ollama Cloud Model Authentication</summary>

- **gpt-oss-120b:cloud Support**: Added support for Ollama cloud model with authentication
- **Automatic UI Display**: Authentication section automatically appears when cloud model is selected
- **Integrated Authentication**: ollama auth functionality integrated into settings panel
- **Serial Number Input**: User-friendly interface for entering authentication serial numbers
- **Status Feedback**: Clear success/error messages for authentication attempts

</details>

<details>
<summary>Settings Panel Improvements</summary>

- **Fixed Model Selection**: Resolved AI model selection persistence issues (Gemini/Ollama)
- **Correct Sub-Model Display**: Fixed Ollama sub-model display and selection problems
- **One-Click Project Root**: Improved project root configuration and removal functionality
- **Enhanced Error Handling**: Better error messages and status feedback for all settings operations
- **Improved Logging**: Added detailed logging for debugging settings panel issues

</details>

<details>
<summary>Enhanced Library Exclusion System</summary>

- **Comprehensive Filtering**: Added extensive library directory exclusion patterns:
  - Node.js: node_modules, .npm, npm-cache
  - Java/Maven: .m2, target, build, .gradle, gradle
  - Python: __pycache__, .pytest_cache, venv, env, .venv, .env, site-packages, .pip
  - .NET: bin, obj, packages, .nuget
  - Go: vendor, pkg
  - Rust: target, Cargo.lock
  - PHP: vendor, composer
  - Ruby: vendor, bundle, .bundle
  - General: dist, out, build, .build, coverage, .coverage, logs, .logs, tmp, .tmp, temp, .temp, cache, .cache
  - IDE: .vscode, .idea, .eclipse, .settings, .project, .classpath
  - Version Control: .git, .svn, .hg, .bzr
  - OS: .DS_Store, Thumbs.db, .Spotlight-V100, .Trashes, .fseventsd, .TemporaryItems
- **Performance Improvement**: Significantly faster file search by excluding build artifacts and dependencies
- **Better Context Relevance**: Only actual project source code is included in LLM context

</details>

## Version 3.0.0 (2025/10/04) - Terminal Daemon, Send Queue, Error‑first Automation

<details>
<summary>Terminal-Daemon Integration & Command Routing</summary>

- Added Go-based terminal-daemon integration for non-interactive and long-running dev commands
- Sequential command execution via Unix domain socket with accurate exit codes
- Real-time stdout/stderr streaming to VS Code Output channel (`AIDEV-IDE Terminal Capture`)
- Single `aidev-ide Terminal` reuse; only truly interactive commands open the integrated terminal
- Effective CWD now prefers `aidevIde.projectRoot`, falling back to workspace root; logged per run

</details>

## Version 2.5.9 (2025/09/15) - CodeLlama 7B Support Added

<details>
<summary>New Ollama Model Support</summary>

- **CodeLlama 7B Integration**: Added support for CodeLlama 7B model via Ollama
- **Optimized for Code Generation**: CodeLlama 7B is specifically designed for code generation and analysis tasks
- **Token Management**: 8,192 input/output token limit with automatic token counting and warnings
- **Model Selection**: Added CodeLlama 7B to the Ollama model dropdown in settings
- **Unified Interface**: Both CODE and ASK tabs can use CodeLlama 7B when selected

</details>


<details>
<summary>Output Sanitization & Error Monitoring</summary>

- Stripped ANSI/PTY control sequences from logs for clean rendering
- Expanded error pattern detection: `npm error`, `Missing script:`, `Exit status X`, `Process exited (code X)`
- Errors are auto-forwarded to chat and used to trigger LLM-based remediation (with an 8s cooldown to avoid loops)

</details>

<details>
<summary>Context Gathering Improvements (Node.js)</summary>

- `package.json` is always included first in prompt context for Node.js projects
- For Node frontend stacks (React/Vue/Angular/Svelte/Next/Nuxt/Vite/Webpack), search scope limited to `package.json` and `src/**`, explicitly excluding `node_modules/`
- Logged searched file list to debug console for transparency

</details>

<details>
<summary>Chat Send Queue & Pending UI</summary>

- Pending send queue for user questions while AI is responding; auto-drains in order after completion
- Bottom queued items bar with per-item cancel (×); updates layout padding to avoid overlap
- New questions during in-flight calls are shown immediately in chat, then sent after current response
- Error prompts always preempt the pending queue (see “Error‑first Orchestration”)

</details>

<details>
<summary>Error‑first Orchestration</summary>

- File/terminal errors automatically generate a short “fix” prompt that is sent with priority
- In-flight AI call is silently aborted (no cancel message) to prioritize error remediation
- Queue processes file operations and bash commands sequentially; delete ENOENT no longer blocks the queue

</details>

<details>
<summary>Clickable File List in Execution Queue</summary>

- The “🧩 Execution Queue Enqueued” section now lists all created/modified/deleted files
- Created/modified files are shown as clickable absolute paths; clicking opens the file in the editor
- Uses an internal link handler to safely open local files from the webview

</details>

<details>
<summary>LLM Prompt Logging & Timing</summary>

- Added start/finish banners with timestamps around LLM calls
- Logged full system prompt and user parts to help diagnose latency
- Codebase context logs are not sent to the model; only used for debugging

</details>

<details>
<summary>Long‑Running Dev Commands Handling</summary>

- `npm run dev`, `vite`, etc. are treated as long‑running; routed via daemon, not misclassified as failures
- Removed programmatic npm script pre‑validation; the LLM decides script existence/alternatives

</details>

<details>
<summary>Enhanced Model Management</summary>

- **Improved UI Structure**: Simplified AI model selection with "Ollama" as main option
- **Specific Model Selection**: Choose between Gemma3:27b, DeepSeek R1:70B, and CodeLlama 7B
- **Automatic Model Mapping**: Backend automatically maps model selections to correct AI model types
- **Migration Support**: Legacy settings automatically converted to new model structure

</details>

<details>
<summary>Multi-Language Support Updates</summary>

- **Localization Updates**: Updated all language files (Korean, English, Japanese, Chinese, German, Spanish, French)
- **Consistent Terminology**: Standardized "Ollama" terminology across all languages
- **UI Text Improvements**: Cleaner, more intuitive model selection interface

</details>

<details>
<summary>Package Release</summary>

- **VSIX Package**: [codepilot-2.5.9.vsix](release/codepilot-2.5.9.vsix) (32.46 MB)
- **Installation**: Use `code --install-extension codepilot-2.5.9.vsix` or install from VSIX in VS Code
- **Release Organization**: Package files organized in `release/` directory for better project structure

</details>

## Version 2.5.7 (2025/01/27) - Remote SSH Environment File Modification Issue Resolution

<details>
<summary>Remote SSH Environment Support Enhancement</summary>

- **Remote SSH Environment File Modification Issue Resolution**: Completely resolved the issue where source code modifications after LLM responses were not working in VSCode Remote SSH environments
- **Enhanced Path Processing**: Improved logic for accurately interpreting workspace paths and file paths in Remote SSH environments
- **URI Schema Detection**: Automatic detection and handling of Remote environments (`vscode-remote://`) vs local environments (`file://`)
- **Path Normalization**: Accurate handling of relative and absolute paths using `path.resolve()`
- **Workspace Boundary Validation**: Accurate determination of whether files are inside or outside workspace boundaries for proper URI generation

</details>

<details>
<summary>Comprehensive Debug Logging System</summary>

- **Path Processing Tracking**: Logging of workspace paths, absolute paths, and normalized paths for easy problem diagnosis
- **File Operation Step-by-Step Logging**: Detailed recording of each step in file creation/modification/deletion processes
- **Detailed Error Information**: Complete logging of name, message, code, and stack information when errors occur for troubleshooting support
- **Remote SSH Debug Tags**: Easy identification of Remote SSH related logs with `[Remote SSH Debug]` tags

</details>

<details>
<summary>File System Accessibility Validation</summary>

- **Directory Accessibility Testing**: Pre-validation of parent directory accessibility before file operations
- **Remote URI Handling**: Maintaining correct URI schemas in Remote SSH environments to ensure file system access
- **Permission and Path Error Detection**: Specific guidance messages for various file system errors
- **Inaccessible Path Warnings**: Pre-warnings for paths that cannot be accessed in Remote environments

</details>

<details>
<summary>Enhanced Error Handling and User Guidance</summary>

- **Permission Errors**: Specific resolution methods for permission-related errors like `EACCES`, `EPERM`
- **File Not Found Errors**: Path verification and resolution methods for `ENOENT` errors
- **Directory Errors**: Path structure verification guidance for `ENOTDIR` errors
- **File Exists Errors**: File status verification guidance for `EEXIST` errors
- **Remote SSH Environment-Specific Messages**: Customized resolution methods for problems that may occur in Remote SSH environments

</details>

<details>
<summary>Technical Improvements</summary>

- **Path Resolution Logic Enhancement**: Accurate handling of complex path structures in Remote SSH environments
- **File System API Utilization**: Maximum utilization of VSCode's `vscode.workspace.fs` API for improved stability
- **Error Recovery Mechanism**: Fallback system that automatically switches to alternative paths when file operations fail
- **Performance Optimization**: Reduced unnecessary file system calls and efficient path processing

</details>

## Version 2.5.6 (2025/08/26) - Markdown File Generation Fix

<details>
<summary>Markdown File Generation Fix</summary>

- **3-Stage Regex System**: Implemented a robust 3-stage regular expression system for markdown file detection
- **Sequential Fallback Mechanism**: If one regex pattern fails, the system automatically tries the next pattern
- **Enhanced Pattern Matching**: 
  - Stage 1: Strict pattern with work summary and description sections
  - Stage 2: Medium pattern with basic directives only
  - Stage 3: Simple pattern capturing all content
- **Improved Debugging**: Added comprehensive logging to track regex matching process
- **Reliable File Creation**: Markdown files are now consistently created when requested

</details>

<details>
<summary>Technical Improvements</summary>

- **Regex Pattern Optimization**: Simplified and improved markdown file detection patterns
- **Error Handling**: Better error handling for file creation operations
- **Debug Logging**: Enhanced logging system for troubleshooting file generation issues
- **Code Stability**: Improved overall stability of file generation system

</details>

## Version 2.5.4 (2025/08/21) - ASK Tab File Selection & Enhanced Settings

<details>
<summary>ASK Tab File Selection Feature</summary>

- **File Selection in ASK Tab**: Added @ file selection functionality to ASK tab for context-aware queries
- **Unified File Selection UI**: Consistent file selection interface across CODE and ASK tabs
- **Context-Aware Responses**: Selected files are included as context for better AI responses
- **File Tag Management**: Visual file tags with individual remove and clear all functionality
- **Multi-File Support**: Select multiple files for comprehensive context
- **File Picker Integration**: Native VSCode file picker with project root detection

</details>

<details>
<summary>ASK Tab Function Restrictions</summary>

- **Purpose-Specific Design**: ASK tab restricted to query-response functionality only
- **File Operation Prevention**: Blocks file creation, modification, and deletion in ASK tab
- **Terminal Command Prevention**: Prevents terminal command execution in ASK tab
- **Warning System**: Displays helpful warnings when restricted operations are attempted
- **Clear Tab Distinction**: Clear separation between CODE tab (full functionality) and ASK tab (query only)

</details>

<details>
<summary>Enhanced Settings Management</summary>

- **License Verification State Persistence**: Settings buttons now properly maintain enabled state after license verification
- **Improved Button State Management**: Fixed issue where buttons remained disabled after page reload
- **Real-time License Status**: License verification status is checked and applied on settings page load
- **Better User Experience**: No need to re-verify license when reopening settings

</details>

<details>
<summary>ASK Tab Response Display Fix</summary>

- **Response Output Fix**: Resolved issue where AI responses were not displaying in ASK tab UI despite successful generation
- **Message Handler Optimization**: Fixed duplicate message handlers causing response display conflicts
- **UI State Management**: Improved loading state management and response rendering
- **File Context Integration**: Enhanced file content processing and context integration for ASK tab queries

</details>

<details>
<summary>Token Management System</summary>

- **Input Token Calculation**: Added comprehensive token counting system for both Gemini and Ollama models
- **Model-Specific Limits**: 
  - Gemini 2.5 Flash: 1,000,000 input tokens, 500,000 output tokens
  - Gemma3:27b: 128,000 input/output tokens
- **Token Limit Warnings**: Automatic detection and user warnings when input tokens exceed model limits
- **Usage Monitoring**: Real-time token usage logging and percentage tracking

</details>

<details>
<summary>Technical Improvements</summary>

- **Type Safety**: Separated `AiModelType` and `PromptType` enums into dedicated `types.ts` file
- **Circular Dependency Resolution**: Fixed circular import issues between modules
- **Enhanced Error Handling**: Improved error messages and user feedback for token limit violations
- **Code Architecture**: Improved modular structure and dependency management

</details>

## Version 2.5.3 (2025/08/19) - Interactive Command Handling

<details>
<summary>Interactive Command Handling</summary>

- **Interactive Command Detection**: Automatically detects interactive commands like npm create, git clone, SSH, Docker, etc.
- **Automatic Response System**: Provides default responses for common interactive scenarios
- **Command Sequence Execution**: Handles multiple commands in sequence with proper timing
- **Default Response Support**: 
  - npm create commands: Default response 'y' (yes)
  - git clone: Enter key only
  - SSH connections: 'yes' for host key verification
  - Docker interactive commands: 'exit' to leave container
- **Command Sequence Management**: Status tracking and stop functionality for command sequences
- **Enhanced User Experience**: Real-time notifications for interactive command execution

</details>

<details>
<summary>Technical Improvements</summary>

- **New Functions Added**:
  - `isInteractiveCommand()`: Detects interactive commands
  - `getDefaultResponseForCommand()`: Provides default responses
  - `handleInteractiveCommand()`: Processes interactive commands
  - `executeCommandSequence()`: Executes command sequences
  - `getCommandSequenceStatus()`: Tracks execution status
  - `stopCommandSequence()`: Stops command sequences
- **Enhanced Terminal Management**: Improved command execution with timing and response handling
- **Better Error Handling**: Comprehensive error reporting for interactive commands

</details>

## Version 2.5.2 (2025/08/19) - Multi-Model AI Support & Ollama Integration

<details>
<summary>Multi-Model AI Support</summary>

- **Ollama Integration**: Added support for local Ollama Gemma3:27b model
- **Dynamic Model Selection**: AI model dropdown in settings to choose between Gemini and Ollama
- **Model-Specific Settings**: Automatic enabling/disabling of relevant settings based on selected model
- **Unified LLM Service**: Centralized service to handle both Gemini and Ollama API calls
- **Offline Capability**: Full offline AI processing with local Ollama server

</details>

<details>
<summary>Enhanced Settings Interface</summary>

- **AI Model Configuration**: New dropdown for selecting AI model (Gemini 2.5 Pro Flash / Gemma3:27b)
- **Ollama API URL Setup**: Input field for configuring local Ollama server address
- **Banya License Management**: License serial input and verification system
- **Dynamic UI**: Settings sections automatically enable/disable based on model selection
- **Default Configuration**: Gemini 2.5 Pro Flash set as default model

</details>

<details>
<summary>Automatic Bash Command Execution</summary>

- **Bash Command Detection**: Automatically detects ```bash code blocks in LLM responses
- **Terminal Integration**: Executes detected commands in VSCode's integrated terminal
- **Multi-Command Support**: Handles multiple commands in sequence from single response
- **Interactive Command Handling**: Automatically responds to interactive commands like npm create, git clone, SSH connections
- **User Notifications**: Real-time feedback on executed commands with success/error status
- **aidev-ide Terminal**: Dedicated terminal instance for aidev-ide command execution
- **Automatic Terminal Activation**: Shows terminal when commands are being executed
- **Error Handling**: Comprehensive error reporting for failed command execution
- **System Prompt Enhancement**: Updated AI instructions to include bash command format examples

</details>

<details>
<summary>Technical Improvements</summary>

- **Network Resilience**: Replaced fetch with Node.js HTTP module for reliable local connections
- **Webview Safety**: Added safePostMessage function to prevent disposed webview errors
- **Error Handling**: Enhanced error handling for network connectivity issues
- **Type Safety**: Improved TypeScript type definitions and error checking
- **Performance**: Optimized message handling and webview communication
- **Terminal Management**: New terminal manager with bash command extraction and execution capabilities

</details>

<details>
<summary>Ollama Setup Instructions</summary>

- **Server Installation**: curl -fsSL https://ollama.ai/install.sh | sh
- **Model Download**: ollama pull gemma3:27b
- **Server Start**: ollama serve
- **API URL**: Default http://localhost:11434
- **Network Configuration**: Support for local network addresses

</details>

## Version 2.5.0 (2025/08/18) - Ollama File Operations Fix & Enhanced Regex Support

<details>
<summary>Ollama File Operations Fix</summary>

- **Fixed File Path Parsing**: Resolved issue where Ollama responses included `**` suffix in file names
- **Enhanced Regex Pattern**: Improved regex to handle markdown headers (`##`) in Ollama responses
- **File Name Cleaning**: Added automatic removal of `**` suffix from file paths for accurate matching
- **Context File Matching**: Fixed issue where modified files couldn't be found in context file list
- **Debug Logging**: Added detailed logging for regex match groups to improve troubleshooting

</details>

<details>
<summary>Technical Improvements</summary>

- **Regex Pattern Enhancement**: Updated pattern to `(?:##\s*)?(새 파일|수정 파일):\s+([^\r\n]+?)(?:\r?\n\s*\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```)/g`
- **File Path Processing**: Added `llmSpecifiedPath.replace(/\*\*$/, '')` to clean file names
- **PromptType Import Fix**: Corrected import path from `geminiService` to `llmService`
- **Duplicate Type Definition Removal**: Removed duplicate `PromptType` definition in `ollamaService.ts`
- **System Prompt Enhancement**: Improved Ollama system prompt with explicit file creation instructions

</details>

<details>
<summary>Ollama Integration Improvements</summary>

- **External Server Support**: Enhanced support for external Ollama servers (Vessl AI, etc.)
- **SSL Certificate Handling**: Added SSL certificate bypass for external HTTPS servers
- **API Endpoint Flexibility**: Support for both `/api/generate` (local) and `/api/chat` (external) endpoints
- **User-Configurable Endpoints**: Added dropdown in settings for endpoint selection
- **Response Format Handling**: Automatic detection and handling of different response formats

</details>

<details>
<summary>File Operation Enhancements</summary>

- **Accurate File Matching**: Fixed context file list matching for file modifications
- **Multi-File Support**: Improved handling of multiple file operations in single response
- **Error Handling**: Enhanced error messages for file operation failures
- **Success Indicators**: Clear success/error indicators for file creation, modification, and deletion
- **Debug Information**: Added comprehensive logging for file operation debugging

</details>

## Version 2.4.1 (2024/07/10) - Improved LLM Prompt Structure & Code Generation/Modification Requests

<details>
<summary>LLM Prompt and Code Generation/Modification Request Enhancements</summary>

- Enhanced system prompt for LLM (Large Language Model) to strictly specify output format and rules for code generation, modification, and deletion requests
- Reinforced prompt structure to require full file code, per-file directives (Modified File/New File/Deleted File), work summary, and detailed explanation in every response
- Actual code context, user request, and project structure information are now always included, improving AI reliability and automation
- Work summary (created/modified/deleted files) and work description (logic, key functions/classes, improvements, test instructions, etc.) are now mandatory in responses
- Example and rules for prompt are clearly included in the system prompt to ensure consistent response format
- Directly improved and customized the prompt generation logic in geminiService.ts (user customization applied)

</details>

## Version 2.4.0 (2025/06/26) - Enhanced AI response structure & UX improvements

<details>
<summary>Enhanced AI Response Structure</summary>

- Improved system prompts for better code generation and file operations
- Structured response format with clear file operation directives
- Mandatory work summary and detailed operation descriptions
- Enhanced error handling and user feedback

</details>

<details>
<summary>Improved User Experience</summary>

- Fixed chat interface scrolling issues for immediate response visibility
- Optimized message display order: AI response → file operations → work summary → operation description
- Added emoji indicators for better visual organization:
  - 📁 File update results
  - 📋 AI work summary  
  - 💡 Work execution description
- Enhanced thinking animation with proper timing and visibility

</details>

<details>
<summary>Code Generation Enhancements</summary>

- Mandatory file operation directives: "수정 파일:", "새 파일:", "삭제 파일:"
- Complete file content output instead of partial changes
- Automatic work summary generation for all operations
- Detailed operation explanations for better understanding

</details>

<details>
<summary>File Operation Improvements</summary>

- Sequential processing: thinking animation removal → file operations → result display
- Enhanced file operation feedback with success/error indicators
- Better error handling for file creation, modification, and deletion
- Improved diff viewing for code modifications

</details>

<details>
<summary>API Key Management</summary>

- Moved Gemini API key configuration from License to Settings menu
- Centralized API key management in Settings panel
- Enhanced security with VS Code SecretStorage
- Improved API key validation and error handling

</details>

<details>
<summary>Real-time Information Enhancements</summary>

- Enhanced weather information with 7-day forecasts
- Improved news search with topic-specific queries
- Better stock information display with change indicators
- Natural language processing for information queries

</details>

<details>
<summary>Multi-Language Support</summary>

- Added comprehensive internationalization (i18n) support
- Supported languages: Korean, English, Chinese, Spanish, German, French, Japanese
- Dynamic language switching with immediate UI updates
- Localized settings interface with translated labels and descriptions
- Persistent language preference storage
- Real-time language change without requiring page reload

</details>

<details>
<summary>Technical Improvements</summary>

- Fixed webview message handling and display issues
- Enhanced code block rendering with proper syntax highlighting
- Improved context management for better AI responses
- Better error recovery and user notification system
- Optimized language data loading and caching
- Enhanced UI responsiveness for language changes

</details>

## Version 2.3b (2025/6/15) - Real-time information features

<details>
<summary>ASK tab real-time information features added</summary>

- Weather information lookup (Korean Meteorological Administration API integration)
- News information lookup (NewsAPI integration)
- Stock information lookup (Alpha Vantage API integration)
- Natural language queries for real-time information

</details>

<details>
<summary>Settings</summary>

- External API key configuration options added (weather, news, stock)
- API keys are securely managed in VS Code settings
- New API key management section in settings page
- Individual save buttons for each API key type
- Real-time status display for API key configuration

</details>

<details>
<summary>Usage</summary>

- "Seoul weather" → Current weather information for Seoul
- "News" → Latest news headlines
- "Stock" → Major stock information (AAPL, GOOGL, MSFT, TSLA, AMZN)

</details>

## Version 2.2b (2025/06/10) - API compatibility fixes

<details>
<summary>AI</summary>

- Fixed Gemini API error related to unsupported webSearch tools
- Temporarily removed web search functionality due to API compatibility issues
- ASK tab now works without web search grounding
- Improved error handling for API calls

</details>

## Version 2.1b (2025/06/5) - File selection & context

<details>
<summary>CHAT panel</summary>

- File selection feature with @ button in CODE tab
- Selected files are displayed as context tags with white borders
- Selected files remain persistent across messages for continuous context
- Horizontal divider line between file selection area and input area
- Vertical center alignment for selected file tags
- File picker starts at configured project root path
- Multiple file selection support

</details>

<details>
<summary>AI</summary>

- Selected files from @ button are included as additional context to LLM
- File context works in both CODE and ASK tabs
- Enhanced context processing for better file operation tracking

</details>

## Version 2.0.0 - Complete UI redesign

<details>
<summary>Major Changes</summary>

- Complete UI redesign with modern interface
- Added dedicated view container with CODE and ASK tabs
- Implemented persistent file selection feature
- Enhanced code block display with copy functionality
- Added real-time information features

</details>

## Version 1.4.0 - Image support & file picker

<details>
<summary>Features</summary>

- Added image support for code analysis
- Implemented file picker functionality
- Enhanced context management

</details>

## Version 1.3.0 - Enhanced chat interface

<details>
<summary>Improvements</summary>

- Enhanced chat interface with better code block display
- Added file operation tracking
- Improved error handling

</details>

## Version 1.2.0 - Project scope features

<details>
<summary>Features</summary>

- Added project scope code watching
- Implemented auto debug functionality
- Fixed various UI issues

</details>

## Version 1.1.0 - Enhanced LLM support

<details>
<summary>Enhancements</summary>

- Added support for custom LLM models
- Improved code generation accuracy
- Enhanced natural language processing

</details>

## Version 1.0.0 - Initial release

<details>
<summary>Initial Features</summary>

Initial release of aidev-ide

</details>

---

## Support

For more information or support, please contact: tony@banya.ai

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%E2%9D%A4%EF%B8%8F-red?style=for-the-badge&logo=github)](https://github.com/sponsors/tonythefreedom)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E2%98%95%EF%B8%8F-purple?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/lizsong)
