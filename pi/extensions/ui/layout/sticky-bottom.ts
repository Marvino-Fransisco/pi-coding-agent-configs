/**
 * Sticky Bottom — Extension (no core changes)
 * -----------------------------------------------------------------------------
 * pi's TUI prints into the terminal's *native* scrollback — there is no
 * alternate-screen / app-managed viewport. That means:
 *
 *   • The editor + footer are always the *last* thing printed, so they are
 *     already pinned to the bottom of the *live* view by construction.
 *   • Once a user manually scrolls the terminal up (mouse wheel, shift+PageUp,
 *     etc.), they are looking at a frozen historical screen the terminal
 *     *emulator* itself is showing them. No program running inside that
 *     terminal — pi included — can see that scroll position or draw over it;
 *     that boundary is enforced by the terminal, not by pi.
 *
 * What this extension *can* do is make it effectively unnecessary to scroll
 * back down by hand:
 *
 *   1. `ctrl+end` — an explicit, on-demand "jump to the live bottom" shortcut.
 *   2. Sending a message always snaps back to the bottom immediately.
 *   3. The moment the agent finishes responding, the *next* keystroke the
 *      user makes (i.e. the moment they start typing again) automatically
 *      snaps the view back to the bottom first, so they land on a visible
 *      editor + footer without ever needing to scroll down manually.
 *
 * The snap itself is `tui.requestRender(true)`, which forces a full redraw:
 * it clears the terminal's scrollback and reprints the entire conversation
 * (nothing is lost — pi always keeps the full history in memory), ending
 * with the cursor back at the editor. Writing fresh output like this is also
 * what makes most terminal emulators auto-scroll back to the live view.
 * =============================================================================
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, type TUI } from "@mariozechner/pi-tui";

export function setupStickyBottom(pi: ExtensionAPI) {
	let tuiRef: TUI | undefined;
	// Set right after the agent goes idle; consumed by the next keystroke so
	// we snap back to bottom exactly once per "the user looked away" episode
	// instead of forcing a full redraw on every single keystroke.
	let armed = false;

	const snapToBottom = () => {
		tuiRef?.requestRender(true);
	};

	pi.on("session_start", (_event, ctx) => {
		// Extensions only get a `tui` reference inside component factories, so
		// grab one via an invisible widget (renders nothing, adds no lines).
		ctx.ui.setWidget("sticky-bottom:capture", (tui: TUI) => {
			tuiRef = tui;
			return {
				render: () => [],
				invalidate() {},
			};
		});

		// Raw keystroke tap: if we're "armed", the very next key the user
		// presses snaps the view back to the bottom before doing anything
		// else. Never consumes or rewrites the input — it always passes
		// through untouched to the editor.
		ctx.ui.onTerminalInput((data) => {
			if (armed && data.length > 0) {
				armed = false;
				snapToBottom();
			}
			return undefined;
		});
	});

	// Agent fully settled (no pending retry/compaction/queued turn) — arm the
	// next keystroke to snap back down, in case the user scrolled up to read
	// while it was responding.
	pi.on("agent_settled", () => {
		armed = true;
	});

	// Submitting a message is itself already "the user wants to be at the
	// bottom" — snap immediately instead of waiting for another keystroke.
	pi.on("input", () => {
		armed = false;
		snapToBottom();
	});

	// Manual override: jump to the live bottom on demand, any time.
	pi.registerShortcut(Key.ctrl("end"), {
		description: "Jump back to the live bottom (editor + footer)",
		handler: () => {
			armed = false;
			snapToBottom();
		},
	});
}

export default setupStickyBottom;
