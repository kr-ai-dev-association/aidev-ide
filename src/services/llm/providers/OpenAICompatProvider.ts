/**
 * OpenAI-compatible Provider
 * OpenAI, Azure, Groq, DeepSeek, Mistral, Together, xAI, Fireworks,
 * Perplexity, Cerebras, SambaNova 등 /chat/completions 엔드포인트
 */

import {
  AdminModelConfig,
  AdminModelMessagePart,
  SendOptions,
  ChunkCallback,
} from "../AdminModelTypes";
import { ILLMProvider } from "./ILLMProvider";
import { buildRequest, assertResponseField } from "./providerUtils";

export class OpenAICompatProvider implements ILLMProvider {
  constructor(private config: AdminModelConfig) {}

  /**
   * 요청 대상이 실제 OpenAI 또는 Azure OpenAI인지 여부.
   * max_completion_tokens 규약은 OpenAI/Azure 전용이므로, 추론 모델 분기를
   * 여기에만 한정한다. provider 라벨(openai/azure) 또는 엔드포인트 호스트로 판별.
   */
  private isOpenAIEndpoint(): boolean {
    const provider = (this.config.provider || "").toLowerCase();
    if (provider === "openai" || provider === "azure") return true;
    const endpoint = (this.config.endpoint || "").toLowerCase();
    return (
      endpoint.includes("api.openai.com") ||
      endpoint.includes("openai.azure.com")
    );
  }

  /**
   * OpenAI/Azure 추론 모델(o-시리즈, GPT-5+) 여부.
   * 엔드포인트가 OpenAI/Azure일 때만 모델명 패턴(provider/model 접두사 형태 포함,
   * 예: openai/gpt-5.1)으로 판별한다. vllm·Groq·DeepSeek 등 다른 호환 엔드포인트는
   * 모델 이름이 `gpt-5`·`o3` 같아도 추론 모델로 오인하지 않고 기존 동작을 유지한다.
   */
  private isReasoningModel(): boolean {
    if (!this.isOpenAIEndpoint()) return false;
    return /(?:^|\/)(o\d|gpt-5)/i.test(this.config.model || "");
  }

  /**
   * 토큰/샘플링 파라미터 분기.
   * - 추론 모델: max_completion_tokens 필수, temperature·top_p는 미지원(보내면 400) → 생략
   * - 일반 모델: 기존대로 max_tokens + temperature + top_p
   */
  private buildTokenParams(): Record<string, unknown> {
    const maxTokens =
      this.config.maxOutputTokens || this.config.maxTokens || 16384;
    if (this.isReasoningModel()) {
      return { max_completion_tokens: maxTokens };
    }
    return {
      temperature: this.config.defaultTemperature ?? 0.7,
      top_p: this.config.topP ?? 0.9,
      max_tokens: maxTokens,
    };
  }

  async send(
    messageOrParts: string | AdminModelMessagePart[],
    systemPrompt?: string,
    options?: SendOptions,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    if (typeof messageOrParts === "string") {
      messages.push({ role: "user", content: messageOrParts });
    } else {
      const userContent = messageOrParts
        .map((part) => part.text || "")
        .join("\n");
      messages.push({ role: "user", content: userContent });
    }

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: false,
      ...this.buildTokenParams(),
    };

    const isGeminiCompat = (this.config.endpoint || "").includes(
      "generativelanguage.googleapis.com",
    );
    if (isGeminiCompat) {
      // Gemini OpenAI-compat: reasoning_effort 사용 (top-level thinking_config/google 키는 미지원)
      if (!options?.disableThinking) {
        requestBody.reasoning_effort = options?.thinkingLevel || "medium";
      }
    } else if (options?.disableThinking && !this.isReasoningModel()) {
      // 추론 모델(GPT-5/o-시리즈)에는 비표준 think 파라미터를 보내지 않는다(거부됨).
      requestBody.think = false;
      console.log(
        "[OpenAICompatProvider] Thinking disabled (tool calling mode)",
      );
    }

    if (options?.nativeTools && options.nativeTools.length > 0) {
      requestBody.tools = options.nativeTools;
      requestBody.tool_choice = "auto";
    }

    const { url, headers } = buildRequest(this.config, this.config.endpoint);
    console.log(
      `[OpenAICompatProvider] model=${this.config.model} streaming=false nativeTools=${!!options?.nativeTools} geminiCompat=${isGeminiCompat} thinking=${isGeminiCompat && !options?.disableThinking}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Admin Model API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data: any = await response.json();
    assertResponseField(data, "choices");

    if (!data.choices || data.choices.length === 0) {
      throw new Error("Invalid response from Admin Model API: no choices");
    }

    const toolCalls = data.choices[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      console.log(
        "[OpenAICompatProvider] Native tool_calls received, count:",
        toolCalls.length,
      );
      return toolCalls
        .map((tc: any) => {
          const fn = tc.function;
          const args =
            typeof fn.arguments === "string"
              ? JSON.parse(fn.arguments)
              : fn.arguments || {};
          return JSON.stringify({ tool: fn.name, ...args });
        })
        .join("\n");
    }

    const content = data.choices[0]?.message?.content || "";
    const finishReason = data.choices[0]?.finish_reason;
    return finishReason === "length"
      ? content + "\n[MAX_TOKENS_REACHED]"
      : content;
  }

  async stream(
    systemPrompt: string,
    userParts: AdminModelMessagePart[],
    onChunk: ChunkCallback,
    options?: SendOptions,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({
      role: "user",
      content: userParts.map((p) => p.text || "").join("\n"),
    });

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: true,
      ...this.buildTokenParams(),
    };

    const isGeminiCompat = (this.config.endpoint || "").includes(
      "generativelanguage.googleapis.com",
    );
    if (isGeminiCompat) {
      if (!options?.disableThinking) {
        requestBody.reasoning_effort = options?.thinkingLevel || "medium";
      }
    } else if (options?.disableThinking && !this.isReasoningModel()) {
      // 추론 모델(GPT-5/o-시리즈)에는 비표준 think 파라미터를 보내지 않는다(거부됨).
      requestBody.think = false;
      console.log(
        "[OpenAICompatProvider] Streaming: Thinking disabled (tool calling mode)",
      );
    }

    if (options?.nativeTools && options.nativeTools.length > 0) {
      requestBody.tools = options.nativeTools;
      requestBody.tool_choice = "auto";
    }

    const { url, headers } = buildRequest(this.config, this.config.endpoint);
    console.log(
      `[OpenAICompatProvider] model=${this.config.model} streaming=true nativeTools=${!!options?.nativeTools} geminiCompat=${isGeminiCompat} thinking=${isGeminiCompat && !options?.disableThinking}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      onChunk("", true);
      throw new Error(
        `Admin Model API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      onChunk("", true);
      throw new Error("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let thinkingText = "";
    let buffer = "";
    let lastFinishReason = "";
    // OpenCode 방식: 배열 위치 기반 (Gemini는 index 필드를 안 보냄 → length 폴백)
    const streamingToolCalls: Array<{
      id: string;
      name: string;
      argumentsStr: string;
    }> = [];
    const firedNativeIndices = new Set<number>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          const maxTokensReached = lastFinishReason === "length";
          if (maxTokensReached) {
            console.log(
              "[OpenAICompatProvider] ⚠️ MAX_TOKENS reached in streaming",
            );
          }
          // Fire onNativeToolComplete for any remaining unfired tool_calls
          for (let i = 0; i < streamingToolCalls.length; i++) {
            if (streamingToolCalls[i] && !firedNativeIndices.has(i)) {
              firedNativeIndices.add(i);
              try {
                const args = streamingToolCalls[i].argumentsStr
                  ? JSON.parse(streamingToolCalls[i].argumentsStr)
                  : {};
                options?.onNativeToolComplete?.(
                  streamingToolCalls[i].name,
                  args,
                );
              } catch {
                /* skip */
              }
            }
          }
          const validToolCalls = streamingToolCalls.filter((tc) => tc.name);
          if (validToolCalls.length > 0) {
            const converted = validToolCalls
              .map((tc) => {
                const args = tc.argumentsStr ? JSON.parse(tc.argumentsStr) : {};
                return JSON.stringify({ tool: tc.name, ...args });
              })
              .join("\n");
            console.log(
              `[OpenAICompatProvider] Streaming: Native tool_calls converted, count: ${validToolCalls.length}`,
            );
            onChunk("", true);
            const thinkPrefix = thinkingText.trim()
              ? `<think>${thinkingText}</think>\n`
              : "";
            return thinkPrefix + converted;
          }
          onChunk("", true);
          if (thinkingText.trim()) {
            const text = `<think>${thinkingText}</think>\n${fullText}`;
            return maxTokensReached ? text + "\n[MAX_TOKENS_REACHED]" : text;
          }
          return maxTokensReached
            ? fullText + "\n[MAX_TOKENS_REACHED]"
            : fullText;
        }
        try {
          const parsed: any = JSON.parse(data);
          const fr = parsed.choices?.[0]?.finish_reason;
          if (fr) {
            lastFinishReason = fr;
          }
          const delta = parsed.choices?.[0]?.delta;
          // 첫 청크: 어떤 필드가 오는지 확인
          if (
            delta &&
            Object.keys(delta).length > 0 &&
            fullText.length === 0 &&
            thinkingText.length === 0
          ) {
            console.log(
              "[OpenAICompatProvider] first delta keys:",
              JSON.stringify(Object.keys(delta)),
            );
            if (delta.thinking !== undefined)
              console.log("[OpenAICompatProvider] 🧠 thinking field exists");
            if (delta.reasoning_content !== undefined)
              console.log(
                "[OpenAICompatProvider] 🧠 reasoning_content field exists",
              );
          }
          const content = delta?.content;
          if (content) {
            fullText += content;
            onChunk(content, false);
          }
          const reasoningContent = delta?.reasoning_content;
          if (reasoningContent) {
            if (thinkingText.length === 0)
              console.log("[OpenAICompatProvider] 🧠 reasoning_content start");
            thinkingText += reasoningContent;
          }
          // Gemini OpenAI compat은 'thinking' 필드로 올 수도 있음
          const thinkingField = delta?.thinking;
          if (thinkingField) {
            if (thinkingText.length === 0)
              console.log("[OpenAICompatProvider] 🧠 thinking field start");
            thinkingText += thinkingField;
          }
          const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas) {
              const pos =
                (tc.index as number | undefined) ?? streamingToolCalls.length;
              if (streamingToolCalls[pos] == null) {
                // New tool_call starting — fire callback for all previous unfired indices
                for (let i = 0; i < pos; i++) {
                  if (streamingToolCalls[i] && !firedNativeIndices.has(i)) {
                    firedNativeIndices.add(i);
                    try {
                      const args = streamingToolCalls[i].argumentsStr
                        ? JSON.parse(streamingToolCalls[i].argumentsStr)
                        : {};
                      options?.onNativeToolComplete?.(
                        streamingToolCalls[i].name,
                        args,
                      );
                    } catch {
                      /* skip */
                    }
                  }
                }
                streamingToolCalls[pos] = {
                  id: tc.id ?? `tc_${pos}`,
                  name: tc.function?.name ?? "",
                  argumentsStr: tc.function?.arguments ?? "",
                };
              } else {
                if (tc.function?.name) {
                  streamingToolCalls[pos].name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  streamingToolCalls[pos].argumentsStr += tc.function.arguments;
                }
              }
            }
          }
        } catch {
          // JSON parse error - skip
        }
      }
    }

    onChunk("", true);
    return lastFinishReason === "length"
      ? fullText + "\n[MAX_TOKENS_REACHED]"
      : fullText;
  }
}
