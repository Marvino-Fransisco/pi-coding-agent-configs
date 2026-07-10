/**
 * General Template — Imports all tools and UI modules
 *
 * Usage: pi -e pi/agent/extensions/template/general.ts
 *
 * Tools:
 *   • permission-gate   — Blocks dangerous bash commands
 *
 * UI:
 *   • footer/minimalistic       — Custom footer with pwd, model, context meter
 *   • loading/dev-vibes         — Fun random working messages
 *   • chat/inline-diff          — Inline unified diff rendering for the edit tool
 *   • chat/tool-status          — Status dot + no-background card for every other
 *                                 tool, collapsed to a one-line summary once
 *                                 settled (ctrl+o to expand, shown with a muted
 *                                 grey background while open)
 *   • chat/user-message-padding — Tightens the user message card's vertical
 *                                 padding to match the assistant message style
 *   • chat/tool-output-padding  — Same vertical tightening for the tool call
 *                                 output card (keeps its horizontal padding)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Tools
import setupPermissionGate from "../tools/permission-gate";

// UI
import { setupFooter } from "../ui/footer/minimalistic";
import { setupLoading } from "../ui/loading/dev-vibes";
import { setupChat } from "../ui/chat/inline-diff";
import { setupToolStatusDots } from "../ui/chat/tool-status";
import { setupUserMessagePadding } from "../ui/chat/user-message-padding";
import { setupToolOutputPadding } from "../ui/chat/tool-output-padding";

export default function (pi: ExtensionAPI) {
	// Tools
	setupPermissionGate(pi);

	// UI
	setupFooter(pi);
	setupLoading(pi);
	setupChat(pi);
	setupToolStatusDots(pi);
	setupUserMessagePadding(pi);
	setupToolOutputPadding(pi);
}
