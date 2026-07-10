/**
 * Status dot / result connector helper — shared by every tool-call renderer.
 *
 * Two wrappers live here:
 *
 *   wrapWithDot(inner, getColor)
 *     Prepends a colored ● to the left of the first rendered row of the tool
 *     *call* (e.g. "$ ls -la"):
 *       • yellow → tool call is pending / still running
 *       • green  → tool call finished successfully
 *       • red    → tool call finished with an error
 *
 *   wrapResultWithConnector(inner, getColor)
 *     Prepends a colored └ to the left of the first rendered row of the tool
 *     *result* (the output printed below the call), using the same
 *     yellow/green/red status coloring. Every following row is left-padded so
 *     the whole result block lines up under - and to the right of - the └.
 *     A single leading blank "spacer" row (which every built-in tool result
 *     inserts before its real content) is stripped first so the result hugs
 *     the call line above it instead of floating a blank row below it.
 *
 * Both wrappers reserve the same two-column prefix width, so call text and
 * result text stay aligned in the same column regardless of which marker
 * (● or └) is shown on the left.
 */

type RGB = [number, number, number];

const YELLOW: RGB = [230, 200, 60];
const GREEN: RGB = [110, 200, 110];
const RED: RGB = [225, 95, 95];

const DOT = "\u25CF"; // ●
const CONNECTOR = "\u2514"; // └
const PREFIX_WIDTH = 2; // "● " / "└ "

interface Component {
	render(width: number): string[];
	invalidate?(): void;
}

// Minimal shape of the ToolRenderContext fields we need to derive a status.
export interface ToolStatusContext {
	executionStarted?: boolean;
	isPartial?: boolean;
	isError?: boolean;
}

export function statusColorFor(context: ToolStatusContext): RGB {
	if (!context.executionStarted) return YELLOW; // waiting to run
	if (context.isPartial) return YELLOW; // running / streaming
	return context.isError ? RED : GREEN; // done
}

function markerAnsi([r, g, b]: RGB, symbol: string): string {
	return `\x1b[38;2;${r};${g};${b}m${symbol}\x1b[39m `;
}

// A wrapper component that owns a reference to the real (inner) component so
// callers can unwrap it again on the next render pass (tools rely on
// `context.lastComponent` pointing at *their own* component, not ours).
export interface DotWrapper extends Component {
	inner: Component;
}

export function wrapWithDot(inner: Component, getColor: () => RGB): DotWrapper {
	return {
		inner,
		invalidate() {
			inner.invalidate?.();
		},
		render(width: number): string[] {
			const lines = inner.render(Math.max(1, width - PREFIX_WIDTH));
			if (lines.length === 0) return [];
			const dot = markerAnsi(getColor(), DOT);
			const pad = " ".repeat(PREFIX_WIDTH);
			return lines.map((line, idx) => (idx === 0 ? dot + line : pad + line));
		},
	};
}

// Same idea as wrapWithDot, but for the tool *result* block rendered under the
// call: uses a └ connector instead of a ●, and tightens the gap between the
// call row and the result by dropping a single leading blank row first.
export function wrapResultWithConnector(inner: Component, getColor: () => RGB): DotWrapper {
	return {
		inner,
		invalidate() {
			inner.invalidate?.();
		},
		render(width: number): string[] {
			let lines = inner.render(Math.max(1, width - PREFIX_WIDTH));
			// Built-in tool results start with a blank "spacer" row before the
			// real content. Drop just that one row so the └ connector sits
			// directly under the call line instead of leaving a floating gap.
			// (Compare with .trim() since the row is usually padded with
			// trailing spaces to full width, not a literal "".)
			if (lines.length > 0 && lines[0].trim() === "") {
				lines = lines.slice(1);
			}
			if (lines.length === 0) return [];
			const connector = markerAnsi(getColor(), CONNECTOR);
			const pad = " ".repeat(PREFIX_WIDTH);
			return lines.map((line, idx) => (idx === 0 ? connector + line : pad + line));
		},
	};
}

// Unwraps the previous render's DotWrapper (if any) so a tool's own
// `context.lastComponent` caching keeps working across re-renders.
export function unwrapLastComponent<T>(lastComponent: unknown): T | undefined {
	const wrapper = lastComponent as DotWrapper | undefined;
	return (wrapper?.inner as T | undefined) ?? undefined;
}
