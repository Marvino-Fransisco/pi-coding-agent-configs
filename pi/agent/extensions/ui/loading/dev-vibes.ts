import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

export function setupLoading(pi: ExtensionAPI) {
	pi.on("agent_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setWorkingMessage(randomMessage());
		}
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setWorkingMessage(randomMessage());
		}
	});
}
