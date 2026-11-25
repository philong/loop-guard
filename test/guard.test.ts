import assert from "node:assert/strict";
import { test } from "node:test";
import { LoopGuard, callKey, optionsFromEnv } from "../src/guard.ts";
import loopGuard from "../src/index.ts";

test("3rd identical call is blocked, 4th stops", () => {
	const g = new LoopGuard();
	const actions = [1, 2, 3, 4, 5].map(() => g.check("bash", { command: "ls" }).action);
	assert.deepEqual(actions, ["allow", "allow", "block", "stop", "stop"]);
});

test("a different call in between resets the count", () => {
	const g = new LoopGuard();
	g.check("bash", { command: "ls" });
	g.check("bash", { command: "ls" });
	assert.equal(g.check("read", { path: "a" }).action, "allow");
	assert.equal(g.check("bash", { command: "ls" }).action, "allow");
	assert.equal(g.check("bash", { command: "ls" }).action, "allow");
	assert.equal(g.check("bash", { command: "ls" }).action, "block");
});

test("different arguments are a different call", () => {
	const g = new LoopGuard();
	for (let i = 0; i < 10; i++) assert.equal(g.check("read", { path: `f${i}` }).action, "allow");
});

test("argument key order does not matter", () => {
	assert.equal(callKey("read", { path: "a", limit: 5 }), callKey("read", { limit: 5, path: "a" }));
	assert.equal(callKey("read", { path: "a", limit: undefined }), callKey("read", { path: "a" }));
	assert.notEqual(callKey("read", { path: "a" }), callKey("write", { path: "a" }));
});

test("reset forgets the streak", () => {
	const g = new LoopGuard();
	g.check("bash", { command: "ls" });
	g.check("bash", { command: "ls" });
	g.reset();
	assert.equal(g.check("bash", { command: "ls" }).action, "allow");
});

test("stopAt 0 never stops, blockAt 0 never blocks", () => {
	const noStop = new LoopGuard({ blockAt: 2, stopAt: 0 });
	const a = [1, 2, 3, 4].map(() => noStop.check("x", {}).action);
	assert.deepEqual(a, ["allow", "block", "block", "block"]);
	const off = new LoopGuard({ blockAt: 0, stopAt: 0 });
	for (let i = 0; i < 6; i++) assert.equal(off.check("x", {}).action, "allow");
});

test("env options, bad values keep the default", () => {
	assert.deepEqual(optionsFromEnv({}), { blockAt: 3, stopAt: 4 });
	assert.deepEqual(optionsFromEnv({ PI_LOOP_GUARD_BLOCK_AT: "2", PI_LOOP_GUARD_STOP_AT: "0" }), { blockAt: 2, stopAt: 0 });
	assert.deepEqual(optionsFromEnv({ PI_LOOP_GUARD_BLOCK_AT: "x", PI_LOOP_GUARD_STOP_AT: "-1" }), { blockAt: 3, stopAt: 4 });
});

// The extension wired to a fake pi: checks the event names and the returned block result.
function fakePi() {
	const handlers = new Map<string, (event: any, ctx: any) => any>();
	const notes: string[] = [];
	const pi = { on: (name: string, fn: (event: any, ctx: any) => any) => handlers.set(name, fn) };
	const ctx = { hasUI: true, ui: { notify: (msg: string) => notes.push(msg) } };
	loopGuard(pi as any);
	const call = (toolName: string, input: unknown, extra: object = {}) =>
		handlers.get("tool_call")!({ type: "tool_call", toolCallId: "id", toolName, input, ...extra }, ctx);
	return { handlers, notes, ctx, call };
}

test("extension blocks with a note, then terminates", async () => {
	const { call, notes } = fakePi();
	assert.equal(await call("bash", { command: "ls" }), undefined);
	assert.equal(await call("bash", { command: "ls" }), undefined);
	const third = await call("bash", { command: "ls" });
	assert.equal(third.block, true);
	assert.equal(third.terminate, false);
	assert.match(third.reason, /Try something else/);
	const fourth = await call("bash", { command: "ls" });
	assert.equal(fourth.block, true);
	assert.equal(fourth.terminate, true);
	assert.equal(notes.length, 2);
});

test("extension resets on user input and ignores nested calls", async () => {
	const { call, handlers, ctx } = fakePi();
	await call("bash", { command: "ls" });
	await call("bash", { command: "ls" });
	assert.deepEqual(await handlers.get("input")!({ text: "hi" }, ctx), { action: "continue" });
	assert.equal(await call("bash", { command: "ls" }), undefined);
	for (let i = 0; i < 5; i++) assert.equal(await call("bash", { command: "ls" }, { parentToolCallId: "p" }), undefined);
	assert.equal(await call("bash", { command: "ls" }), undefined); // nested calls did not count: this is #2
	assert.equal((await call("bash", { command: "ls" })).block, true);
});
