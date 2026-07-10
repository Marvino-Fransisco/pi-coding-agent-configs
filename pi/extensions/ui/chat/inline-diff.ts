import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { visibleWidth } from "../utils";
import { statusColorFor, wrapResultWithConnector, wrapWithDot } from "./status-dot";

// =============================================================================
// Inline (unified) diff component
// -----------------------------------------------------------------------------
// Renders the edit preview as a single-column, per-file diff:
//   • removed / old lines           → red row background
//   • added / new lines             → green row background
//   • words changed inside a new line → brighter (highlighted) green background
//   • context lines                 → no background at all
// The background only ever covers the rows that actually changed — there is no
// full-card background behind the whole block.
// =============================================================================

type RGB = [number, number, number];

// ── Row / highlight colors ──
const RED_BG: RGB = [110, 28, 28]; // removed line row (vibrant)
const RED_FG: RGB = [235, 150, 150];
const GREEN_BG: RGB = [24, 110, 40]; // added line row (vibrant)
const GREEN_FG: RGB = [150, 225, 150];
const HIGHLIGHT_BG: RGB = [46, 150, 60]; // edited words inside a new line
const HIGHLIGHT_FG: RGB = [220, 255, 220];
const CONTEXT_FG: RGB = [150, 150, 160];
const GUTTER_FG: RGB = [110, 110, 122];

interface DiffLine {
	type: "removed" | "added" | "context" | "ellipsis";
	lineNum: string;
	content: string;
}

// A styled run of plain text with an optional bg / fg color.
interface Seg {
	text: string;
	bg: RGB | null;
	fg: RGB | null;
}

function ansi(text: string, bg: RGB | null, fg: RGB | null): string {
	let open = "";
	if (bg) open += `\x1b[48;2;${bg[0]};${bg[1]};${bg[2]}m`;
	if (fg) open += `\x1b[38;2;${fg[0]};${fg[1]};${fg[2]}m`;
	if (!open) return text;
	return open + text + "\x1b[0m";
}

function charWidth(ch: string): number {
	return Math.max(1, visibleWidth(ch));
}

// Lay styled segments out into wrapped rows of exactly `width`, padding the
// remainder of each row with `baseBg` (or nothing when baseBg is null).
function layoutRow(segments: Seg[], width: number, baseBg: RGB | null): string[] {
	const rows: string[] = [];
	let cur = "";
	let curW = 0;

	const flush = () => {
		const remaining = width - curW;
		if (remaining > 0) {
			cur += baseBg ? ansi(" ".repeat(remaining), baseBg, null) : " ".repeat(remaining);
		}
		rows.push(cur);
		cur = "";
		curW = 0;
	};

	for (const seg of segments) {
		let buf = "";
		for (const ch of seg.text) {
			const w = charWidth(ch);
			if (curW + w > width) {
				if (buf) {
					cur += ansi(buf, seg.bg, seg.fg);
					buf = "";
				}
				flush();
			}
			buf += ch;
			curW += w;
		}
		if (buf) cur += ansi(buf, seg.bg, seg.fg);
	}
	flush();
	return rows;
}

// ── Word-level diff ──
// Tokenize keeping whitespace so we can rebuild the line exactly, then use an
// LCS to mark which tokens in the *new* line were actually edited/added.
function tokenize(s: string): string[] {
	return s.match(/\s+|\S+/g) ?? [];
}

function wordDiff(oldStr: string, newStr: string): { text: string; changed: boolean }[] {
	const a = tokenize(oldStr);
	const b = tokenize(newStr);
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const out: { text: string; changed: boolean }[] = [];
	let i = 0;
	let j = 0;
	while (j < n) {
		if (i < m && a[i] === b[j]) {
			out.push({ text: b[j], changed: false });
			i++;
			j++;
		} else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
			i++; // token only in old line → skip (it's a removal)
		} else {
			out.push({ text: b[j], changed: true });
			j++;
		}
	}
	return bridgeWhitespaceGaps(out);
}

// If a whitespace-only token sits directly between two edited tokens, mark it
// changed too so the highlight reads as one continuous run instead of having
// an unhighlighted gap between the previous edit and the next one.
function bridgeWhitespaceGaps(parts: { text: string; changed: boolean }[]): { text: string; changed: boolean }[] {
	for (let k = 1; k < parts.length - 1; k++) {
		const part = parts[k];
		if (!part.changed && /^\s+$/.test(part.text) && parts[k - 1].changed && parts[k + 1].changed) {
			part.changed = true;
		}
	}
	return parts;
}

class InlineDiff extends Container {
	private parsedLines: DiffLine[];
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private diffText: string,
		private theme: any,
		private filePath?: string,
	) {
		super();
		this.parsedLines = this.parseDiff(diffText);
	}

	private parseDiff(diffText: string): DiffLine[] {
		const lines: DiffLine[] = [];
		for (const raw of diffText.split("\n")) {
			const match = raw.match(/^([+\-\s])\s*(\d*)\s(.*)$/);
			if (!match) {
				if (/^\s+\.\.\./.test(raw)) {
					lines.push({ type: "ellipsis", lineNum: "", content: "..." });
				}
				continue;
			}
			const [, prefix, lineNum, content] = match;
			if (prefix === "-") {
				lines.push({ type: "removed", lineNum, content });
			} else if (prefix === "+") {
				lines.push({ type: "added", lineNum, content });
			} else {
				lines.push({ type: "context", lineNum, content });
			}
		}
		return lines;
	}

	private gutter(sign: string, lineNum: string): string {
		return `${sign}${(lineNum || "").padStart(3)} `;
	}

	override render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		if (width < 8) return super.render(width);

		const lines: string[] = [];

		// ── Title (plain, no background) ──
		if (this.filePath) {
			lines.push(this.theme.fg("toolTitle", this.theme.bold(`edit ${this.filePath}`)));
			lines.push("");
		}

		// Track the removed lines of the current change group so added lines can
		// be word-diffed against their counterpart.
		let removedBuf: string[] = [];
		let addIdx = 0;
		const resetGroup = () => {
			removedBuf = [];
			addIdx = 0;
		};

		for (const dl of this.parsedLines) {
			switch (dl.type) {
				case "context": {
					resetGroup();
					const segs: Seg[] = [
						{ text: this.gutter(" ", dl.lineNum), bg: null, fg: GUTTER_FG },
						{ text: dl.content, bg: null, fg: CONTEXT_FG },
					];
					lines.push(...layoutRow(segs, width, null));
					break;
				}
				case "ellipsis": {
					// Skip rendering — no gap row between line-number groups.
					resetGroup();
					break;
				}
				case "removed": {
					removedBuf.push(dl.content);
					const segs: Seg[] = [
						{ text: this.gutter("-", dl.lineNum), bg: RED_BG, fg: GUTTER_FG },
						{ text: dl.content, bg: RED_BG, fg: RED_FG },
					];
					lines.push(...layoutRow(segs, width, RED_BG));
					break;
				}
				case "added": {
					const oldContent = addIdx < removedBuf.length ? removedBuf[addIdx] : undefined;
					addIdx++;

					const segs: Seg[] = [{ text: this.gutter("+", dl.lineNum), bg: GREEN_BG, fg: GUTTER_FG }];

					if (oldContent !== undefined) {
						// Highlight only the tokens that were actually edited.
						for (const part of wordDiff(oldContent, dl.content)) {
							if (part.changed) {
								segs.push({ text: part.text, bg: HIGHLIGHT_BG, fg: HIGHLIGHT_FG });
							} else {
								segs.push({ text: part.text, bg: GREEN_BG, fg: GREEN_FG });
							}
						}
					} else {
						segs.push({ text: dl.content, bg: GREEN_BG, fg: GREEN_FG });
					}

					lines.push(...layoutRow(segs, width, GREEN_BG));
					break;
				}
			}
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	override invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		super.invalidate();
	}
}

// =============================================================================
// Helpers
// =============================================================================

function formatPath(args: any): string | undefined {
	const rawPath = args?.file_path ?? args?.path;
	if (typeof rawPath !== "string" || !rawPath) return undefined;
	return rawPath.length > 50 ? "..." + rawPath.slice(-47) : rawPath;
}

// =============================================================================
// Registration
// =============================================================================

const editSchema = Type.Object({
	path: Type.String({ description: "Path to the file to edit" }),
	edits: Type.Array(
		Type.Object({
			oldText: Type.String(),
			newText: Type.String(),
		}),
	),
});

export function setupChat(pi: ExtensionAPI) {
	const builtIn = createEditToolDefinition(process.cwd());

	pi.registerTool({
		name: "edit",
		label: "edit",
		description: builtIn.description,
		promptSnippet: builtIn.promptSnippet,
		promptGuidelines: builtIn.promptGuidelines,
		parameters: editSchema,
		prepareArguments: builtIn.prepareArguments,
		renderShell: "self" as const,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return builtIn.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args: any, theme: any, context: any) {
			// Let built-in manage async preview lifecycle (stores in context.state.callComponent)
			builtIn.renderCall!(args, theme, context);

			// Check if preview diff is available
			const preview = context.state?.callComponent?.preview;
			const diff = preview && !("error" in preview) ? preview.diff : undefined;

			// Build our own component
			const container = new Container();

			if (diff) {
				container.addChild(new InlineDiff(diff, theme, formatPath(args)));
			} else {
				// No diff yet — show simple header while preview loads
				container.addChild(new Text(theme.fg("toolTitle", theme.bold("edit")) + " " + theme.fg("accent", formatPath(args) ?? "..."), 0, 0));
				if (preview && "error" in preview) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("error", preview.error), 1, 0));
				}
			}

			return wrapWithDot(container, () => statusColorFor(context));
		},

		renderResult(_result: any, _options: any, theme: any, context: any) {
			if (context.isError) {
				const errorText = _result.content
					?.filter((c: any) => c.type === "text")
					?.map((c: any) => c.text || "")
					?.join("\n") || "Error";
				const container = new Container();
				container.addChild(new Text(theme.fg("error", errorText), 0, 0));
				return wrapResultWithConnector(container, () => statusColorFor(context));
			}

			// The diff is already shown by renderCall during the preview phase.
			// ToolExecutionComponent stacks both renderCall + renderResult,
			// so return empty to avoid duplicating the card.
			return new Container();
		},
	});
}
