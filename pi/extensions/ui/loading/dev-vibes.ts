import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fgRgb } from "../utils";

const messages = [
	// Dev workflow vibes
	"Building… don't forget to blame the cache",
	"Running tests… fingers crossed 🤞",
	"Compiling… this might take a coffee break",
	"Deploying… what could possibly go wrong?",
	"Installing dependencies… again",
	"Bundling assets like it's 2015",

	// Tooling jokes
	"Running npm install… see you soon",
	"Waiting for Docker to behave…",
	"Rebuilding containers… 🐳",
	"Asking Stack Overflow for help…",
	"Git pulling… hope nothing breaks",
	"Resolving merge conflicts… good luck",

	// Debugging humor
	"Debugging… it worked yesterday",
	"Chasing a missing semicolon…",
	"Fixing bugs… creating features",
	"Logging things we don't understand",
	"Stepping through code like a detective 🕵️",

	// Infra / backend flavor
	"Scaling horizontally… probably",
	"Waking up the servers…",
	"Querying the database… gently",
	"Negotiating with the API…",
	"Sending packets into the void…",

	// Playful + witty
	"Turning caffeine into code…",
	"Writing code that writes code…",
	'Making it "just work™"…',
	"Engineering in progress…",
	"Almost there… unless it crashes",

	// Sarcastic loading humor
	"Discovering new ways of making you wait.",
	"Your time is very important to us. Please wait while we ignore you.",
	"Still faster than Windows update.",
	"We are not liable for any broken screens as a result of waiting.",
	"Bored of slow loading spinner? Buy more RAM!",
	"Kindly hold on until I finish a cup of coffee.",
	"We will be back in 1/0 minutes.",
	"Why don't you order a sandwich?",
	"Don't panic, just count to infinite.",
	"Please wait, your PC is not a superman!",
];

let lastIdx = -1;

function randomMessage(): string {
	let idx: number;
	do {
		idx = Math.floor(Math.random() * messages.length);
	} while (idx === lastIdx && messages.length > 1);
	lastIdx = idx;
	return messages[idx];
}

// =============================================================================
// Smooth color animation
// =============================================================================
//
// The working message gradually drifts toward a new random color every 2s.
// We animate the hue on a color wheel so transitions stay vivid and smooth
// (never washing out to grey the way a raw RGB lerp can).

const NEW_TARGET_MS = 2000; // pick a fresh random color every 2 seconds
const FRAME_MS = 60; // animation tick
const EASE = 0.06; // how quickly we approach the target hue each frame

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) [r, g, b] = [c, x, 0];
	else if (hp < 2) [r, g, b] = [x, c, 0];
	else if (hp < 3) [r, g, b] = [0, c, x];
	else if (hp < 4) [r, g, b] = [0, x, c];
	else if (hp < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = l - c / 2;
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

class ColorAnimator {
	private timer: ReturnType<typeof setInterval> | undefined;
	private message = "";
	private hue = Math.random() * 360;
	private targetHue = Math.random() * 360;
	private lastRetarget = 0;

	setMessage(ctx: any, message: string): void {
		this.message = message;
		this.render(ctx);
		this.start(ctx);
	}

	private render(ctx: any): void {
		const [r, g, b] = hslToRgb(this.hue, 0.7, 0.65);
		ctx.ui.setWorkingMessage(fgRgb(r, g, b, this.message));
	}

	private start(ctx: any): void {
		if (this.timer) return;
		this.lastRetarget = Date.now();
		this.timer = setInterval(() => {
			const now = Date.now();
			if (now - this.lastRetarget >= NEW_TARGET_MS) {
				this.targetHue = Math.random() * 360;
				this.lastRetarget = now;
			}
			// Move along the shortest arc toward the target hue for smoothness.
			let delta = ((this.targetHue - this.hue + 540) % 360) - 180;
			this.hue = (this.hue + delta * EASE + 360) % 360;
			this.render(ctx);
		}, FRAME_MS);
		if (typeof this.timer?.unref === "function") this.timer.unref();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}

export function setupLoading(pi: ExtensionAPI) {
	const animator = new ColorAnimator();

	pi.on("agent_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			animator.setMessage(ctx, randomMessage());
		}
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			animator.setMessage(ctx, randomMessage());
		}
	});

	pi.on("agent_end", async (_event, _ctx) => {
		animator.stop();
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		animator.stop();
	});
}
