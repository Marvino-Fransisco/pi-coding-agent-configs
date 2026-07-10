/**
 * General Template — Imports all tools and UI modules
 *
 * Usage: pi -e pi/agent/extensions/template/general.ts
 *
 * Tools:
 *   • permission-gate   — Blocks dangerous bash commands
 *
 * UI:
 *   • footer/minimalistic   — Custom footer with pwd, model, context meter
 *   • loading/dev-vibes     — Fun random working messages
 *   • chat/inline-diff      — Inline unified diff rendering for the edit tool
 *   • chat/tool-status      — Status dot + no-background card for every other tool
 *   • layout/sticky-bottom  — Keeps the editor + footer reachable at the bottom
 *                             (ctrl+end, on send, and on the next keystroke
 *                             after the agent finishes responding)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Tools
import setupPermissionGate from "../tools/permission-gate";

// UI
import { setupFooter } from "../ui/footer/minimalistic";
import { setupLoading } from "../ui/loading/dev-vibes";
import { setupChat } from "../ui/chat/inline-diff";
import { setupToolStatusDots } from "../ui/chat/tool-status";
import { setupStickyBottom } from "../ui/layout/sticky-bottom";

export default function (pi: ExtensionAPI) {
	// Tools
	setupPermissionGate(pi);

	// UI
	setupFooter(pi);
	setupLoading(pi);
	setupChat(pi);
	setupToolStatusDots(pi);
	setupStickyBottom(pi);
}
