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
 *
 * That same Harper-host exemption means the error text fields need both redactions, not just
 * `redactErrorText`: an error raised on an auth screen whose message or stack quotes the page URL
 * would keep `?me=<address>` intact, because the host is ours. No error in the last 30 days
 * actually carried one, so this is defence in depth rather than an observed leak — but it costs a
 * regex pass and the failure mode is a customer's address in Error Tracking.
 */
/**
 * Both redactions, in the order they have to run: `redactErrorText` reduces every non-Harper URL to
 * host + `<redacted>`, then `redactEmailParams` takes the form-persistence params out of the
 * Harper-host URLs it deliberately left whole.
 */
function redactErrorAndEmails(text: string) {
	return redactEmailParams(redactErrorText(text));
}

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
	return true;
}
