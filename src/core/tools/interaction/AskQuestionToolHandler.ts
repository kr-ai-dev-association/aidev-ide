/**
 * AskQuestion Tool Handler
 * Presents structured multiple-choice questions to the user via the chat panel.
 * Waits for user selection and returns the answers as tool result.
 * Supports concurrent calls via requestId-based resolution (no singleton).
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';

interface QuestionOption {
    id: string;
    label: string;
    description?: string;
}

interface Question {
    id: string;
    prompt: string;
    options: QuestionOption[];
    allow_multiple?: boolean;
}

// Pending question resolutions — keyed by requestId for concurrent support
const pendingResolves = new Map<string, (answers: Record<string, string[]>) => void>();
let requestCounter = 0;

export class AskQuestionToolHandler implements IToolHandler {
    readonly name = Tool.ASK_QUESTION;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const title = toolUse.params.title || '';
        const questionsRaw = toolUse.params.questions || '[]';

        let questions: Question[];
        try {
            questions = typeof questionsRaw === 'string' ? JSON.parse(questionsRaw) : questionsRaw;
            if (!Array.isArray(questions) || questions.length === 0) {
                return { success: false, message: 'No questions provided', error: { code: 'INVALID_PARAMS', message: 'questions must be a non-empty JSON array' } };
            }
        } catch (e) {
            return { success: false, message: 'Failed to parse questions JSON', error: { code: 'PARSE_ERROR', message: String(e) } };
        }

        // Validate questions
        for (const q of questions) {
            if (!q.id || !q.prompt || !Array.isArray(q.options) || q.options.length === 0) {
                return { success: false, message: `Invalid question: ${q.id || '(no id)'}`, error: { code: 'INVALID_QUESTION', message: 'Each question must have id, prompt, and non-empty options array' } };
            }
        }

        const webview = context.webview;
        if (!webview) {
            return { success: false, message: 'No webview available', error: { code: 'NO_WEBVIEW', message: 'Cannot display questions without webview' } };
        }

        // Generate unique requestId for this call
        const requestId = `ask_${Date.now()}_${++requestCounter}`;

        // Post message to chat panel to show question UI
        webview.postMessage({
            command: 'askQuestion',
            requestId,
            title,
            questions: questions.map(q => ({
                id: q.id,
                prompt: q.prompt,
                options: q.options.map(o => ({ id: o.id, label: o.label, description: o.description })),
                allowMultiple: q.allow_multiple || false,
            })),
        });

        console.log(`[AskQuestionToolHandler] Sent ${questions.length} questions (${requestId}), waiting for user response...`);

        // Wait for user response (with timeout)
        const TIMEOUT_MS = 300000; // 5 minutes
        const answers = await new Promise<Record<string, string[]>>((resolve, reject) => {
            pendingResolves.set(requestId, resolve);
            setTimeout(() => {
                if (pendingResolves.has(requestId)) {
                    pendingResolves.delete(requestId);
                    reject(new Error('응답 대기 시간 초과 — 5분 내에 선택하지 않았습니다.'));
                }
            }, TIMEOUT_MS);
        });

        // Format answers as text for LLM
        const answerLines = Object.entries(answers).map(([qId, selectedIds]) => {
            return `Question ${qId}: Selected option(s) ${selectedIds.join(', ')}`;
        });
        const answerText = `User question responses:\n${answerLines.join('\n')}`;

        console.log(`[AskQuestionToolHandler] User responded (${requestId}): ${answerText}`);

        return {
            success: true,
            message: answerText,
            data: { answers },
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[ask_question: ${toolUse.params.title || ''}]`;
    }

    /**
     * Called by ChatViewProvider when user submits answers from the webview
     */
    static resolveUserAnswer(requestId: string, answers: Record<string, string[]>): void {
        const resolve = pendingResolves.get(requestId);
        if (resolve) {
            pendingResolves.delete(requestId);
            resolve(answers);
        } else {
            console.warn(`[AskQuestionToolHandler] No pending question for requestId: ${requestId}`);
        }
    }
}
