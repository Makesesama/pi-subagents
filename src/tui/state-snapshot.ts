/**
 * Structured live-state snapshot for RPC clients.
 *
 * Emits a small, stable JSON projection of the live async subagent jobs under a
 * reserved widget key (STATE_WIDGET_KEY). Unlike the human-readable widget, this
 * payload is meant to be machine-parsed (e.g. by the Emacs frontend) so a client
 * can list running subagents and open/tail their session files.
 *
 * Keep this projection MINIMAL and STABLE: only fields a client needs to list
 * runs and locate their output. Do not dump the full AsyncJobState.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AsyncJobState, type NestedRunSummary, STATE_WIDGET_KEY } from "../shared/types.ts";

/** A single nested child run, projected for the client. */
interface ChildSnapshot {
	id: string;
	agent?: string;
	status: string;
	sessionFile?: string;
}

/** A single top-level async run, projected for the client. */
interface RunSnapshot {
	id: string;
	agents: string[];
	status: AsyncJobState["status"];
	mode?: string;
	sessionFile?: string;
	outputFile?: string;
	sessionDir?: string;
	startedAt?: number;
	updatedAt?: number;
	currentTool?: string;
	turnCount?: number;
	children?: ChildSnapshot[];
}

interface StateSnapshot {
	runs: RunSnapshot[];
}

function projectChildren(children: NestedRunSummary[] | undefined): ChildSnapshot[] | undefined {
	if (!children || children.length === 0) return undefined;
	return children.map((c) => ({
		id: c.id,
		agent: c.agent ?? c.agents?.[0],
		status: c.state,
		sessionFile: c.sessionFile,
	}));
}

function projectRun(job: AsyncJobState): RunSnapshot {
	return {
		id: job.asyncId,
		agents: job.agents ?? [],
		status: job.status,
		mode: job.mode,
		sessionFile: job.sessionFile,
		outputFile: job.outputFile,
		sessionDir: job.sessionDir,
		startedAt: job.startedAt,
		updatedAt: job.updatedAt,
		currentTool: job.currentTool,
		turnCount: job.turnCount,
		children: projectChildren(job.nestedChildren),
	};
}

/**
 * Build the JSON snapshot string for the given live jobs.
 * Returns undefined when there are no jobs (caller should clear the widget).
 */
export function buildStateSnapshot(jobs: AsyncJobState[]): string | undefined {
	if (jobs.length === 0) return undefined;
	const snapshot: StateSnapshot = { runs: jobs.map(projectRun) };
	return JSON.stringify(snapshot);
}

/**
 * Emit (or clear) the structured state snapshot widget for RPC clients.
 * Safe to call whenever the human-readable widget is updated.
 */
export function emitStateSnapshot(ctx: ExtensionContext, jobs: AsyncJobState[]): void {
	if (!ctx.hasUI) return;
	const json = buildStateSnapshot(jobs);
	ctx.ui.setWidget(STATE_WIDGET_KEY, json === undefined ? undefined : [json]);
}
