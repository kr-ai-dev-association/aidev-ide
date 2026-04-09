import * as vscode from "vscode";
import * as http from "http";
import * as url from "url";

/**
 * CodePilot 인증 서비스
 * Google OAuth → JWT 토큰 관리
 *
 * 로컬 루프백 HTTP 서버 방식
 * GCP에서 "데스크톱 애플리케이션" 타입 클라이언트 사용 → http://127.0.0.1 자동 허용
 */
export class AuthService {
  private static instance: AuthService;
  private context: vscode.ExtensionContext;
  private _onDidChangeAuth = new vscode.EventEmitter<boolean>();
  readonly onDidChangeAuth = this._onDidChangeAuth.event;
  private _oauthServer?: http.Server;
  private _refreshPromise: Promise<string | null> | null = null;

  private static readonly ACCESS_TOKEN_KEY = "codepilot.accessToken";
  private static readonly REFRESH_TOKEN_KEY = "codepilot.refreshToken";
  private static readonly USER_INFO_KEY = "codepilot.userInfo";

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

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

  /**
   * Google OAuth 로그인 (로컬 루프백 서버 방식)
   *
   * 1. 랜덤 포트로 임시 HTTP 서버 시작
   * 2. 브라우저에서 Google OAuth 진행
   * 3. Google이 http://127.0.0.1:{port}/callback 으로 리다이렉트
   * 4. 서버가 code를 받아서 백엔드로 교환
   * 5. 서버 종료
   */
  async loginWithGoogle(): Promise<void> {
    const config = vscode.workspace.getConfiguration("codepilot");
    const clientId = (config.get("googleClientId") as string) || "";

    if (!clientId) {
      vscode.window.showErrorMessage("Google Client ID가 설정되지 않았습니다.");
      throw new Error("Google Client ID not configured");
    }

    // 이전 서버가 남아있으면 정리
    if (this._oauthServer) {
      this._oauthServer.close();
      this._oauthServer = undefined;
    }

    // 임시 HTTP 서버 시작
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url || "", true);
      if (parsed.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = parsed.query.code as string;
      const error = parsed.query.error as string;

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>로그인 취소됨</h2><p>${error}</p><p>이 창을 닫아도 됩니다.</p></body></html>`);
        server.close();
        this._oauthServer = undefined;
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>인증 실패</h2><p>인증 코드를 받지 못했습니다.</p></body></html>`);
        server.close();
        this._oauthServer = undefined;
        return;
      }

      // 성공 페이지 먼저 표시
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>인증 완료!</h2><p>VS Code로 돌아가세요. 이 창은 닫아도 됩니다.</p></body></html>`);

      // 서버 종료 (port 변수는 클로저로 접근)
      server.close();
      this._oauthServer = undefined;

      // 백엔드로 code 교환
      try {
        const { CodePilotApiClient } = await import("../api/CodePilotApiClient");
        const api = CodePilotApiClient.getInstance();
        const redirectUri = `http://127.0.0.1:${port}/callback`;

        const raw: any = await api.post("/auth/oauth/google/", {
          code,
          redirect_uri: redirectUri,
        });

        // WrapResponseMiddleware가 {"data": ...}로 래핑하므로 언래핑
        const result = raw.data || raw;

        // 토큰 저장
        if (result.access_token) {
          await this.context.secrets.store(AuthService.ACCESS_TOKEN_KEY, result.access_token);
        }
        if (result.refresh_token) {
          await this.context.secrets.store(AuthService.REFRESH_TOKEN_KEY, result.refresh_token);
        }

        // 사용자 정보 저장
        const userInfo = {
          email: result.user?.email || "",
          name: result.user?.name || "",
          avatar_url: result.user?.avatar_url || "",
          organization: result.user?.organization_name || "",
          organization_id: result.user?.organization_id || "",
          role: result.user?.role || "",
          apiKeyName: result.user?.api_key_name || "",
          apiKeyMasked: result.user?.api_key_masked || "",
        };
        await this.context.globalState.update(AuthService.USER_INFO_KEY, userInfo);

        this._onDidChangeAuth.fire(true);
      } catch (e: any) {
        const msg = e?.message || "알 수 없는 오류";
        console.error("[AuthService] OAuth 코드 교환 실패:", msg);
        console.error("[AuthService] 에러 상세:", e);
        console.error("[AuthService] 에러 스택:", e?.stack);
        vscode.window.showErrorMessage(`로그인 실패: ${msg}`);
        this._onDidChangeAuth.fire(false);

        // 에러 리포팅
        import('../error/ErrorReportingService').then(({ ErrorReportingService }) => {
          ErrorReportingService.getInstance().reportAuthError(`Google OAuth failed: ${msg}`);
        }).catch(() => {});
      }
    });

    this._oauthServer = server;

    // 랜덤 포트로 서버 시작
    const port = await new Promise<number>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        resolve(addr.port);
      });
      server.on("error", reject);
    });

    // 2분 타임아웃
    setTimeout(() => {
      if (this._oauthServer === server) {
        server.close();
        this._oauthServer = undefined;
      }
    }, 120_000);

    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=openid%20email%20profile&` +
      `access_type=offline&` +
      `prompt=consent`;

    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
  }

  /**
   * OAuth 콜백 처리 (UriHandler에서 호출, 레거시 호환)
   * 현재 Google OAuth는 로컬 루프백 서버에서 직접 처리하므로 이 메서드는 사용되지 않음
   */
  async handleOAuthCallback(_uri: vscode.Uri): Promise<void> {
    // 루프백 서버 방식에서는 서버 콜백에서 직접 처리
    console.log("[AuthService] handleOAuthCallback called but OAuth is handled by loopback server");
  }

  async getAccessToken(): Promise<string | undefined> {
    return this.context.secrets.get(AuthService.ACCESS_TOKEN_KEY);
  }

  async getRefreshToken(): Promise<string | undefined> {
    return this.context.secrets.get(AuthService.REFRESH_TOKEN_KEY);
  }

  async setAccessToken(token: string): Promise<void> {
    await this.context.secrets.store(AuthService.ACCESS_TOKEN_KEY, token);
  }

  getUserInfo(): any {
    return this.context.globalState.get(AuthService.USER_INFO_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getUserInfo();
  }

  /**
   * 인증 상태 정보 반환 (웹뷰에 전달용)
   */
  getAuthState(): { loggedIn: boolean; user?: any } {
    const userInfo = this.getUserInfo();
    return {
      loggedIn: !!userInfo,
      user: userInfo || undefined,
    };
  }

  async logout(): Promise<void> {
    try {
      const { CodePilotApiClient } = await import("../api/CodePilotApiClient");
      const api = CodePilotApiClient.getInstance();
      await api.post("/auth/logout/", {});
    } catch {
      // 서버 로그아웃 실패해도 로컬 정리
    }

    await this.context.secrets.delete(AuthService.ACCESS_TOKEN_KEY);
    await this.context.secrets.delete(AuthService.REFRESH_TOKEN_KEY);
    await this.context.globalState.update(AuthService.USER_INFO_KEY, undefined);
    // 프로젝트 선택 초기화 (다른 계정 로그인 시 이전 프로젝트 잔류 방지)
    await this.context.globalState.update('codepilot.projectId', undefined);

    this._onDidChangeAuth.fire(false);
    vscode.window.showInformationMessage("로그아웃되었습니다");
  }

  /**
   * 토큰 리프레시 (중복 요청 방지)
   * 여러 API 호출이 동시에 401을 받아도 refresh 요청은 1번만 수행
   */
  async refreshAccessToken(): Promise<string | null> {
    // 이미 진행 중인 refresh가 있으면 그 결과를 공유
    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    this._refreshPromise = this._doRefresh();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<string | null> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const { CodePilotApiClient } = await import("../api/CodePilotApiClient");
      const api = CodePilotApiClient.getInstance();

      const raw: any = await api.post("/auth/refresh/", {
        refresh_token: refreshToken,
      });

      // WrapResponseMiddleware가 {"data": ...}로 래핑하므로 언래핑
      const result = raw.data || raw;

      await this.context.secrets.store(
        AuthService.ACCESS_TOKEN_KEY,
        result.access_token
      );
      await this.context.secrets.store(
        AuthService.REFRESH_TOKEN_KEY,
        result.refresh_token
      );

      return result.access_token;
    } catch (err: any) {
      // 리프레시 실패 → 로그아웃
      import('../error/ErrorReportingService').then(({ ErrorReportingService }) => {
        ErrorReportingService.getInstance().reportAuthError(`Token refresh failed: ${err?.message || 'unknown'}`);
      }).catch(() => {});

      await this.logout();
      return null;
    }
  }
}
