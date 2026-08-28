import { redactErrorText } from './redactErrorText';
import { redactRelayedMessage, redactRelayedStack } from './redactRelayedMessage';
import { redactCredentialParams, redactSensitiveParams } from './redactSensitiveParams';
import { type DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

/**
 * URL fields are redacted before `shouldKeepEvent` and error text after it. The filter attributes on
 * the raw stack and raw `error.resource.url`, so those can't be rewritten first; it reads no URL
 * field, and it can throw on a malformed one — which `catchUserErrors` swallows into sending the
 * event. Dropped events paying for their URL redaction is the cost of the order that doesn't leak.
 *
 * A throw means the SDK sends the event, so `false` is the only safe answer — honoured for every type
 * but view, which can't be dismissed here, hence its URLs being clean before anything else can fail.
 */
export function beforeSend(event: DatadogErrorEvent) {
	try {
		const view = event.view;
		if (view) {
			// Not redundant with `translateUrlForDatadog`: it parameterises a path segment by string
			// match, and TanStack hands back a *decoded* param while the href holds the encoded form,
			// so `/someone%40acme-corp.com/` never matches `/someone@acme-corp.com/` and the address
			// survives into the name. This guard is the only thing between that path and Datadog.
			if (typeof view.name === 'string') {
				view.name = redactSensitiveParams(view.name);
			}
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
		if (!shouldKeepEvent(event)) {
			return false;
		}
		const error = event.error;
		if (error) {
			// The stack quotes the message, so it has to be rewritten against the original.
			const relayedMessage = typeof error.message === 'string' ? error.message : '';
			if (typeof error.message === 'string') {
				error.message = redactErrorAndParams(redactRelayedMessage(error.type, error.message));
			}
			if (typeof error.stack === 'string') {
				error.stack = redactErrorAndParams(redactRelayedStack(error.type, relayedMessage, error.stack));
			}
			if (typeof error.handling_stack === 'string') {
				error.handling_stack = redactErrorAndParams(error.handling_stack);
			}
			if (typeof error.resource?.url === 'string') {
				error.resource.url = redactSensitiveParams(redactErrorText(error.resource.url));
			}
		}
	} catch {
		return false;
	}
	return true;
}

/** Credential params only — `redactErrorText` keeps Harper paths for triage, and the address token
 * would take the host out of the `git@github.com:<redacted>` it leaves. */
function redactErrorAndParams(text: string) {
	return redactCredentialParams(redactErrorText(text));
}
