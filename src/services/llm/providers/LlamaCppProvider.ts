/**
 * llama.cpp Native Provider
 *
 * llama-server (또는 호환 wrapper) 의 native `/completion` 엔드포인트를 호출.
 * `/v1/chat/completions` (OpenAI-compat) 가 없는 서버를 대상으로 한다.
 *
 * Request:  POST <endpoint>  body: { prompt, n_predict, temperature, top_p, stream, stop, ... }
 * Response (non-stream): { content, stop_reason?, tokens_predicted?, model?, ... }
 * Response (stream): SSE 또는 NDJSON — 각 청크 `{ content: "...", stop: false }`, 종료 `{ stop: true, ... }`
 *
 * 주의: /completion 은 단일 prompt 문자열만 받음. 멀티턴 messages 는 클라이언트가
 * 단순 role-prefix 포맷("System: ...\n\nUser: ...\n\nAssistant: ") 으로 직렬화.
 * 모델별 정밀 chat-template 이 필요하면 OpenAI-compat 엔드포인트(/v1/chat/completions)
 * 사용 권장 — OpenAICompatProvider 가 처리한다.
 */

import {
  AdminModelConfig,
  AdminModelMessagePart,
  SendOptions,
  ChunkCallback,
} from "../AdminModelTypes";
import { ILLMProvider } from "./ILLMProvider";
import { buildRequest, assertResponseField } from "./providerUtils";

const DEFAULT_STOP = ["\nUser:", "\nSystem:", "\nuser:", "\nsystem:"];

export class LlamaCppProvider implements ILLMProvider {
  constructor(private config: AdminModelConfig) {}

  /** 멀티턴 messages → /completion 용 단일 prompt 문자열 */
  private buildPrompt(
    systemPrompt: string | undefined,
    userText: string,
  ): string {
    const parts: string[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      parts.push(`System: ${systemPrompt.trim()}`);
    }
    parts.push(`User: ${userText}`);
    parts.push("Assistant: ");
    return parts.join("\n\n");
  }

  /** /completion 요청 body */
  private buildBody(
    prompt: string,
    stream: boolean,
    options?: SendOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prompt,
      n_predict: this.config.maxOutputTokens || this.config.maxTokens || 2048,
      temperature: this.config.defaultTemperature ?? 0.7,
      top_p: this.config.topP ?? 0.9,
      stream,
      stop: DEFAULT_STOP,
      cache_prompt: true, // llama.cpp prompt prefix 캐시 활용 — 멀티턴 빠름
    };
    if (options?.signal) {
      // signal 은 fetch 에 직접 전달, body 에는 포함 X
    }
    return body;
  }

  async send(
    messageOrParts: string | AdminModelMessagePart[],
    systemPrompt?: string,
    options?: SendOptions,
  ): Promise<string> {
    const userText =
      typeof messageOrParts === "string"
        ? messageOrParts
        : messageOrParts.map((p) => p.text || "").join("\n");

    const prompt = this.buildPrompt(systemPrompt, userText);
    const body = this.buildBody(prompt, false, options);

    const { url, headers } = buildRequest(this.config, this.config.endpoint);
    console.log(
      `[LlamaCppProvider] model=${this.config.model} streaming=false endpoint=${this.config.endpoint}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Admin Model API (llama.cpp) error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data: any = await response.json();
    assertResponseField(data, "content");

    const content: string =
      typeof data.content === "string" ? data.content : "";

    // gpt-oss 등 reasoning 모델: <think>...</think> 자동 보존
    const stopReason = data.stop_reason || data.stopped_reason;
    if (stopReason === "length" || data.truncated === true) {
      return content + "\n[MAX_TOKENS_REACHED]";
    }
    return content;
  }

  async stream(
    systemPrompt: string,
    userParts: AdminModelMessagePart[],
    onChunk: ChunkCallback,
    options?: SendOptions,
  ): Promise<string> {
    const userText = userParts.map((p) => p.text || "").join("\n");
    const prompt = this.buildPrompt(systemPrompt, userText);
    const body = this.buildBody(prompt, true, options);

    const { url, headers } = buildRequest(this.config, this.config.endpoint);
    console.log(
      `[LlamaCppProvider] model=${this.config.model} streaming=true endpoint=${this.config.endpoint}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      onChunk("", true);
      throw new Error(
        `Admin Model API (llama.cpp) error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      onChunk("", true);
      throw new Error("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // llama.cpp 의 streaming 포맷은 두 가지 — SSE("data: {...}\n\n") 또는 NDJSON("{...}\n").
      // 둘 다 대응: 줄 단위로 끊고 'data:' 프리픽스 있으면 제거.
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const jsonStr = trimmed.startsWith("data:")
          ? trimmed.slice(5).trim()
          : trimmed;
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const parsed: any = JSON.parse(jsonStr);
          const delta: string =
            typeof parsed.content === "string" ? parsed.content : "";
          if (delta) {
            fullText += delta;
            onChunk(delta, false);
          }

          const stopFlag = parsed.stop === true || parsed.stopped === true;
          if (stopFlag) {
            if (
              parsed.stop_reason === "length" ||
              parsed.stopped_limit === true ||
              parsed.truncated === true
            ) {
              truncated = true;
            }
            onChunk("", true);
            return truncated ? fullText + "\n[MAX_TOKENS_REACHED]" : fullText;
          }
        } catch {
          // 파싱 실패 청크는 skip — 일부 wrapper 가 metadata 라인 끼움
          continue;
        }
      }
    }

    // stream 이 stop=true 없이 끝난 경우
    onChunk("", true);
    return truncated ? fullText + "\n[MAX_TOKENS_REACHED]" : fullText;
  }
}
