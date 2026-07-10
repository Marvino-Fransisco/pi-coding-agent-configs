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
 *     Prepends a colored ⎿ to the left of the first rendered row of the tool
 *     *result* (the output printed below the call), using the same
 *     yellow/green/red status coloring. The ⎿ (and the whole result block)
 *     is indented one level in from the ● call dot so it lines up under the
 *     call's text; every following row is then padded one more level in, to
 *     the right of the ⎿. A single leading blank "spacer" row (which every
 *     built-in tool result inserts before its real content) is stripped first
 *     so the result hugs the call line above it instead of floating a blank
 *     row below it.
 *
 * Both wrappers reserve the same two-column prefix width, so call text and
 * result text stay aligned in the same column regardless of which marker
 * (● or ⎿) is shown on the left.
 *
 * Two more helpers live here for the collapsed-by-default tool results used
 * by chat/tool-status.ts:
 *
 *   buildCollapsedSummary(result, theme, context)
 *     Builds the single-line "<n> lines · 1.2s, ctrl+o to expand" summary
 *     shown instead of a settled, successful tool result's real output.
 *
 *   withDetailCard(inner)
 *     Renders the expanded tool-output detail as a tight muted-grey "card":
 *     every row gets `DETAIL_PAD_X` columns of horizontal padding on each
 *     side and a full-width grey background, and the leading/trailing blank
 *     rows the built-in renderers emit are stripped first so the card hugs
 *     its content vertically (same tightening chat/user-message-padding.ts
 *     applies). Used to set the *expanded* detail block apart from the rest
 *     of the transcript once the user opens it back up.
 */
import { keyHint } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "../utils";

type RGB = [number, number, number];

const YELLOW: RGB = [230, 200, 60];
const GREEN: RGB = [110, 200, 110];
const RED: RGB = [225, 95, 95];

const DOT = "\u25CF"; // ●
const CONNECTOR = "\u23BF"; // ⎿
const PREFIX_WIDTH = 2; // "● " / "⎿ "

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

// Extra indent applied to the *result* block so its ⎿ connector lines up
// under the call's text (one level in from the ● call dot) and the output
// then sits one more level in, directly under the ⎿.
const RESULT_INDENT = PREFIX_WIDTH;

// Same idea as wrapWithDot, but for the tool *result* block rendered under the
// call: uses a ⎿ connector instead of a ●, and tightens the gap between the
// call row and the result by dropping a single leading blank row first.
export function wrapResultWithConnector(inner: Component, getColor: () => RGB): DotWrapper {
	return {
		inner,
		invalidate() {
			inner.invalidate?.();
		},
		render(width: number): string[] {
			const innerWidth = Math.max(1, width - PREFIX_WIDTH - RESULT_INDENT);
			let lines = inner.render(innerWidth);
			// Built-in tool results start with a blank "spacer" row before the
			// real content. Drop just that one row so the ⎿ connector sits
			// directly under the call line instead of leaving a floating gap.
			// (Compare with .trim() since the row is usually padded with
			// trailing spaces to full width, not a literal "".)
			if (lines.length > 0 && lines[0].trim() === "") {
				lines = lines.slice(1);
			}
			if (lines.length === 0) return [];
			// Indent the whole result by RESULT_INDENT, then put the ⎿ connector
			// (PREFIX_WIDTH wide) at the front of the first row so its text lines
			// up under the call's text; every later row is padded to match.
			const connector = " ".repeat(RESULT_INDENT) + markerAnsi(getColor(), CONNECTOR);
			const pad = " ".repeat(RESULT_INDENT + PREFIX_WIDTH);
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

// =============================================================================
// Collapsed-by-default tool results
// =============================================================================

const MUTED_GREY_BG: RGB = [52, 52, 58];

// Horizontal padding (columns) inside the expanded detail card, applied on
// both sides of every content row so the text doesn't sit flush against the
// grey edges.
const DETAIL_PAD_X = 1;

function greyBgLine(line: string, width: number): string {
	const padNeeded = Math.max(0, width - visibleWidth(line));
	return `\x1b[48;2;${MUTED_GREY_BG[0]};${MUTED_GREY_BG[1]};${MUTED_GREY_BG[2]}m${line}${" ".repeat(padNeeded)}\x1b[49m`;
}

function stripSGR(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// True for a rendered row that carries no visible text once color codes are
// removed — i.e. one of the blank spacer/padding rows built-in tool
// renderers emit around their real content.
function isBlankLine(line: string): boolean {
	return stripSGR(line).trim() === "";
}

// Renders the expanded tool-output detail as a tight "card": every row is
// washed in a muted grey background with `DETAIL_PAD_X` columns of padding
// on each side, and the leading/trailing blank rows the built-in renderers
// emit are stripped first so the card hugs its content vertically — the same
// tightening chat/user-message-padding.ts applies to the user message card.
// Rows are padded to the full width so the background covers the whole line,
// then closed with `\x1b[49m` (background-only reset, not a full SGR reset)
// so foreground colors already baked into `inner`'s own output (warnings,
// syntax highlighting, etc.) survive intact.
export function withDetailCard(inner: Component): Component {
	return {
		invalidate() {
			inner.invalidate?.();
		},
		render(width: number): string[] {
			const innerWidth = Math.max(1, width - 2 * DETAIL_PAD_X);
			let lines = inner.render(innerWidth);
			// Trim vertical padding: drop leading/trailing blank rows so the grey
			// block starts and ends on real content, not on the built-in
			// renderers' spacer rows.
			let start = 0;
			let end = lines.length;
			while (start < end && isBlankLine(lines[start])) start++;
			while (end > start && isBlankLine(lines[end - 1])) end--;
			lines = lines.slice(start, end);
			if (lines.length === 0) return [];
			const pad = " ".repeat(DETAIL_PAD_X);
			return lines.map((line) => {
				const rightPad = " ".repeat(Math.max(0, innerWidth - visibleWidth(line)));
				return greyBgLine(pad + line + rightPad + pad, width);
			});
		},
	};
}

// biome-ignore lint/suspicious/noExplicitAny: tool result content is loosely typed upstream
function extractText(result: any): string {
	return (result?.content ?? [])
		.filter((c: any) => c?.type === "text")
		.map((c: any) => c.text || "")
		.join("\n");
}

function countLines(text: string): number {
	const trimmed = text.trim();
	return trimmed ? trimmed.split("\n").length : 0;
}

// One-line "<n> lines · 1.2s, ctrl+o to expand" summary shown in place of a
// settled, successful tool result's real output. Also surfaces "took Xs" for
// bash calls by reading the same `context.state.startedAt` / `endedAt`
// timing the built-in bash renderer stamps onto the shared row state — this
// only works because chat/tool-status.ts always calls the built-in
// `renderResult` first (for its side effects) before deciding whether to
// show this summary instead of its output.
export function buildCollapsedSummary(
	// biome-ignore lint/suspicious/noExplicitAny: tool result content is loosely typed upstream
	result: any,
	// biome-ignore lint/suspicious/noExplicitAny: theme is loosely typed upstream
	theme: any,
	context: ToolStatusContext & { state?: { startedAt?: number; endedAt?: number } },
): Component {
	const bits: string[] = [];

	const lines = countLines(extractText(result));
	if (lines > 0) bits.push(lines === 1 ? "1 line" : `${lines} lines`);

	const { startedAt, endedAt } = context.state ?? {};
	if (startedAt !== undefined && endedAt !== undefined) {
		bits.push(`${((endedAt - startedAt) / 1000).toFixed(1)}s`);
	}

	const summary = bits.length > 0 ? bits.join(theme.fg("dim", " · ")) : theme.fg("dim", "done");
	const line = `${theme.fg("dim", `${summary} `)}${keyHint("app.tools.expand", "to expand")}`;

	return {
		invalidate() {},
		render(_width: number): string[] {
			return [line];
		},
	};
}
