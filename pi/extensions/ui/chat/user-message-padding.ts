/**
 * User Message Padding — Extension (runtime patch, no core file edits)
 * -----------------------------------------------------------------------------
 * The built-in UserMessageComponent always wraps the message body in a Box
 * with a hardcoded vertical (Y) padding of 1 — one full blank,
 * background-colored row above the text and one below it (see `rebuild()` in
 * pi's `user-message.ts`, which does `new Box(this.outputPad, 1, bgFn)`).
 * There's a public setter for the horizontal padding (`setOutputPad()`), but
 * none for the vertical one.
 *
 * Same trick as chat/assistant-dot.ts: we wrap
 * `UserMessageComponent.prototype.render` at runtime (the class is exported
 * from the public entry and shared with the interactive renderer) to strip
 * those two padding rows after the fact, tightening the card to hug its
 * content — matching the already-tight assistant message style, which drops
 * its own leading spacer row the same way.
 *
 * OSC133 shell-integration markers pi attaches to the first/last rendered row
 * are preserved by carrying them onto the new first/last row instead of being
 * dropped along with the blank padding rows they originally sat on.
 * =============================================================================
 */
import { type ExtensionAPI, UserMessageComponent } from "@earendil-works/pi-coding-agent";

// Split leading zero-width escape prefixes (OSC ... BEL, and SGR \x1b[..m)
// from the rest of a line. Same helper as chat/assistant-dot.ts — kept local
// here since both files patch different (unrelated) built-in components.
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

// True if a rendered row is just background fill with no visible text — i.e.
// one of the Box's paddingY rows, not real message content.
function isBlankRow(line: string): boolean {
	const { rest } = splitLeadingEscapes(line);
	return stripSGR(rest).trim() === "";
}

// Drops a single leading/trailing blank padding row (if present), carrying
// any OSC133/SGR prefix on that row onto the row that becomes the new
// first/last line, so shell-integration markers survive the removal.
function tightenPadding(lines: string[]): string[] {
	if (lines.length === 0) return lines;
	let out = lines;

	if (out.length > 1 && isBlankRow(out[0])) {
		const { prefix } = splitLeadingEscapes(out[0]);
		const rest = out.slice(1);
		const { prefix: nextPrefix, rest: nextRest } = splitLeadingEscapes(rest[0]);
		rest[0] = prefix + nextPrefix + nextRest;
		out = rest;
	}

	if (out.length > 1 && isBlankRow(out[out.length - 1])) {
		const lastIdx = out.length - 1;
		const { prefix } = splitLeadingEscapes(out[lastIdx]);
		const trimmed = out.slice(0, lastIdx);
		const newLastIdx = trimmed.length - 1;
		const { prefix: prevPrefix, rest: prevRest } = splitLeadingEscapes(trimmed[newLastIdx]);
		trimmed[newLastIdx] = prevPrefix + prefix + prevRest;
		out = trimmed;
	}

	return out;
}

// `pi` isn't needed today (the patch applies unconditionally at load time)
// but the parameter is kept so this matches the `setupX(pi)` signature used
// by every other ui/chat/*.ts module, and stays available if this ever grows
// a setting to opt back into the full padding.
export function setupUserMessagePadding(_pi: ExtensionAPI) {
	const proto = UserMessageComponent.prototype as {
		render: (width: number) => string[];
		__userMessagePaddingPatched?: boolean;
	};

	// Guard so a /reload (which re-runs extension factories against the same
	// shared class instance) doesn't double-wrap render().
	if (proto.__userMessagePaddingPatched) return;
	proto.__userMessagePaddingPatched = true;

	const originalRender = proto.render;
	proto.render = function patchedUserMessageRender(width: number): string[] {
		return tightenPadding(originalRender.call(this, width));
	};
}

export default setupUserMessagePadding;
