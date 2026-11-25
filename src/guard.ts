// Counts identical tool calls in a row and says what to do with the next one.
// No pi imports here, so the tests can run this file with plain `node --test`.

export interface GuardOptions {
	/** The Nth identical call in a row is blocked, and the model gets a note. */
	blockAt: number;
	/** The Nth identical call in a row is blocked and the agent stops. 0 = never stop. */
	stopAt: number;
}

export type Verdict =
	| { action: "allow"; count: number }
	| { action: "block"; count: number; reason: string }
	| { action: "stop"; count: number; reason: string };

export const DEFAULTS: GuardOptions = { blockAt: 3, stopAt: 4 };

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` count as the same arguments. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.keys(value as Record<string, unknown>)
			.sort()
			.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
			.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

export function callKey(toolName: string, input: unknown): string {
	return `${toolName}\u0000${stableStringify(input)}`;
}

export class LoopGuard {
	private lastKey: string | undefined;
	private count = 0;
	readonly options: GuardOptions;

	constructor(options: Partial<GuardOptions> = {}) {
		this.options = { ...DEFAULTS, ...options };
	}

	/** Forget the streak, for example when the user types a new message. */
	reset(): void {
		this.lastKey = undefined;
		this.count = 0;
	}

	/** Record one call and decide about it. */
	check(toolName: string, input: unknown): Verdict {
		const key = callKey(toolName, input);
		if (key === this.lastKey) {
			this.count += 1;
		} else {
			this.lastKey = key;
			this.count = 1;
		}
		const { blockAt, stopAt } = this.options;
		const count = this.count;
		if (stopAt > 0 && count >= stopAt) {
			return {
				action: "stop",
				count,
				reason:
					`Loop guard: this is call ${count} in a row of \`${toolName}\` with the same arguments. ` +
					"It was not run, and the agent is stopping so the user can step in.",
			};
		}
		if (blockAt > 0 && count >= blockAt) {
			return {
				action: "block",
				count,
				reason:
					`Loop guard: this is call ${count} in a row of \`${toolName}\` with the same arguments, ` +
					"and it was not run. Repeating it will give the same result. Try something else: " +
					"change the arguments, use a different tool, or explain to the user what is blocking you.",
			};
		}
		return { action: "allow", count };
	}
}

/** Reads PI_LOOP_GUARD_BLOCK_AT and PI_LOOP_GUARD_STOP_AT; a missing or bad value keeps the default. */
export function optionsFromEnv(env: Record<string, string | undefined>): GuardOptions {
	const read = (name: string, fallback: number): number => {
		const raw = env[name];
		if (raw === undefined || raw.trim() === "") return fallback;
		const n = Number(raw);
		return Number.isInteger(n) && n >= 0 ? n : fallback;
	};
	return {
		blockAt: read("PI_LOOP_GUARD_BLOCK_AT", DEFAULTS.blockAt),
		stopAt: read("PI_LOOP_GUARD_STOP_AT", DEFAULTS.stopAt),
	};
}
