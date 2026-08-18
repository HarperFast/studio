import { redactErrorText } from './redactErrorText';
import { redactCredentialParams, redactSensitiveParams } from './redactSensitiveParams';
import { type DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

/**
 * Datadog RUM's `beforeSend` hook: redact the URL fields, decide whether the event is worth
 * reporting (`shouldKeepEvent`), then redact sensitive text from the ones we keep.
 *
 * The URL fields go first, and the error text after the filter, because each has an ordering
 * constraint pulling the opposite way. The filter attributes errors by inspecting the raw stack and
 * the raw `error.resource.url`, so neither may be rewritten before it runs. It reads no URL field,
 * though, and it *can* throw on a malformed error field — which the SDK's `catchUserErrors` swallows
 * into shipping the event regardless (a view event cannot be dismissed from here at all). Cleaning
 * the URLs first is what stops a reset token riding out on that path.
 *
 * `error.resource.url` is redacted alongside the text because a failed request carries the same
 * identity in a different field — `getGitHubRepo` fetches
 * `https://api.github.com/repos/<owner>/<repo>`, so a 404 on a private repo would otherwise ship
 * the repo name verbatim while the message beside it is redacted.
 *
 * Every field is type-checked rather than truth-checked: for a redactor, a throw part-way through
 * ships a half-redacted event, so failing open is the one failure mode it must not have.
 */
export function beforeSend(event: DatadogErrorEvent) {
	const view = event.view;
	if (view) {
		if (typeof view.url === 'string') {
			view.url = redactSensitiveParams(view.url);
		}
		if (typeof view.referrer === 'string') {
			view.referrer = redactSensitiveParams(view.referrer);
		}
	}
	if (typeof event.resource?.url === 'string') {
		event.resource.url = redactSensitiveParams(event.resource.url);
	}
	try {
		if (!shouldKeepEvent(event)) {
			return false;
		}
		const error = event.error;
		if (error) {
			if (typeof error.message === 'string') {
				error.message = redactErrorAndParams(error.message);
			}
			if (typeof error.stack === 'string') {
				error.stack = redactErrorAndParams(error.stack);
			}
			if (typeof error.handling_stack === 'string') {
				error.handling_stack = redactErrorAndParams(error.handling_stack);
			}
			if (typeof error.resource?.url === 'string') {
				error.resource.url = redactErrorAndParams(error.resource.url);
			}
		}
	} catch {
		// Drop rather than ship half-redacted text. The SDK would otherwise swallow the throw and
		// send the event anyway; `false` is honoured for every type but view, whose URL fields are
		// already clean by this point.
		return false;
	}
	return true;
}

/**
 * `redactErrorText` leaves Harper-host paths whole, so the credential params need their own pass
 * after it. Only that pass: the address-token pass is for URL fields, and would take the host out of
 * the `git@github.com:<redacted>` that `redactErrorText` deliberately keeps.
 */
function redactErrorAndParams(text: string) {
	return redactCredentialParams(redactErrorText(text));
}
