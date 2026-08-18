import { redactEmailParams } from './redactEmailParams';
import { redactErrorText } from './redactErrorText';
import { type DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

/**
 * Datadog RUM's `beforeSend` hook: decide whether the event is worth reporting
 * (`shouldKeepEvent`), then redact sensitive text from the ones we keep (`redactErrorText`).
 *
 * The order matters — the filter attributes errors by inspecting the raw stack and the raw
 * resource URL, so it has to run before either is rewritten. Mutating `error.message`,
 * `error.stack` and `error.resource.url` in `beforeSend` is supported by the browser SDK (all
 * three are on its editable-property list for error events), and only affects what is reported:
 * the UI renders the error object itself, untouched.
 *
 * `error.resource.url` is redacted alongside the text because a failed request carries the same
 * identity in a different field — `getGitHubRepo` fetches
 * `https://api.github.com/repos/<owner>/<repo>`, so a 404 on a private repo would otherwise ship
 * the repo name verbatim while the message beside it is redacted.
 *
 * The URL fields get `redactEmailParams` for *every* event type, not just errors: `shouldKeepEvent`
 * returns early for non-errors, so nothing here used to run for the view and resource events that
 * carry an auth screen's address. `view.url`, `view.referrer` and a resource event's own
 * `resource.url` are all on the SDK's editable-property list.
 */
export function beforeSend(event: DatadogErrorEvent) {
	if (!shouldKeepEvent(event)) {
		return false;
	}
	const error = event.error;
	if (error) {
		if (error.message) {
			error.message = redactErrorAndEmails(error.message);
		}
		if (error.stack) {
			error.stack = redactErrorAndEmails(error.stack);
		}
		if (error.handling_stack) {
			error.handling_stack = redactErrorAndEmails(error.handling_stack);
		}
		if (error.resource?.url) {
			error.resource.url = redactErrorAndEmails(error.resource.url);
		}
	}
	const view = event.view;
	if (view) {
		if (view.url) {
			view.url = redactEmailParams(view.url);
		}
		if (view.referrer) {
			view.referrer = redactEmailParams(view.referrer);
		}
	}
	if (event.resource?.url) {
		event.resource.url = redactEmailParams(event.resource.url);
	}
	return true;
}

/** `redactErrorText` leaves Harper-host paths whole, so the address needs its own pass after it. */
function redactErrorAndEmails(text: string) {
	return redactEmailParams(redactErrorText(text));
}
