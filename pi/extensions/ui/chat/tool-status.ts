/**
 * Tool Status Dots — Extension (no core changes)
 * -----------------------------------------------------------------------------
 * Wraps every built-in tool (bash, read, write, grep, find, ls) with:
 *   • renderShell: "self"   → opts out of the default pending/success/error
 *                             card background (removes it entirely).
 *   • a colored status dot (●) on the left of the first rendered row of the
 *     call:
 *       yellow = running, green = success, red = failed
 *   • a colored connector (⎿) on the left of the first rendered row of the
 *     result output, using the same yellow/green/red status coloring, with
 *     every following result row indented to line up under (and to the
 *     right of) the ⎿. The result's leading blank spacer row is dropped so
 *     it hugs the call line instead of floating below it.
 *   • collapsed-by-default output: once a call settles successfully, its raw
 *     output (which built-in tools still preview up to 5-20 lines of even
 *     when "collapsed") is replaced with a single-line summary —
 *     "<n> lines, ctrl+o to expand" — so the transcript stays readable (e.g.
 *     `ls -la` no longer dumps a full directory listing into the chat by
 *     default). Errors and in-flight/streaming output are always shown in
 *     full since those are exactly the cases users need to see without an
 *     extra keypress. Pressing ctrl+o (`app.tools.expand`) reveals the real
 *     output, rendered as a tight muted-grey detail card (see status-dot.ts
 *     `withDetailCard` — horizontal padding + trimmed vertical padding) so the
 *     opened panel reads as a distinct block instead of blending into the
 *     rest of the chat.
 *
 * The "edit" tool already renders itself (see chat/inline-diff.ts) and gets
 * the same dot/connector treatment there. Its diff preview is left always-on
 * (not collapsed) since seeing what changed is the whole point of that card.
 * =============================================================================
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import {
	createBashToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	buildCollapsedSummary,
	statusColorFor,
	unwrapLastComponent,
	withDetailCard,
	wrapResultWithConnector,
	wrapWithDot,
} from "./status-dot";

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
			if (!builtIn.renderResult) return new Container();
			// The built-in renderers cache their own component on
			// context.lastComponent and reuse it every pass (bash does
			// component.clear() + rebuild, read does text.setText(...); some
			// also lean on it for side effects like bash's elapsed-time timer).
			// Our own wrappers are NOT that component: after an expand
			// this.resultRendererComponent holds the DotWrapper around the
			// detail card, and after a collapse it holds the DotWrapper around
			// the one-line summary — neither of which the built-in can
			// .clear() / .setText() on. Handing either back throws, which
			// ToolExecutionComponent catches by falling back to dumping the
			// full raw output — that's why the "detail" stayed on screen after
			// toggling ctrl+o back off. So instead, remember the real built-in
			// component on the shared renderer state and hand THAT back every
			// pass (undefined on the first render, so the built-in makes a
			// fresh one).
			const realLast = context.state?.__toolStatusInner;
			const innerContext = { ...context, lastComponent: realLast };
			// Always delegate to the built-in renderer first: besides building the
			// real detail component, this also drives side effects some tools rely
			// on (bash's elapsed-time timer + endedAt stamp, write's highlight
			// cache, etc.) that must keep running even while we end up showing a
			// collapsed summary instead of this output below.
			const inner = builtIn.renderResult(result, options, theme, innerContext);
			if (!inner) return new Container();
			if (context.state) context.state.__toolStatusInner = inner;

			// Once a call has settled successfully, hide its (potentially long) raw
			// output behind a one-line summary instead of the built-in's own
			// preview. Errors and in-flight (partial/streaming) output are always
			// shown in full.
			const collapse = !options.expanded && !context.isError && !options.isPartial;
			if (collapse) {
				// Nothing to show at all (e.g. a successful `write` has no detail
				// body beyond the call line) — skip the summary/hint too, there's
				// nothing worth expanding into.
				if (inner.render(80).length === 0) return new Container();
				return wrapResultWithConnector(buildCollapsedSummary(result, theme, context), () => statusColorFor(context));
			}

			// Expanded + successful: render the full detail as a tight muted-grey
			// card (horizontal padding + trimmed vertical padding — see
			// status-dot.ts `withDetailCard`) so it reads as an opened panel.
			// Errors keep their normal (unshaded) styling so they stay maximally
			// visible.
			const shaded = options.expanded && !context.isError ? withDetailCard(inner) : inner;
			return wrapResultWithConnector(shaded, () => statusColorFor(context));
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
