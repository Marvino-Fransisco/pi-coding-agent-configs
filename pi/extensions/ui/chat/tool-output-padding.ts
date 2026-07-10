/**
 * Tool Output Padding — Extension (runtime patch, no core file edits)
 * -----------------------------------------------------------------------------
 * Companion to chat/user-message-padding.ts, applied to the *tool call output*
 * card instead of the user message card.
 *
 * When a tool call renders through pi's default card shell (i.e. it does NOT
 * opt into `renderShell: "self"` the way chat/tool-status.ts does for the
 * built-in tools), ToolExecutionComponent wraps its call + result in a
 * `Box(1, 1, bgFn)` — one space of horizontal (X) padding on every content
 * row, plus one full blank, background-colored row above and below the
 * content (the vertical / Y padding). That Y padding is what makes the card
 * look loose; the X padding is what we want to keep.
 *
 * This does the same thing user-message-padding.ts does for the user message
 * card: wrap `ToolExecutionComponent.prototype.render` (the class is exported
 * from the public entry) and strip those two background-only padding rows so
 * the card hugs its content vertically — matching the already-tight user /
 * assistant message style — while leaving the X padding (and the leading
 * Spacer that separates this tool call from the message above it) untouched.
 *
 * Self-rendering tools (bash, read, edit, … via tool-status.ts /
 * inline-diff.ts) carry no background card of their own, so their output has
 * no background-only rows to strip and is passed through unchanged.
 * =============================================================================
 */
import { type ExtensionAPI, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";

// Strip every SGR escape (\x1b[..m) so we can test the *visible* content of a
// rendered row independently of any color / background codes baked into it.
function stripSGR(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// True if a row carries a background *set* code (truecolor `\x1b[48;2;r;g;bm`
// or 256-color `\x1b[48;5;nm`, or a basic `\x1b[4[0-7]m`) — i.e. the row is
// painted with a background. We deliberately match the set code, not the
// `\x1b[49m` reset (which every backgrounded row also ends with), so a plain
// Spacer row ("", no background at all) is not mistaken for card padding.
function hasBackground(line: string): boolean {
	return /\x1b\[(?:48;[0-9;]*|4[0-7])m/.test(line);
}

// True if a rendered row is a card padding row: background-filled but with no
// visible text after stripping color codes — i.e. one of the Box's paddingY
// rows, not real content and not a background-less Spacer.
function isBackgroundPaddingRow(line: string): boolean {
	return hasBackground(line) && stripSGR(line).trim() === "";
}

function isBlank(line: string): boolean {
	return stripSGR(line).trim() === "";
}

// Drops the card's top/bottom background padding rows. The leading Spacer("")
// ToolExecutionComponent puts before its card is background-less, so it is
// kept; only background-only rows sitting in the frame around the real
// content are removed. Anything between the first and last content row
// (which may legitimately be backgrounded) is left intact.
function tightenToolPadding(lines: string[]): string[] {
	if (lines.length <= 1) return lines;

	const firstContent = lines.findIndex((l) => !isBlank(l));
	if (firstContent === -1) return lines; // entirely blank — nothing to tighten
	let lastContent = lines.length - 1;
	while (lastContent > firstContent && isBlank(lines[lastContent])) lastContent--;

	// Leading frame (before first content): keep background-less spacers,
	// drop background-only padding rows.
	const leading = lines.slice(0, firstContent).filter((l) => !isBackgroundPaddingRow(l));
	// Trailing frame (after last content): same treatment.
	const trailing = lines.slice(lastContent + 1).filter((l) => !isBackgroundPaddingRow(l));
	// Middle (the actual content): untouched, X padding and all.
	const middle = lines.slice(firstContent, lastContent + 1);

	return [...leading, ...middle, ...trailing];
}

export function setupToolOutputPadding(_pi: ExtensionAPI) {
	const proto = ToolExecutionComponent.prototype as {
		render: (width: number) => string[];
		__toolOutputPaddingPatched?: boolean;
	};

	// Guard so a /reload (which re-runs extension factories against the same
	// shared class instance) doesn't double-wrap render().
	if (proto.__toolOutputPaddingPatched) return;
	proto.__toolOutputPaddingPatched = true;

	const originalRender = proto.render;
	proto.render = function patchedToolExecutionRender(width: number): string[] {
		return tightenToolPadding(originalRender.call(this, width));
	};
}

export default setupToolOutputPadding;
