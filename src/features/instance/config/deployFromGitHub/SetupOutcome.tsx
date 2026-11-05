import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	CiDeploySetupError,
	CiDeploySetupResult,
	ciDeploySetupUnanswered,
} from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { describeError } from '@/react-query/queryClient';
import { TriangleAlertIcon } from 'lucide-react';

export type SetupOutcomeState = { result: CiDeploySetupResult } | { error: unknown };

const sentence = (created: string[]) => `Created ${created.join(', ')}.`;

export function SetupOutcome({ outcome }: { outcome: SetupOutcomeState }) {
	if ('result' in outcome) {
		const { created, warning } = outcome.result;
		return (
			<>
				<Alert>
					<AlertTitle>Deploys from GitHub are set up</AlertTitle>
					<AlertDescription>
						{created.length > 0 ? sentence(created) : 'Everything already matched, so nothing was changed.'}
					</AlertDescription>
				</Alert>
				{warning && (
					<Alert variant="warning">
						<TriangleAlertIcon />
						<AlertDescription>{warning}</AlertDescription>
					</Alert>
				)}
			</>
		);
	}

	const { error } = outcome;
	const setupError = error instanceof CiDeploySetupError ? error : undefined;
	const created = setupError?.created ?? [];
	const title = ciDeploySetupUnanswered(error)
		? OUTCOME_UNKNOWN_TITLE
		: setupError?.kind === 'unverified'
		? "The trust policy didn't verify"
		: created.length === 0 && setupError?.kind === 'refused'
		? 'Nothing was changed'
		: 'Setup stopped';
	const problems = setupError && setupError.kind !== 'failed'
		? setupError.problems
		: [
			ciDeploySetupUnanswered(error)
				? "Harper didn't answer, so the last step may have gone through."
				: describeError(setupError?.cause ?? error).message,
		];
	return (
		<Alert variant="destructive">
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>
				<ul className="list-disc whitespace-pre-wrap pl-4">
					{problems.map((problem) => <li key={problem}>{problem}</li>)}
				</ul>
				{created.length > 0 && <p className="mt-2">{sentence(created)}</p>}
				{(!setupError || setupError.kind === 'failed') && (
					<p className="mt-2">Setting up again checks what is there and creates only what is still missing.</p>
				)}
			</AlertDescription>
		</Alert>
	);
}
