/**
 * Tool Status Dots — Extension (no core changes)
 * -----------------------------------------------------------------------------
 * Wraps every built-in tool (bash, read, write, grep, find, ls) with:
 *   • renderShell: "self"   → opts out of the default pending/success/error
 *                             card background (removes it entirely).
 *   • a colored status dot (●) on the left of the first rendered row of the
 *     call:
 *       yellow = running, green = success, red = failed
 *   • a colored connector (└) on the left of the first rendered row of the
 *     result output, using the same yellow/green/red status coloring, with
 *     every following result row indented to line up under (and to the
 *     right of) the └. The result's leading blank spacer row is dropped so
 *     it hugs the call line instead of floating below it.
 *
 * The "edit" tool already renders itself (see chat/inline-diff.ts) and gets
 * the same dot/connector treatment there.
 * =============================================================================
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createBashToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { statusColorFor, unwrapLastComponent, wrapResultWithConnector, wrapWithDot } from "./status-dot";

// biome-ignore lint/suspicious/noExplicitAny: built-in tool definitions are loosely typed upstream
type AnyToolDefinition = any;

function wrapBuiltIn(pi: ExtensionAPI, builtIn: AnyToolDefinition) {
	pi.registerTool({
		name: builtIn.name,
		label: builtIn.label,
		description: builtIn.description,
		promptSnippet: builtIn.promptSnippet,
		promptGuidelines: builtIn.promptGuidelines,
		parameters: builtIn.parameters,
		prepareArguments: builtIn.prepareArguments,
		renderShell: "self",

		async execute(toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
			return builtIn.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args: any, theme: any, context: any) {
			const innerContext = { ...context, lastComponent: unwrapLastComponent(context.lastComponent) };
			const inner = builtIn.renderCall
				? builtIn.renderCall(args, theme, innerContext)
				: { render: () => [theme.fg("toolTitle", theme.bold(builtIn.name))] };
			return wrapWithDot(inner, () => statusColorFor(context));
		},

		renderResult(result: any, options: any, theme: any, context: any) {
			if (!builtIn.renderResult) return undefined;
			const innerContext = { ...context, lastComponent: unwrapLastComponent(context.lastComponent) };
			const inner = builtIn.renderResult(result, options, theme, innerContext);
			if (!inner) return undefined;
			return wrapResultWithConnector(inner, () => statusColorFor(context));
		},
	});
}

export function setupToolStatusDots(pi: ExtensionAPI) {
	const cwd = process.cwd();
	const builtIns: AnyToolDefinition[] = [
		createBashToolDefinition(cwd),
		createReadToolDefinition(cwd),
		createWriteToolDefinition(cwd),
		createGrepToolDefinition(cwd),
		createFindToolDefinition(cwd),
		createLsToolDefinition(cwd),
	];

	for (const builtIn of builtIns) {
		wrapBuiltIn(pi, builtIn);
	}
}
