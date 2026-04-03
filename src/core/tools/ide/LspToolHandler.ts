/**
 * LSP Tool Handler
 * Code intelligence tool via VSCode Language Server Protocol API
 *
 * operations:
 *   goToDefinition       -- Go to symbol definition
 *   findReferences       -- Search all symbol references
 *   hover                -- Symbol type/documentation info
 *   documentSymbol       -- List all symbols in a file
 *   workspaceSymbol      -- Search symbols across workspace
 *   goToImplementation   -- Search interface implementations
 *   prepareCallHierarchy -- Get call hierarchy items at a position
 *   incomingCalls        -- Get incoming calls for a symbol
 *   outgoingCalls        -- Get outgoing calls for a symbol
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';

type LspOperation =
    | 'goToDefinition'
    | 'findReferences'
    | 'hover'
    | 'documentSymbol'
    | 'workspaceSymbol'
    | 'goToImplementation'
    | 'prepareCallHierarchy'
    | 'incomingCalls'
    | 'outgoingCalls';

export class LspToolHandler implements IToolHandler {
    readonly name = Tool.LSP;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const operation = toolUse.params.operation as LspOperation;
        const filePath = toolUse.params.file_path;
        // line is 1-based (user-friendly) -> 0-based (VSCode API)
        const line = toolUse.params.line ? Math.max(0, parseInt(toolUse.params.line, 10) - 1) : 0;
        const character = toolUse.params.character ? parseInt(toolUse.params.character, 10) : 0;
        const query = toolUse.params.query || '';

        if (!operation) {
            return {
                success: false,
                message: 'operation parameter is required. (goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls)',
                error: { code: 'MISSING_PARAM', message: 'operation is required' }
            };
        }

        try {
            switch (operation) {
                case 'goToDefinition':
                case 'findReferences':
                case 'hover':
                case 'documentSymbol':
                case 'goToImplementation':
                case 'prepareCallHierarchy':
                case 'incomingCalls':
                case 'outgoingCalls': {
                    if (!filePath) {
                        return {
                            success: false,
                            message: `${operation} requires file_path parameter.`,
                            error: { code: 'MISSING_PARAM', message: 'file_path is required' }
                        };
                    }

                    const absolutePath = path.isAbsolute(filePath)
                        ? filePath
                        : path.join(context.projectRoot, filePath);
                    const uri = vscode.Uri.file(absolutePath);

                    if (operation === 'documentSymbol') {
                        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                            'vscode.executeDocumentSymbolProvider', uri
                        );
                        return this.formatDocumentSymbols(symbols || [], filePath);
                    }

                    const position = new vscode.Position(line, character);

                    if (operation === 'goToDefinition') {
                        const result = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                            'vscode.executeDefinitionProvider', uri, position
                        );
                        return this.formatLocations(result || [], 'Definition', context.projectRoot);
                    }

                    if (operation === 'findReferences') {
                        const result = await vscode.commands.executeCommand<vscode.Location[]>(
                            'vscode.executeReferenceProvider', uri, position
                        );
                        return this.formatLocations(result || [], 'References', context.projectRoot);
                    }

                    if (operation === 'hover') {
                        const result = await vscode.commands.executeCommand<vscode.Hover[]>(
                            'vscode.executeHoverProvider', uri, position
                        );
                        return this.formatHovers(result || []);
                    }

                    if (operation === 'goToImplementation') {
                        const result = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                            'vscode.executeImplementationProvider', uri, position
                        );
                        return this.formatLocations(result || [], 'Implementations', context.projectRoot);
                    }

                    if (operation === 'prepareCallHierarchy') {
                        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                            'vscode.prepareCallHierarchy', uri, position
                        );
                        return this.formatCallHierarchyItems(items || [], context.projectRoot);
                    }

                    if (operation === 'incomingCalls') {
                        // First prepare the call hierarchy item at the position
                        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                            'vscode.prepareCallHierarchy', uri, position
                        );
                        if (!items || items.length === 0) {
                            return { success: true, message: 'No call hierarchy item found at this position' };
                        }
                        const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                            'vscode.provideIncomingCalls', items[0]
                        );
                        return this.formatIncomingCalls(incoming || [], context.projectRoot);
                    }

                    if (operation === 'outgoingCalls') {
                        // First prepare the call hierarchy item at the position
                        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                            'vscode.prepareCallHierarchy', uri, position
                        );
                        if (!items || items.length === 0) {
                            return { success: true, message: 'No call hierarchy item found at this position' };
                        }
                        const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                            'vscode.provideOutgoingCalls', items[0]
                        );
                        return this.formatOutgoingCalls(outgoing || [], context.projectRoot);
                    }

                    break;
                }

                case 'workspaceSymbol': {
                    if (!query) {
                        return {
                            success: false,
                            message: 'workspaceSymbol requires query parameter.',
                            error: { code: 'MISSING_PARAM', message: 'query is required for workspaceSymbol' }
                        };
                    }
                    const result = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        'vscode.executeWorkspaceSymbolProvider', query
                    );
                    return this.formatWorkspaceSymbols(result || [], context.projectRoot);
                }

                default:
                    return {
                        success: false,
                        message: `Unknown operation: ${operation}`,
                        error: { code: 'UNKNOWN_OPERATION', message: `Unknown operation: ${operation}` }
                    };
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `LSP error: ${msg}`,
                error: { code: 'LSP_ERROR', message: msg }
            };
        }

        return { success: false, message: 'Unreachable', error: { code: 'INTERNAL', message: 'Unreachable' } };
    }

    private formatLocations(
        locations: (vscode.Location | vscode.LocationLink)[],
        label: string,
        projectRoot: string
    ): ToolResponse {
        if (locations.length === 0) {
            return { success: true, message: `No ${label} found` };
        }

        const lines = locations.map(loc => {
            if ('targetUri' in loc) {
                // LocationLink
                const rel = path.relative(projectRoot, loc.targetUri.fsPath);
                const r = loc.targetRange;
                return `${rel}:${r.start.line + 1}:${r.start.character}`;
            } else {
                // Location
                const rel = path.relative(projectRoot, loc.uri.fsPath);
                return `${rel}:${loc.range.start.line + 1}:${loc.range.start.character}`;
            }
        });

        return {
            success: true,
            message: `${label} (${locations.length}):\n${lines.join('\n')}`
        };
    }

    private formatHovers(hovers: vscode.Hover[]): ToolResponse {
        if (hovers.length === 0) {
            return { success: true, message: 'No hover information' };
        }

        const texts = hovers.flatMap(h =>
            h.contents.map(c => {
                if (typeof c === 'string') { return c; }
                return c.value;
            })
        ).filter(t => t.trim());

        return { success: true, message: texts.join('\n\n') };
    }

    private formatDocumentSymbols(
        symbols: vscode.DocumentSymbol[],
        filePath: string,
        indent = ''
    ): ToolResponse {
        const lines: string[] = [];

        const flatten = (syms: vscode.DocumentSymbol[], depth: string) => {
            for (const sym of syms) {
                const kind = vscode.SymbolKind[sym.kind]?.toLowerCase() || 'symbol';
                lines.push(`${depth}${kind} ${sym.name} (line ${sym.range.start.line + 1})`);
                if (sym.children?.length) {
                    flatten(sym.children, depth + '  ');
                }
            }
        };

        flatten(symbols, indent);

        if (lines.length === 0) {
            return { success: true, message: `${filePath}: no symbols found` };
        }

        return {
            success: true,
            message: `Symbols in ${filePath} (${lines.length}):\n${lines.join('\n')}`
        };
    }

    private formatWorkspaceSymbols(
        symbols: vscode.SymbolInformation[],
        projectRoot: string
    ): ToolResponse {
        if (symbols.length === 0) {
            return { success: true, message: 'No symbols found' };
        }

        const MAX = 50;
        const shown = symbols.slice(0, MAX);
        const lines = shown.map(sym => {
            const kind = vscode.SymbolKind[sym.kind]?.toLowerCase() || 'symbol';
            const rel = path.relative(projectRoot, sym.location.uri.fsPath);
            const line = sym.location.range.start.line + 1;
            return `${kind} ${sym.name} — ${rel}:${line}`;
        });

        const truncated = symbols.length > MAX ? `\n... (${symbols.length - MAX} more)` : '';
        return {
            success: true,
            message: `Workspace symbols (${Math.min(symbols.length, MAX)}):\n${lines.join('\n')}${truncated}`
        };
    }

    private formatCallHierarchyItems(
        items: vscode.CallHierarchyItem[],
        projectRoot: string
    ): ToolResponse {
        if (items.length === 0) {
            return { success: true, message: 'No call hierarchy items found' };
        }

        const lines = items.map(item => {
            const kind = vscode.SymbolKind[item.kind]?.toLowerCase() || 'symbol';
            const rel = path.relative(projectRoot, item.uri.fsPath);
            return `${kind} ${item.name} — ${rel}:${item.range.start.line + 1}`;
        });

        return {
            success: true,
            message: `Call hierarchy items (${items.length}):\n${lines.join('\n')}`
        };
    }

    private formatIncomingCalls(
        calls: vscode.CallHierarchyIncomingCall[],
        projectRoot: string
    ): ToolResponse {
        if (calls.length === 0) {
            return { success: true, message: 'No incoming calls found' };
        }

        const lines = calls.map(call => {
            const from = call.from;
            const kind = vscode.SymbolKind[from.kind]?.toLowerCase() || 'symbol';
            const rel = path.relative(projectRoot, from.uri.fsPath);
            const ranges = call.fromRanges.map(r => `line ${r.start.line + 1}`).join(', ');
            return `${kind} ${from.name} — ${rel}:${from.range.start.line + 1} (calls at ${ranges})`;
        });

        return {
            success: true,
            message: `Incoming calls (${calls.length}):\n${lines.join('\n')}`
        };
    }

    private formatOutgoingCalls(
        calls: vscode.CallHierarchyOutgoingCall[],
        projectRoot: string
    ): ToolResponse {
        if (calls.length === 0) {
            return { success: true, message: 'No outgoing calls found' };
        }

        const lines = calls.map(call => {
            const to = call.to;
            const kind = vscode.SymbolKind[to.kind]?.toLowerCase() || 'symbol';
            const rel = path.relative(projectRoot, to.uri.fsPath);
            const ranges = call.fromRanges.map(r => `line ${r.start.line + 1}`).join(', ');
            return `${kind} ${to.name} — ${rel}:${to.range.start.line + 1} (called at ${ranges})`;
        });

        return {
            success: true,
            message: `Outgoing calls (${calls.length}):\n${lines.join('\n')}`
        };
    }

    getDescription(toolUse: ToolUse): string {
        const op = toolUse.params.operation || '';
        const target = toolUse.params.file_path || toolUse.params.query || '';
        const loc = (toolUse.params.line && toolUse.params.character)
            ? `:${toolUse.params.line}:${toolUse.params.character}`
            : '';
        return `[lsp: ${op} ${target}${loc}]`;
    }
}
