import { SSEOperationError } from '@/integrations/api/sse/errors';
import { errorText } from '@/lib/errorText';
import { AxiosError, isAxiosError } from 'axios';

/**
 * Harper reads a git deploy's root `package.json` without checking that it exists (harper
 * `components/Application.ts`, `packGitReferenceWithoutScripts`, through v5.3.2), so a repository
 * without one fails with Node's raw ENOENT naming the node's temporary clone directory: a path the
 * user cannot see, deleted moments later, that names neither the problem nor the fix. Needed until
 * no Harper version Studio supports reports it raw (HarperFast/harper#3142). Only the deploy itself
 * fails this way: the `restart_service` job a rolling deploy hands off to (harper
 * `components/operations.js`) restarts or activates a release every node already built, and clones
 * nothing, so a `DeployRolloutError` never carries it.
 */
// `[/\\]+` because the activity log renders event data as JSON, which doubles a Windows separator.
const MISSING_ROOT_PACKAGE_JSON = /\bENOENT\b.*\bharper-git-clone-[^/\\\s]*[/\\]+package\.json\b/s;

export const MISSING_ROOT_PACKAGE_JSON_MESSAGE = 'This repository has no package.json in its root folder. '
	+ 'Harper deploys a git repository as an npm package, which needs one there, '
	+ 'so add a package.json to the root of the repository and deploy again.';

type DeployFailureBody = { error?: unknown; message?: unknown; title?: unknown; detail?: unknown } | string;

function withoutFailureText(body: Exclude<DeployFailureBody, string>): Exclude<DeployFailureBody, string> {
	const { message: _message, title: _title, detail: _detail, ...kept } = body;
	return kept;
}

export function explainDeployFailureText(text: string): string {
	return MISSING_ROOT_PACKAGE_JSON.test(text) ? MISSING_ROOT_PACKAGE_JSON_MESSAGE : text;
}

/** Each error keeps its type: `redactRelayedMessage` keys on `SSEOperationError`'s. */
export function explainDeployFailure(error: unknown): unknown {
	if (error instanceof SSEOperationError) {
		const message = explainDeployFailureText(error.message);
		return message === error.message
			? error
			: new SSEOperationError(message, {
				code: error.code,
				phase: error.phase,
				deploymentId: error.deploymentId,
				certification: error.certification,
			});
	}
	if (isAxiosError<DeployFailureBody>(error) && error.response) {
		const { data } = error.response;
		const texts = typeof data === 'string'
			? [data]
			: [data?.error, data?.message, data?.title, data?.detail].map((field) => errorText(field));
		if (texts.some((text) => text !== undefined && MISSING_ROOT_PACKAGE_JSON.test(text))) {
			const explained: DeployFailureBody = typeof data === 'string'
				? MISSING_ROOT_PACKAGE_JSON_MESSAGE
				: { ...withoutFailureText(data), error: MISSING_ROOT_PACKAGE_JSON_MESSAGE };
			return new AxiosError(MISSING_ROOT_PACKAGE_JSON_MESSAGE, error.code, error.config, error.request, {
				...error.response,
				data: explained,
			});
		}
	}
	return error;
}
