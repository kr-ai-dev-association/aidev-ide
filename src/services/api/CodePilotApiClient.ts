/**
 * CodePilot Backend API 클라이언트 (no-op stub)
 * 모든 네트워크 호출이 제거된 스텁 구현
 */
export class CodePilotApiClient {
  private static instance: CodePilotApiClient;

  private constructor() {}

  static getInstance(): CodePilotApiClient {
    if (!CodePilotApiClient.instance) {
      CodePilotApiClient.instance = new CodePilotApiClient();
    }
    return CodePilotApiClient.instance;
  }

  async get<T = any>(_path: string, _params?: Record<string, string>): Promise<T> {
    return {} as T;
  }

  async post<T = any>(_path: string, _body: any): Promise<T> {
    return {} as T;
  }

  async patch<T = any>(_path: string, _body: any): Promise<T> {
    return {} as T;
  }

  async delete<T = any>(_path: string): Promise<T> {
    return {} as T;
  }

  async getEffectiveSettings(_category: string, _orgId: string): Promise<any[]> {
    return [];
  }

  async getAllEffectiveSettings(_orgId?: string): Promise<Record<string, any[]>> {
    return {};
  }

  async updateUserSetting(
    _category: string,
    _key: string,
    _value: any,
    _orgId: string
  ): Promise<any> {
    return null;
  }

  async searchRag(
    _query: string,
    _orgId?: string,
    _sourceIds?: string[],
    _topK: number = 5
  ): Promise<any[]> {
    return [];
  }

  async getRagSources(_orgId?: string): Promise<any[]> {
    return [];
  }

  async reportUsage(_data: {
    org_id?: string;
    model_name: string;
    token_input: number;
    token_output: number;
    api_calls: number;
  }): Promise<void> {}

  async reportError(_data: {
    level: string;
    message: string;
    stack_trace?: string;
    source?: string;
    metadata?: any;
  }): Promise<void> {}
}
