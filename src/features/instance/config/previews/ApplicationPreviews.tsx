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
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { DisablePreviewsDialog, DisablePreviewsResult } from './DisablePreviews';
import { EnablePreviewsForm } from './EnablePreviewsForm';
import { LivePreviews } from './LivePreviews';
import { PageNotice } from './PageNotice';
import { PreviewCredential, usePreviewCredentialSealed } from './PreviewCredential';
import { PreviewPolicyStatus } from './PreviewPolicyStatus';
import { PreviewWarnings } from './PreviewWarnings';
import { PreviewWorkflowInstructions } from './PreviewWorkflowInstructions';

type DisableOutcome = { response: DisablePreviewsResponse } | { failure: string };

export function ApplicationPreviews({ app, tree }: { app: string; tree: APIDirectoryEntry | undefined }) {
	const instanceParams = useInstanceClientIdParams();
	const { entityId, instanceClient } = instanceParams;
	const queryClient = useQueryClient();
	const { data: policy, isError, refetch } = useQuery(previewPolicyQueryOptions({ ...instanceParams, app }));
	const { mutateAsync: disablePreviews, isPending: isDisabling } = useDisablePreviews();
	const credentialSealed = usePreviewCredentialSealed(app);
	const [showEnableForm, setShowEnableForm] = useState(false);
	const [confirmingDisable, setConfirmingDisable] = useState(false);
	const [disableOutcome, setDisableOutcome] = useState<DisableOutcome>();

	if (isError) {
		return <PageNotice>The preview policy of {app} could not be loaded.</PageNotice>;
	}
	if (!policy) {
		return <Loading text="Loading..." />;
	}

	const state = previewSetupState(policy);

	const onDisableConfirmed = async () => {
		setConfirmingDisable(false);
		setDisableOutcome(undefined);
		try {
			const response = await disablePreviews({ instanceClient, app });
			setDisableOutcome({ response });
			toast.success(response.message);
		} catch (error) {
			setDisableOutcome({ failure: describeError(error).message });
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
				<DisablePreviewsResult response={disableOutcome.response} credentialSealed={credentialSealed} />
			)}
			{disableOutcome && 'failure' in disableOutcome && (
				<Alert variant="destructive">
					<AlertTitle>Previews of {app} did not finish disabling</AlertTitle>
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
						onEnabled={async () => {
							setShowEnableForm(false);
							setDisableOutcome(undefined);
							await refetch();
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
					<PreviewWorkflowInstructions policy={policy} credentialSealed={credentialSealed} />
				</>
			)}

			<LivePreviews app={app} tree={tree} previewsOn={state === 'on'} />

			<DisablePreviewsDialog
				app={app}
				open={confirmingDisable}
				onOpenChange={setConfirmingDisable}
				onConfirm={() => void onDisableConfirmed()}
			/>
		</div>
	);
}
