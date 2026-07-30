import { redactErrorText } from './redactErrorText';
import { DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

/**
 * Datadog RUM's `beforeSend` hook: decide whether the event is worth reporting
 * (`shouldKeepEvent`), then redact sensitive text from the ones we keep (`redactErrorText`).
 *
 * The order matters — the filter attributes errors by inspecting the raw stack, so it has to
 * run before any URL in that stack is rewritten. Mutating `error.message`/`error.stack` in
 * `beforeSend` is supported by the browser SDK (both are on its editable-property list), and
 * only affects what is reported: the UI renders the error object itself, untouched.
 */
export function beforeSend(event: DatadogErrorEvent) {
	if (!shouldKeepEvent(event)) {
		return false;
	}
	const error = event.error;
	if (error) {
		if (error.message) {
			error.message = redactErrorText(error.message);
		}
		if (error.stack) {
			error.stack = redactErrorText(error.stack);
		}
	}
	return true;
}
