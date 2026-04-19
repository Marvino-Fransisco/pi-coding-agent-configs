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
 *   • chat/side-by-side-diff — Two-column diff rendering for the edit tool
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Tools
import setupPermissionGate from "../tools/permission-gate";

// UI
import { setupFooter } from "../ui/footer/minimalistic";
import { setupLoading } from "../ui/loading/dev-vibes";
import { setupChat } from "../ui/chat/side-by-side-diff";

export default function (pi: ExtensionAPI) {
	// Tools
	setupPermissionGate(pi);

	// UI
	setupFooter(pi);
	setupLoading(pi);
	setupChat(pi);
}
