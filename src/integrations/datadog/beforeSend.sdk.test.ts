import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { beforeSend } from './beforeSend';
import { DatadogErrorEvent } from './shouldKeepEvent';

/**
 * Runs `beforeSend` inside the installed SDK's own error collection and assembly, because which of
 * its writes survive is decided there (`limitModification`), not by the hook. The modules are
 * internal, so an SDK bump that moves them fails here first: re-check the allowlist, don't just
 * repoint the paths.
 */
const sdkRequire = createRequire(createRequire(import.meta.url).resolve('@datadog/browser-rum'));
const rumCore = (path: string) => sdkRequire(`@datadog/browser-rum-core/cjs/domain/${path}`);

interface SentEvent extends DatadogErrorEvent {
	error: { message: string; causes?: { message: string; stack?: string }[] };
}

function sent(error: Error, hook: (event: SentEvent) => boolean) {
	const { LifeCycle, LifeCycleEventType } = rumCore('lifeCycle.js');
	const lifeCycle = new LifeCycle();
	const events: SentEvent[] = [];
	lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event: SentEvent) => events.push(event));
	rumCore('assembly.js').startRumAssembly(
		{ beforeSend: hook },
		lifeCycle,
		rumCore('hooks.js').createHooks(),
		() => {},
		100,
	);
	rumCore('error/errorCollection.js').doStartErrorCollection(lifeCycle).addError({
		error,
		context: {},
		startClocks: { relative: 0, timeStamp: Date.now() },
	});
	return events;
}

/** A stack the SDK parses into Studio-hosted frames, so only the text under test can need redaction. */
function thrown(name: string, message: string, cause?: Error) {
	const error = new Error(message, { cause });
	error.name = name;
	error.stack = `${name}: ${message}\n    at fb (https://fabric.harper.fast/assets/index-Dcf_w9Ns.js:26:1557)`;
	return error;
}

const idle = 'The stream went idle before completing.';

describe('beforeSend in the RUM SDK pipeline', () => {
	it('sends an error whose cause needs no redaction, cause and all', () => {
		const events = sent(
			thrown('SSEInconclusiveError', idle, thrown('AbortError', 'BodyStreamBuffer was aborted')),
			beforeSend,
		);
		expect(events).toHaveLength(1);
		expect(events[0].error.causes?.[0].message).toBe('BodyStreamBuffer was aborted');
	});

	it('sends nothing for an error whose cause would need redaction', () => {
		const cause = thrown('Error', 'Failed to clone https://github.com/acme-corp/billing-service.git');
		expect(sent(thrown('SSEInconclusiveError', idle, cause), beforeSend)).toEqual([]);
	});

	// The premise of dropping rather than rewriting. If this fails, the SDK now keeps a rewritten
	// cause, and `beforeSend` could redact causes in place instead of withholding their event.
	it('undoes a beforeSend rewrite of a cause', () => {
		const cause = thrown('Error', 'Failed to clone acme-corp/billing');
		const events = sent(thrown('Error', 'Deploy failed', cause), (event) => {
			event.error.message = 'rewritten';
			event.error.causes![0].message = 'rewritten';
			return true;
		});
		expect(events[0].error.message).toBe('rewritten');
		expect(events[0].error.causes?.[0].message).toBe('Failed to clone acme-corp/billing');
	});
});
