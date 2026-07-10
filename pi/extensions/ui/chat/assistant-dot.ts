/**
 * Assistant Dot — Extension (runtime patch, no core file edits)
 * -----------------------------------------------------------------------------
 * pi renders standard assistant *text* messages with its built-in
 * AssistantMessageComponent, which has no extension hook to customise. But the
 * component class is exported from the public entry, and (verified) the jiti
 * loader shares the *same* class instance the interactive renderer uses — so we
 * can wrap `AssistantMessageComponent.prototype.render` at runtime from an
 * extension and it takes effect for every assistant message, with no edit to
 * pi's (here read-only) core files and surviving `pi update`.
 *
 * Effect: every assistant text response is prefixed with a coloured ● marker
 * on its first line — matching the ● used on tool calls — and the rest of the
 * message is indented to sit under it. The leading blank spacer row pi inserts
 * before the body is dropped so the dot lands on the first real line, and the
 * OSC133 shell-integration markers pi wraps around the message are preserved
 * (carried from the dropped spacer line onto the dot line).
 * =============================================================================
 */
import { AssistantMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DOT = "\u25cf"; // ●
const DOT_WIDTH = 2; // "● " — dot + one space

// Fallback colour used until the live theme has been captured (matches pi's
// dark "accent" #8abeb7). Replaced by theme.fg("accent", ...) once rendering
// starts, so it tracks light/dark/custom themes.
const FALLBACK_RGB = [138, 190, 183] as const;

// Minimal structural type for the theme object — avoids importing the Theme
// type (not all builds re-export it from the public entry).
interface AccentTheme {
	fg(color: "accent", text: string): string;
}

let accentFn: ((text: string) => string) | undefined;

function dot(): string {
	if (accentFn) return accentFn(`${DOT} `);
	const [r, g, b] = FALLBACK_RGB;
	return `\x1b[38;2;${r};${g};${b}m${DOT}\x1b[39m `;
}

// Split the leading zero-width escape prefixes (OSC ... BEL, and SGR
// \x1b[..m) from the visible remainder of a rendered line. We must keep these
// prefixes (OSC133 shell-integration, per-line colour resets) intact while
// deciding where to insert the dot / indentation.
function splitLeadingEscapes(line: string): { prefix: string; rest: string } {
	let prefix = "";
	let rest = line;
	for (;;) {
		if (rest.startsWith("\x1b]")) {
			const bel = rest.indexOf("\x07");
			if (bel !== -1) {
				prefix += rest.slice(0, bel + 1);
				rest = rest.slice(bel + 1);
				continue;
			}
		}
		const m = /^\x1b\[[0-9;]*m/.exec(rest);
		if (m) {
			prefix += m[0];
			rest = rest.slice(m[0].length);
			continue;
		}
		break;
	}
	return { prefix, rest };
}

function stripSGR(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// Adds the ● marker to the first visible text line of an assistant message and
// indents every following line to sit under it. OSC133 prefixes are preserved
// (carried from skipped blank/spacer lines onto the dot line). Returns the
// original lines untouched when there is no visible text to mark.
function applyAssistantDot(lines: string[]): string[] {
	if (lines.length === 0) return lines;

	const out: string[] = [];
	let dotPlaced = false;
	let carriedPrefix = ""; // OSC133 etc. carried off dropped blank rows

	for (const line of lines) {
		const { prefix, rest } = splitLeadingEscapes(line);
		if (!dotPlaced && stripSGR(rest).trim() === "") {
			// Leading blank / spacer row — drop it but keep its OSC133 prefix
			// so shell integration survives onto the real first line.
			carriedPrefix += prefix;
			continue;
		}
		if (!dotPlaced) {
			out.push(carriedPrefix + prefix + dot() + rest);
			dotPlaced = true;
		} else {
			out.push(prefix + " ".repeat(DOT_WIDTH) + rest);
		}
	}

	// No visible body (e.g. empty message) — leave the block untouched.
	return dotPlaced ? out : lines;
}

export function setupAssistantDot(pi: ExtensionAPI) {
	const proto = AssistantMessageComponent.prototype as {
		render: (width: number) => string[];
		__assistantDotPatched?: boolean;
	};

	// Guard so a /reload (which re-runs extension factories against the same
	// shared class instance) doesn't double-wrap render().
	if (proto.__assistantDotPatched) return;
	proto.__assistantDotPatched = true;

	const originalRender = proto.render;
	proto.render = function patchedAssistantRender(width: number): string[] {
		// Render the body DOT_WIDTH columns narrower so we have room to prepend
		// the "● " (first line) / "  " (rest) without overflowing the width.
		const innerWidth = Math.max(1, width - DOT_WIDTH);
		const lines = originalRender.call(this, innerWidth);
		if (lines.length === 0) return lines;
		return applyAssistantDot(lines);
	};

	pi.on("session_start", (_event, ctx) => {
		// Capture the live theme via an invisible widget (renders nothing) so
		// the dot colour follows theme changes. Same capture trick used by
		// layout/sticky-bottom.ts to grab the tui reference.
		ctx.ui.setWidget("assistant-dot:theme", (_tui, theme: AccentTheme) => {
			accentFn = (text: string) => theme.fg("accent", text);
			return {
				render: () => [],
				invalidate() {},
			};
		});
	});
}

export default setupAssistantDot;
