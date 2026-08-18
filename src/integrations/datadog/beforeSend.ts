import { redactEmailParams } from './redactEmailParams';
import { redactErrorText } from './redactErrorText';
import { DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

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
 * The view URL is redacted separately, via `redactEmailParams`, and for *every* event type rather
 * than just errors: the auth screens keep a visitor's e-mail address in `?me=`/`?email=` for form
 * persistence, and the SDK reads `view.url`/`view.referrer` straight from `window.location`, so a
 * view or resource event on those screens ships the address even though no error was involved.
 * `redactErrorText` can't cover it — it deliberately keeps the path for Harper-owned hosts, which
 * is exactly what the auth routes are. Both fields are on the browser SDK's shared
 * modifiable-field allowlist, so they are editable here for all event types.
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
		if (error.resource?.url) {
			error.resource.url = redactErrorText(error.resource.url);
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
	return true;
}
