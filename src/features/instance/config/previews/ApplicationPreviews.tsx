import { Loading } from '@/components/Loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import {
	DisablePreviewsResponse,
	previewPolicyQueryOptions,
	previewSetupState,
	useDisablePreviews,
} from '@/integrations/api/instance/previews/previews';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { describeError, shouldToastOwnFailure } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { DisablePreviewsDialog, DisablePreviewsResult } from './DisablePreviews';
import { EnablePreviewsForm } from './EnablePreviewsForm';
import { LivePreviews } from './LivePreviews';
import { PageNotice } from './PageNotice';
import { PreviewCredential, usePreviewCredentialState } from './PreviewCredential';
import { PreviewPolicyStatus } from './PreviewPolicyStatus';
import { PreviewWarnings } from './PreviewWarnings';
import { PreviewWorkflowInstructions } from './PreviewWorkflowInstructions';

type DisableOutcome = { response: DisablePreviewsResponse } | { failure: string; unanswered: boolean };

const DISABLE_UNANSWERED_MESSAGE =
	"Harper didn't answer, so it may still be working. The status below shows how far it "
	+ 'has got, and running disable again resumes it.';

export function ApplicationPreviews(
	{ app, tree, treeFailed }: { app: string; tree: APIDirectoryEntry | undefined; treeFailed: boolean },
) {
	const instanceParams = useInstanceClientIdParams();
	const { entityId, instanceClient } = instanceParams;
	const queryClient = useQueryClient();
	const policyQuery = previewPolicyQueryOptions({ ...instanceParams, app });
	const { data: policy, isError, refetch } = useQuery(policyQuery);
	const { mutateAsync: disablePreviews, isPending: isDisabling } = useDisablePreviews();
	// Only once previews exist: a failed read on an application that has none would toast about nothing.
	const credential = usePreviewCredentialState(app, !!policy && previewSetupState(policy) !== 'off');
	const [showEnableForm, setShowEnableForm] = useState(false);
	const [confirmingDisable, setConfirmingDisable] = useState(false);
	const [disableOutcome, setDisableOutcome] = useState<DisableOutcome>();

	// Only before the first answer: a refetch that fails later must not take the page, and its rerun, away.
	if (!policy) {
		return isError
			? <PageNotice>The preview policy of {app} could not be loaded.</PageNotice>
			: <Loading text="Loading..." />;
	}

	const state = previewSetupState(policy);

	const onDisableConfirmed = async () => {
		setConfirmingDisable(false);
		setDisableOutcome(undefined);
		try {
			const response = await disablePreviews({ instanceClient, app });
			setDisableOutcome({ response });
			// The records are gone whether or not the read below answers, and the page must not say otherwise.
			queryClient.setQueryData(policyQuery.queryKey, {
				...policy,
				enabled: false,
				grant: null,
				operations: null,
				trust: [],
				problems: [],
			});
			toast.success(response.message);
		} catch (error) {
			const unanswered = !shouldToastOwnFailure(error);
			setDisableOutcome({
				failure: unanswered ? DISABLE_UNANSWERED_MESSAGE : describeError(error).message,
				unanswered,
			});
		} finally {
			// Refetched on failure too: a partial disable has revoked the identity, and that is what the page has to show.
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({ queryKey: [entityId, 'get_components'] }),
			]);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<label className="flex w-fit items-center gap-3 text-sm font-medium">
				<Switch
					checked={state !== 'off' || showEnableForm}
					disabled={isDisabling}
					onCheckedChange={(checked) =>
						state === 'off' ? setShowEnableForm(checked) : !checked && setConfirmingDisable(true)}
				/>
				Previews of {app}
			</label>

			{disableOutcome && 'response' in disableOutcome && (
				<DisablePreviewsResult response={disableOutcome.response} credentialStored={credential !== 'none'} />
			)}
			{disableOutcome && 'failure' in disableOutcome && (
				<Alert variant="destructive">
					<AlertTitle>
						{disableOutcome.unanswered ? OUTCOME_UNKNOWN_TITLE : `Previews of ${app} did not finish disabling`}
					</AlertTitle>
					<AlertDescription className="whitespace-pre-wrap">{disableOutcome.failure}</AlertDescription>
					<div className="col-start-2 mt-2">
						<Button
							size="sm"
							variant="destructiveOutline"
							disabled={isDisabling}
							onClick={() => void onDisableConfirmed()}
						>
							Run disable again
						</Button>
					</div>
				</Alert>
			)}

			{state === 'off' && showEnableForm && (
				<>
					<PreviewWarnings />
					<EnablePreviewsForm
						app={app}
						onEnabled={(enabled) => {
							// Enable answers with the policy, so a read failing right after a write that landed can't undo the page.
							queryClient.setQueryData(policyQuery.queryKey, enabled);
							setDisableOutcome(undefined);
							setShowEnableForm(false);
						}}
					/>
				</>
			)}

			{state !== 'off' && (
				<PreviewPolicyStatus
					policy={policy}
					state={state}
					disabling={isDisabling}
					offerDisable={!(disableOutcome && 'failure' in disableOutcome)}
					onDisableClick={() => setConfirmingDisable(true)}
				/>
			)}

			{state === 'on' && (
				<>
					<PreviewWarnings shared={policy.grant?.constraints?.branchedDatabases !== 'required'} />
					{policy.repository && <PreviewCredential app={app} repository={policy.repository} />}
					<PreviewWorkflowInstructions policy={policy} credentialSealed={credential === 'sealed'} />
				</>
			)}

			<LivePreviews app={app} tree={tree} treeFailed={treeFailed} previewsOn={state === 'on'} />

			<DisablePreviewsDialog
				app={app}
				open={confirmingDisable}
				onOpenChange={setConfirmingDisable}
				onConfirm={() => void onDisableConfirmed()}
			/>
		</div>
	);
}
