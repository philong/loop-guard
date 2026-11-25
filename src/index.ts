// pi extension: stops a model that calls the same tool with the same arguments over and over.
//
// The 3rd identical call in a row is blocked, and the model is told to try something else.
// The 4th is blocked and the agent stops. A different call, or a new user message, resets the count.
// Change the limits with PI_LOOP_GUARD_BLOCK_AT and PI_LOOP_GUARD_STOP_AT (0 turns that step off).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LoopGuard, optionsFromEnv } from "./guard.ts";

export default function loopGuard(pi: ExtensionAPI) {
	const guard = new LoopGuard(optionsFromEnv(process.env));

	pi.on("session_start", async () => {
		guard.reset();
	});

	pi.on("input", async () => {
		guard.reset();
		return { action: "continue" };
	});

	pi.on("tool_call", async (event, ctx) => {
		// Calls made by another tool (a codemode script, for example) may repeat on purpose.
		if (event.parentToolCallId) return undefined;

		const verdict = guard.check(event.toolName, event.input);
		if (verdict.action === "allow") return undefined;

		const stop = verdict.action === "stop";
		if (ctx.hasUI) {
			ctx.ui.notify(
				stop
					? `Loop guard: stopped after ${verdict.count} identical \`${event.toolName}\` calls`
					: `Loop guard: blocked identical \`${event.toolName}\` call #${verdict.count}`,
				"warning",
			);
		}
		return { block: true, reason: verdict.reason, terminate: stop };
	});
}
