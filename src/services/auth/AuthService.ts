import * as vscode from "vscode";

/**
 * AuthService no-op stub.
 * Keeps the same public API surface so existing imports compile,
 * but all server calls, OAuth logic, and token refresh are removed.
 */
export class AuthService {
  private static instance: AuthService;
  private _onDidChangeAuth = new vscode.EventEmitter<boolean>();
  readonly onDidChangeAuth = this._onDidChangeAuth.event;

  private constructor(_context: vscode.ExtensionContext) {}

  static initialize(context: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(context);
    }
    return AuthService.instance;
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      throw new Error("AuthService가 초기화되지 않았습니다");
    }
    return AuthService.instance;
  }

  isLoggedIn(): boolean {
    return false;
  }

  async getAccessToken(): Promise<string | null> {
    return null;
  }

  getUserInfo(): any {
    return null;
  }

  async loginWithGoogle(): Promise<void> {}

  async handleOAuthCallback(_uri: vscode.Uri): Promise<void> {}

  async logout(): Promise<void> {}

  getAuthState(): { loggedIn: boolean; user?: any } {
    return { loggedIn: false };
  }

  async refreshAccessToken(): Promise<string | null> {
    return null;
  }

  async getRefreshToken(): Promise<string | undefined> {
    return undefined;
  }

  async setAccessToken(_token: string): Promise<void> {}

  dispose(): void {
    this._onDidChangeAuth.dispose();
  }
}
