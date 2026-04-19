import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

// =============================================================================
// ANSI color helpers
// =============================================================================

// Pastel yellow: #FFE066 → RGB(255, 224, 102)
const PASTEL_YELLOW_FG = "\x1b[38;2;255;224;102m";
const RESET = "\x1b[0m";

export function yellow(text: string): string {
	return `${PASTEL_YELLOW_FG}${text}${RESET}`;
}

export function bgRgb(r: number, g: number, b: number, text: string): string {
	return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

export function fgRgb(r: number, g: number, b: number, text: string): string {
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

// =============================================================================
// Text layout helpers
// =============================================================================

export function pad(text: string, width: number): string {
	const vis = visibleWidth(text);
	if (vis >= width) return truncateToWidth(text, width, "");
	return text + " ".repeat(width - vis);
}

export function wrapCell(text: string, width: number): string[] {
	if (!text || width <= 0) return [""];
	if (visibleWidth(text) <= width) return [text];
	return wrapTextWithAnsi(text, width);
}

export { truncateToWidth, visibleWidth };
