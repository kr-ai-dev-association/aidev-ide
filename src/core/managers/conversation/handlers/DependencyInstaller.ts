/**
 * DependencyInstaller
 * 의존성 파일 변경 감지 시 자동으로 패키지 설치를 실행하는 핸들러
 *
 * 탐지 우선순위:
 *   1. lock 파일 → 프로젝트 의도 결정
 *   2. manifest 필드 → 보조 의도 신호
 *   3. 실행 가능성 검증 → 선택된 도구가 실행 가능한지 확인
 *   4. 언어별 안전한 기본값
 *   5. 실행 불가 시 자동 설치 미지원 처리
 *
 * v10.x: ConversationManager에서 분리
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { ExecutionManager } from '../../execution/ExecutionManager';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { AgentConfig } from '../../../config/AgentConfig';

export class DependencyInstaller {
  /** 의존성 파일로 간주되는 파일명 목록 */
  private static readonly DEPENDENCY_FILES = new Set([
    'package.json',
    'requirements.txt',
    'pyproject.toml',
    'Pipfile',
    'go.mod',
    'go.sum',
    'Cargo.toml',
    'Gemfile',
    'composer.json',
    'pubspec.yaml',
    'build.gradle',
    'build.gradle.kts',
    'pom.xml',
    'Package.swift',
    'mix.exs',
    'build.zig',
    'gleam.toml',
    'deno.json',
    'deno.jsonc',
  ]);

  /**
   * 파일이 의존성 파일인지 확인
   */
  public static isDependencyFile(fileName: string): boolean {
    return DependencyInstaller.DEPENDENCY_FILES.has(fileName);
  }

  /**
   * 명령이 시스템에서 실행 가능한지 확인
   */
  private static isCommandAvailable(cmd: string): boolean {
    try {
      require('child_process').execSync(`${cmd} --version`, {
        stdio: 'ignore',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Node.js 프로젝트의 패키지 매니저 설치 명령 결정
   * 우선순위: lock 파일 → packageManager 필드 → 시스템 기본값
   */
  private static resolveNodeInstallCommand(depDir: string): { command: string; description: string } | null {
    const fs = require('fs');

    // 1순위: lock 파일로 프로젝트 의도 결정
    const lockFileMap: Array<{ file: string; cmd: string; desc: string }> = [
      { file: 'pnpm-lock.yaml', cmd: 'pnpm install', desc: 'pnpm install' },
      { file: 'yarn.lock', cmd: 'yarn install', desc: 'yarn install' },
      { file: 'bun.lockb', cmd: 'bun install', desc: 'bun install' },
      { file: 'bun.lock', cmd: 'bun install', desc: 'bun install' },
      { file: 'package-lock.json', cmd: 'npm install', desc: 'npm install' },
    ];

    for (const { file, cmd, desc } of lockFileMap) {
      if (fs.existsSync(path.join(depDir, file))) {
        const tool = cmd.split(' ')[0];
        if (DependencyInstaller.isCommandAvailable(tool)) {
          return { command: cmd, description: desc };
        }
        // lock 파일은 있지만 도구가 없으면 corepack 시도
        if (DependencyInstaller.isCommandAvailable('corepack')) {
          return { command: `corepack ${cmd}`, description: `corepack ${desc}` };
        }
        console.warn(`[AutoInstall] ${file} found but ${tool} not available, skipping`);
        return null;
      }
    }

    // 2순위: package.json의 packageManager 필드
    try {
      const pkgPath = path.join(depDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.packageManager) {
          const manager = pkg.packageManager.split('@')[0]; // "pnpm@9.0.0" → "pnpm"
          if (['pnpm', 'yarn', 'bun', 'npm'].includes(manager)) {
            if (DependencyInstaller.isCommandAvailable(manager)) {
              return { command: `${manager} install`, description: `${manager} install` };
            }
            if (DependencyInstaller.isCommandAvailable('corepack')) {
              return { command: `corepack ${manager} install`, description: `corepack ${manager} install` };
            }
          }
        }
      }
    } catch {
      // package.json 파싱 실패 → 다음 단계로
    }

    // 3순위: 시스템 기본값 (npm은 Node.js와 함께 설치됨)
    if (DependencyInstaller.isCommandAvailable('npm')) {
      return { command: 'npm install', description: 'npm install' };
    }

    return null;
  }

  /**
   * Python 프로젝트의 패키지 매니저 설치 명령 결정
   * 우선순위: lock 파일 → pyproject.toml 설정 → 시스템 기본값
   */
  private static resolvePythonInstallCommand(depDir: string, triggerFile: string): { command: string; description: string } | null {
    const fs = require('fs');

    // 1순위: lock 파일로 프로젝트 의도 결정
    const lockFileMap: Array<{ file: string; cmd: string; desc: string }> = [
      { file: 'uv.lock', cmd: 'uv sync', desc: 'uv sync' },
      { file: 'poetry.lock', cmd: 'poetry install', desc: 'poetry install' },
      { file: 'Pipfile.lock', cmd: 'pipenv install', desc: 'pipenv install' },
      { file: 'pdm.lock', cmd: 'pdm install', desc: 'pdm install' },
    ];

    for (const { file, cmd, desc } of lockFileMap) {
      if (fs.existsSync(path.join(depDir, file))) {
        const tool = cmd.split(' ')[0];
        if (DependencyInstaller.isCommandAvailable(tool)) {
          return { command: cmd, description: desc };
        }
        console.warn(`[AutoInstall] ${file} found but ${tool} not available, skipping`);
        return null;
      }
    }

    // 2순위: pyproject.toml의 빌드 백엔드 / 도구 설정 확인
    if (triggerFile === 'pyproject.toml') {
      try {
        const content = fs.readFileSync(path.join(depDir, 'pyproject.toml'), 'utf-8');
        if (content.includes('[tool.uv]') && DependencyInstaller.isCommandAvailable('uv')) {
          return { command: 'uv sync', description: 'uv sync' };
        }
        if (content.includes('[tool.poetry]') && DependencyInstaller.isCommandAvailable('poetry')) {
          return { command: 'poetry install', description: 'poetry install' };
        }
        if (content.includes('[tool.pdm]') && DependencyInstaller.isCommandAvailable('pdm')) {
          return { command: 'pdm install', description: 'pdm install' };
        }
        if (content.includes('[tool.hatch]') && DependencyInstaller.isCommandAvailable('hatch')) {
          return { command: 'hatch env create', description: 'hatch env create' };
        }
        // build-backend 기반 감지
        if (content.includes('hatchling') && DependencyInstaller.isCommandAvailable('hatch')) {
          return { command: 'hatch env create', description: 'hatch env create' };
        }
        if (content.includes('pdm-backend') && DependencyInstaller.isCommandAvailable('pdm')) {
          return { command: 'pdm install', description: 'pdm install' };
        }
      } catch {
        // 파싱 실패 → 다음 단계로
      }
    }

    // 3순위: Pipfile → pipenv
    if (triggerFile === 'Pipfile') {
      if (DependencyInstaller.isCommandAvailable('pipenv')) {
        return { command: 'pipenv install', description: 'pipenv install' };
      }
    }

    // 4순위: requirements.txt → pip
    if (triggerFile === 'requirements.txt') {
      // uv가 있으면 우선 사용 (더 빠름)
      if (DependencyInstaller.isCommandAvailable('uv')) {
        return { command: 'uv pip install -r requirements.txt', description: 'uv pip install' };
      }
      if (DependencyInstaller.isCommandAvailable('pip')) {
        return { command: 'pip install -r requirements.txt', description: 'pip install' };
      }
      if (DependencyInstaller.isCommandAvailable('pip3')) {
        return { command: 'pip3 install -r requirements.txt', description: 'pip3 install' };
      }
    }

    // pyproject.toml 기본 fallback
    if (triggerFile === 'pyproject.toml') {
      if (DependencyInstaller.isCommandAvailable('uv')) {
        return { command: 'uv pip install .', description: 'uv pip install' };
      }
      if (DependencyInstaller.isCommandAvailable('pip')) {
        return { command: 'pip install .', description: 'pip install' };
      }
    }

    return null;
  }

  /**
   * 변경된 의존성 파일에 대한 설치 명령 결정
   */
  public static resolveInstallCommand(depDir: string, triggerFile: string): { command: string; description: string } | null {
    switch (triggerFile) {
      // ── JavaScript / TypeScript ──
      case 'package.json':
        return DependencyInstaller.resolveNodeInstallCommand(depDir);

      // ── Python ──
      case 'requirements.txt':
      case 'pyproject.toml':
      case 'Pipfile':
        return DependencyInstaller.resolvePythonInstallCommand(depDir, triggerFile);

      // ── Go ──
      case 'go.mod':
      case 'go.sum':
        if (DependencyInstaller.isCommandAvailable('go')) {
          return { command: 'go mod tidy', description: 'go mod tidy' };
        }
        return null;

      // ── Rust ──
      case 'Cargo.toml':
        if (DependencyInstaller.isCommandAvailable('cargo')) {
          return { command: 'cargo build', description: 'cargo build' };
        }
        return null;

      // ── Ruby ──
      case 'Gemfile':
        if (DependencyInstaller.isCommandAvailable('bundle')) {
          return { command: 'bundle install', description: 'bundle install' };
        }
        return null;

      // ── PHP ──
      case 'composer.json':
        if (DependencyInstaller.isCommandAvailable('composer')) {
          return { command: 'composer install', description: 'composer install' };
        }
        return null;

      // ── Dart / Flutter ──
      case 'pubspec.yaml':
        if (DependencyInstaller.isCommandAvailable('flutter')) {
          return { command: 'flutter pub get', description: 'flutter pub get' };
        }
        if (DependencyInstaller.isCommandAvailable('dart')) {
          return { command: 'dart pub get', description: 'dart pub get' };
        }
        return null;

      // ── Java / JVM ──
      case 'build.gradle':
      case 'build.gradle.kts':
        if (DependencyInstaller.isCommandAvailable('./gradlew')) {
          return { command: './gradlew build', description: 'gradlew build' };
        }
        if (DependencyInstaller.isCommandAvailable('gradle')) {
          return { command: 'gradle build', description: 'gradle build' };
        }
        return null;

      case 'pom.xml':
        if (DependencyInstaller.isCommandAvailable('./mvnw')) {
          return { command: './mvnw install', description: 'mvnw install' };
        }
        if (DependencyInstaller.isCommandAvailable('mvn')) {
          return { command: 'mvn install', description: 'mvn install' };
        }
        return null;

      // ── Swift ──
      case 'Package.swift':
        if (DependencyInstaller.isCommandAvailable('swift')) {
          return { command: 'swift package resolve', description: 'swift package resolve' };
        }
        return null;

      // ── Elixir ──
      case 'mix.exs':
        if (DependencyInstaller.isCommandAvailable('mix')) {
          return { command: 'mix deps.get', description: 'mix deps.get' };
        }
        return null;

      // ── Zig ──
      case 'build.zig':
        if (DependencyInstaller.isCommandAvailable('zig')) {
          return { command: 'zig build', description: 'zig build' };
        }
        return null;

      // ── Gleam ──
      case 'gleam.toml':
        if (DependencyInstaller.isCommandAvailable('gleam')) {
          return { command: 'gleam deps download', description: 'gleam deps download' };
        }
        return null;

      // ── Deno ──
      case 'deno.json':
      case 'deno.jsonc':
        if (DependencyInstaller.isCommandAvailable('deno')) {
          return { command: 'deno install', description: 'deno install' };
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * 의존성 파일 변경 감지 시 자동으로 패키지 설치 실행
   */
  public static async autoInstall(
    webview: vscode.Webview,
    workspaceRoot: string,
    createdFiles: string[],
    modifiedFiles: string[],
  ): Promise<void> {
    const allFiles = [...createdFiles, ...modifiedFiles];
    const executionManager = ExecutionManager.getInstance();
    const processedDirs = new Set<string>();

    for (const filePath of allFiles) {
      const fileName = path.basename(filePath);
      if (!DependencyInstaller.DEPENDENCY_FILES.has(fileName)) continue;

      const depDir = path.isAbsolute(filePath)
        ? path.dirname(filePath)
        : path.join(workspaceRoot, path.dirname(filePath));

      // 같은 디렉토리에서 중복 실행 방지
      const dirKey = `${depDir}:${fileName}`;
      if (processedDirs.has(dirKey)) continue;
      processedDirs.add(dirKey);

      const resolved = DependencyInstaller.resolveInstallCommand(depDir, fileName);
      if (!resolved) {
        console.warn(
          `[AutoInstall] ${fileName} changed but no suitable install command found in ${depDir}`,
        );
        continue;
      }

      console.log(
        `[AutoInstall] ${filePath} changed → running "${resolved.command}" in ${depDir}`,
      );
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
        `${resolved.description} 실행 중...`,
      );

      try {
        const result = await executionManager.executeCommand(resolved.command, {
          cwd: depDir,
          timeout: AgentConfig.VALIDATION_COMMAND_TIMEOUT,
        });

        if (result.exitCode === 0) {
          console.log(`[AutoInstall] ${resolved.description} completed successfully`);
        } else {
          console.warn(
            `[AutoInstall] ${resolved.description} failed (exit ${result.exitCode}): ${result.stderr || result.stdout || ""}`,
          );
        }
      } catch (error) {
        console.warn(`[AutoInstall] ${resolved.description} error (non-fatal):`, error);
      }
    }
  }
}
