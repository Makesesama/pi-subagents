import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { buildStateSnapshot, emitStateSnapshot } = await import("../../src/tui/state-snapshot.ts") as {
	buildStateSnapshot: (jobs: Array<Record<string, unknown>>) => string | undefined;
	emitStateSnapshot: (ctx: Record<string, unknown>, jobs: Array<Record<string, unknown>>) => void;
};
const { renderWidget } = await import("../../src/tui/render.ts") as {
	renderWidget: (ctx: Record<string, unknown>, jobs: Array<Record<string, unknown>>) => void;
};

const STATE_KEY = "pi-subagents-state";
const WIDGET_KEY = "subagent-async";

function createKeyCapturingContext(mode = "rpc") {
	const calls: Array<{ key: string; value: unknown }> = [];
	const ctx = {
		mode,
		hasUI: true,
		ui: {
			theme: { fg: (_n: string, t: string) => t, bold: (t: string) => t },
			setWidget: (key: string, value: unknown) => {
				calls.push({ key, value });
			},
			requestRender: () => {},
		},
	};
	return { ctx, calls };
}

describe("subagent structured state snapshot", () => {
	it("projects minimal stable fields for each run", () => {
		const json = buildStateSnapshot([
			{
				asyncId: "run-1",
				asyncDir: "/tmp/a",
				status: "running",
				mode: "single",
				agents: ["scout"],
				sessionFile: "/home/u/.pi/agent/sessions/x/run-1/run-0/session.jsonl",
				outputFile: "/tmp/a/output-0.log",
				sessionDir: "/home/u/.pi/agent/sessions/x/run-1/run-0",
				startedAt: 1000,
				updatedAt: 2000,
				currentTool: "read",
				turnCount: 3,
				// extra fields that must NOT leak into the payload
				controlEventCursor: 99,
				toolCount: 12,
			},
		]);
		assert.ok(json, "snapshot should be produced for non-empty jobs");
		const parsed = JSON.parse(json!);
		assert.equal(parsed.runs.length, 1);
		const run = parsed.runs[0];
		assert.deepEqual(run, {
			id: "run-1",
			agents: ["scout"],
			status: "running",
			mode: "single",
			sessionFile: "/home/u/.pi/agent/sessions/x/run-1/run-0/session.jsonl",
			outputFile: "/tmp/a/output-0.log",
			sessionDir: "/home/u/.pi/agent/sessions/x/run-1/run-0",
			startedAt: 1000,
			updatedAt: 2000,
			currentTool: "read",
			turnCount: 3,
		});
		// JSON.stringify drops undefined-valued keys; children must be absent here.
		assert.equal("children" in run, false);
		// Ensure leaked-field guard holds.
		assert.equal("controlEventCursor" in run, false);
		assert.equal("toolCount" in run, false);
	});

	it("projects nested children", () => {
		const json = buildStateSnapshot([
			{
				asyncId: "chain-1",
				asyncDir: "/tmp/c",
				status: "running",
				mode: "chain",
				agents: ["planner"],
				nestedChildren: [
					{ id: "child-a", agent: "worker", state: "running", sessionFile: "/s/child-a/session.jsonl" },
					{ id: "child-b", agents: ["reviewer"], state: "queued" },
				],
			},
		]);
		const run = JSON.parse(json!).runs[0];
		assert.deepEqual(run.children, [
			{ id: "child-a", agent: "worker", status: "running", sessionFile: "/s/child-a/session.jsonl" },
			{ id: "child-b", agent: "reviewer", status: "queued" },
		]);
	});

	it("returns undefined for empty jobs (clear signal)", () => {
		assert.equal(buildStateSnapshot([]), undefined);
	});

	it("emits the state widget alongside the human-readable widget in renderWidget", () => {
		const { ctx, calls } = createKeyCapturingContext("rpc");
		renderWidget(ctx as never, [
			{ asyncId: "run-1", asyncDir: "/tmp/a", status: "running", agents: ["scout"], updatedAt: 1 },
		]);
		const stateCall = calls.find((c) => c.key === STATE_KEY);
		const widgetCall = calls.find((c) => c.key === WIDGET_KEY);
		assert.ok(stateCall, "should emit the structured state widget");
		assert.ok(widgetCall, "should still emit the human-readable widget");
		assert.ok(Array.isArray(stateCall!.value), "state widget value should be a one-element string array");
		const parsed = JSON.parse((stateCall!.value as string[])[0]!);
		assert.equal(parsed.runs[0].id, "run-1");
	});

	it("clears the state widget when there are no jobs", () => {
		const { ctx, calls } = createKeyCapturingContext("rpc");
		renderWidget(ctx as never, []);
		const stateCall = calls.find((c) => c.key === STATE_KEY);
		assert.ok(stateCall, "should still signal the state widget on clear");
		assert.equal(stateCall!.value, undefined, "empty jobs should clear the state widget");
	});

	it("does not emit when the context has no UI", () => {
		const calls: Array<{ key: string; value: unknown }> = [];
		const ctx = {
			hasUI: false,
			ui: { setWidget: (key: string, value: unknown) => calls.push({ key, value }) },
		};
		emitStateSnapshot(ctx as never, [
			{ asyncId: "run-1", asyncDir: "/tmp/a", status: "running", agents: ["scout"] },
		]);
		assert.equal(calls.length, 0, "no setWidget calls without a UI");
	});
});
