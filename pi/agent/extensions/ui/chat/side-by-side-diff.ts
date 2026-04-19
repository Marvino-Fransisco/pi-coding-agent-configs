import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { bgRgb, fgRgb, pad, wrapCell, visibleWidth } from "../utils";

// =============================================================================
// Side-by-side diff component
// =============================================================================

interface DiffLine {
	type: "removed" | "added" | "context" | "ellipsis";
	lineNum: string;
	content: string;
}

class SideBySideDiff extends Container {
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

	override render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const gap = 1;
		const leftWidth = Math.floor((width - gap) / 2);
		const rightWidth = width - leftWidth - gap;

		if (leftWidth < 12 || rightWidth < 12) {
			return super.render(width);
		}

		const lines: string[] = [];
		const sep = this.theme.fg("border", "│");

		// ── Padding ──
		const padX = 1;
		const padY = 1;
		const innerLeft = leftWidth - padX;
		const innerRight = rightWidth - padX;

		// ── Card backgrounds ──
		const cardBg = (t: string) => bgRgb(30, 30, 42, t);
		const delBg = (t: string) => bgRgb(55, 24, 24, t);
		const addBg = (t: string) => bgRgb(22, 45, 22, t);

		const px = " ".repeat(padX);

		const row = (leftContent: string, leftBgFn: (t: string) => string, rightContent: string, rightBgFn: (t: string) => string) => {
			return leftBgFn(px + pad(leftContent, innerLeft)) + sep + rightBgFn(px + pad(rightContent, innerRight));
		};

		const emptyRow = () => row("", cardBg, "", cardBg);

		// ── Top padding ──
		for (let i = 0; i < padY; i++) lines.push(emptyRow());

		// ── Title row (edit file.ext) spanning full width ──
		if (this.filePath) {
			const title = this.theme.fg("toolTitle", this.theme.bold(`edit ${this.filePath}`));
			lines.push(
				cardBg(px + pad(title, leftWidth - padX))
				+ sep
				+ cardBg(" ".repeat(rightWidth)),
			);
		}

		// ── Spacer between title and columns ──
		if (this.filePath) {
			lines.push(emptyRow());
		}

		// ── Column headers ──
		const leftTitle = this.theme.bold(fgRgb(255, 130, 130, "Previous"));
		const rightTitle = this.theme.bold(fgRgb(130, 230, 130, "Now"));
		lines.push(row(leftTitle, cardBg, rightTitle, cardBg));

		// ── Body rows (with word-wrap) ──
		for (const dl of this.parsedLines) {
			let left = "";
			let right = "";
			let leftBg = cardBg;
			let rightBg = cardBg;

			switch (dl.type) {
				case "removed":
					left = this.theme.fg("toolDiffRemoved", `${dl.lineNum} ${dl.content}`);
					leftBg = delBg;
					break;
				case "added":
					right = this.theme.fg("toolDiffAdded", `${dl.lineNum} ${dl.content}`);
					rightBg = addBg;
					break;
				case "context":
					left = this.theme.fg("toolDiffContext", `${dl.lineNum} ${dl.content}`);
					right = left;
					break;
				case "ellipsis":
					left = this.theme.fg("dim", "...");
					right = left;
					break;
			}

			const leftWrapped = wrapCell(left, innerLeft);
			const rightWrapped = wrapCell(right, innerRight);

			const maxRows = Math.max(leftWrapped.length, rightWrapped.length);
			while (leftWrapped.length < maxRows) leftWrapped.push("");
			while (rightWrapped.length < maxRows) rightWrapped.push("");

			for (let i = 0; i < maxRows; i++) {
				lines.push(
					leftBg(px + pad(leftWrapped[i], innerLeft))
					+ sep
					+ rightBg(px + pad(rightWrapped[i], innerRight)),
				);
			}
		}

		// ── Bottom padding ──
		for (let i = 0; i < padY; i++) lines.push(emptyRow());

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
				container.addChild(new SideBySideDiff(diff, theme, formatPath(args)));
			} else {
				// No diff yet — show simple header while preview loads
				container.addChild(new Text(theme.fg("toolTitle", theme.bold("edit")) + " " + theme.fg("accent", formatPath(args) ?? "..."), 0, 0));
				if (preview && "error" in preview) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("error", preview.error), 1, 0));
				}
			}

			return container;
		},

		renderResult(_result: any, _options: any, theme: any, context: any) {
			if (context.isError) {
				const errorText = _result.content
					?.filter((c: any) => c.type === "text")
					?.map((c: any) => c.text || "")
					?.join("\n") || "Error";
				const container = new Container();
				container.addChild(new Text(theme.fg("toolTitle", theme.bold("edit")), 0, 0));
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("error", errorText), 1, 0));
				return container;
			}

			// The diff is already shown by renderCall during the preview phase.
			// ToolExecutionComponent stacks both renderCall + renderResult,
			// so return empty to avoid duplicating the card.
			return new Container();
		},
	});
}
