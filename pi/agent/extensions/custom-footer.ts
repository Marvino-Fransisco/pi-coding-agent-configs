import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// Pastel yellow: #FFE066 → RGB(255, 224, 102)
const PASTEL_YELLOW_FG = "\x1b[38;2;255;224;102m";
const RESET = "\x1b[0m";

function yellow(text: string): string {
	return `${PASTEL_YELLOW_FG}${text}${RESET}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((_tui, _theme, _footerData) => ({
			invalidate() {},
			render(width: number): string[] {
				// --- Left side: pwd ---
				let pwd = ctx.sessionManager.getCwd() ?? "";
				const home = process.env.HOME || process.env.USERPROFILE;
				if (home && pwd.startsWith(home)) {
					pwd = `~${pwd.slice(home.length)}`;
				}

				// --- Right side: context meter ---
				const contextUsage = ctx.getContextUsage();
				const percent = contextUsage?.percent ?? 0;
				const displayPercent =
					contextUsage?.percent !== null && contextUsage?.percent !== undefined
						? `${Math.round(percent)}%`
						: "?%";

				// 10-step meter: filled blocks ■, empty = spaces
				const filledSteps = Math.min(10, Math.round(percent / 10));
				const emptySteps = 10 - filledSteps;
				const modelName = ctx.model?.id || "no-model";
				const thinkingLevel = pi.getThinkingLevel();
				const meter = `[${"■".repeat(filledSteps)}${" ".repeat(emptySteps)}] ${displayPercent}`;

				// --- Layout: left = pwd, right = model + meter ---
				const left = yellow(pwd);
				const right = yellow(`${thinkingLevel} • ${modelName} ${meter}`);

				const leftW = visibleWidth(left);
				const rightW = visibleWidth(right);
				const padding = " ".repeat(Math.max(1, width - leftW - rightW));

				return [truncateToWidth(left + padding + right, width), ""];
			},
		}));
	});
}
