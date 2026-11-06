import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { useDeploymentStream } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import {
	privateCopyError,
	privateCopyFromSetting,
	privateCopyToPayloadSetting,
	privateCopyToSetting,
	PrivateCopyValue,
} from '@/features/instance/applications/components/PrivateDatabaseCopy/privateCopyValue';
import { PrivateDatabaseCopyField } from '@/features/instance/applications/components/PrivateDatabaseCopy/PrivateDatabaseCopyField';
import {
	hasEditorFileContentAtOrUnder,
	useEditorFileContentId,
} from '@/features/instance/applications/context/editorFileContent';
import {
	invalidateApplicationConfiguration,
	readApplicationSetting,
	useApplicationBranchedDatabases,
	useApplicationEntryHasPackage,
} from '@/features/instance/applications/hooks/useBranchedDatabases';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { measureProjectPackage, packageCaution } from '@/features/instance/applications/lib/projectPackageSize';
import { BranchedDatabases } from '@/integrations/api/instance/applications/branchedDatabases';
import {
	PackagingError,
	useDeployApplicationFilesMutation,
} from '@/integrations/api/instance/applications/deployComponent';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { humanFileSize } from '@/lib/humanFileSize';
import { describeError } from '@/react-query/queryClient';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { DatabaseIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { deployNotes, reportDeployFailure, reportDeployOutcome } from './reportDeployHealth';

function asRead(setting: BranchedDatabases): BranchedDatabases | undefined {
	return setting === true || setting.length ? setting : undefined;
}

function sameSetting(a: BranchedDatabases | undefined, b: BranchedDatabases | undefined): boolean {
	if (a === true || b === true || a === undefined || b === undefined) {
		return a === b;
	}
	return a.length === b.length && a.every(name => b.includes(name));
}

type Phase = 'form' | 'packaging' | 'deploying';

/**
 * The private database copy setting for an application that isn't package-deployed. Harper takes it for such an
 * application only on a payload deploy, so saving packages the application's files and deploys them again:
 * applications/DESIGN.md, "Private database copies".
 */
export function ApplicationPrivateCopyModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowApplicationPrivateCopyModal', false);

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();

	const { openedEntry, rootEntries, isSavingAnyFile } = useEditorView();
	const project = openedEntry?.project;
	const editorContentId = useEditorFileContentId();
	// Any file of the application, not just the open one: the dialog opens with the application's root selected.
	const hasUnsavedEdits = () =>
		!!editorContentId && !!project && hasEditorFileContentAtOrUnder(editorContentId, project);

	const current = useApplicationBranchedDatabases(isModalOpen ? project : undefined);
	const hasPackage = useApplicationEntryHasPackage(isModalOpen ? project : undefined);
	const direct = !!instanceParams.entityId && authStore.isDirectConnection(instanceParams.entityId);

	const mutationKey = useMemo(() => ['deploy_application_files', instanceParams.entityId, project] as const, [
		instanceParams.entityId,
		project,
	]);
	const { mutateAsync: deployFiles } = useDeployApplicationFilesMutation(mutationKey);
	const running = useIsMutating({ mutationKey }) > 0;

	const methods = useForm<{ privateCopy: PrivateCopyValue }>({
		defaultValues: { privateCopy: privateCopyFromSetting(current.setting) },
	});
	const { control, handleSubmit, reset, setValue, watch } = methods;
	const choice = watch('privateCopy');
	const choiceTouched = useRef(false);
	// `running` arrives a render after the mutation starts, too late for a second submit in the same tick.
	const submitting = useRef(new Set<string>());
	const [includeNodeModules, setIncludeNodeModules] = useState(false);
	const measured = useMemo(() => (isModalOpen ? measureProjectPackage(rootEntries, project) : undefined), [
		isModalOpen,
		rootEntries,
		project,
	]);
	const sizeCaution = isModalOpen ? packageCaution(measured, includeNodeModules) : undefined;
	const [phase, setPhase] = useState<Phase>('form');
	const [packagingFailure, setPackagingFailure] = useState<string>();
	const attemptOnScreen = useRef<symbol>(undefined);
	useEffect(() => () => {
		attemptOnScreen.current = undefined;
	}, []);

	// Another tab, the CLI or a colleague may have changed the setting since this tab last read it.
	useEffect(() => {
		if (isModalOpen) {
			void invalidateApplicationConfiguration(queryClient, instanceParams.entityId);
		}
	}, [isModalOpen, queryClient, instanceParams.entityId]);
	// A new target: an attempt still running for the last one reports through toasts.
	useEffect(() => {
		choiceTouched.current = false;
		attemptOnScreen.current = undefined;
		setIncludeNodeModules(false);
		setPackagingFailure(undefined);
		setPhase('form');
	}, [instanceParams.entityId, project]);
	useEffect(() => {
		if (isModalOpen && !choiceTouched.current) {
			setValue('privateCopy', privateCopyFromSetting(current.setting));
		}
	}, [isModalOpen, instanceParams.entityId, project, setValue, current.setting]);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowApplicationPrivateCopyModal', false);
		attemptToRestoreFocus(trigger);
		attemptOnScreen.current = undefined;
		choiceTouched.current = false;
		reset();
		setIncludeNodeModules(false);
		setPhase('form');
		setPackagingFailure(undefined);
		stream.reset();
	}, [trigger, reset, stream]);

	const changed = !sameSetting(privateCopyToSetting(choice), current.setting);
	const blocker = !isModalOpen
		? undefined
		: !direct
		? 'proxy'
		: hasPackage
		? 'package'
		: isSavingAnyFile || hasUnsavedEdits()
		? 'unsaved'
		: undefined;
	const canSave = !!project && !blocker && !running && current.known && !current.loading && changed;

	const readSettingBack = useCallback(
		async () => (project ? readApplicationSetting(queryClient, instanceParams, project) : 'unknown' as const),
		[queryClient, instanceParams, project],
	);

	const invalidateComponents = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'get_components'],
			refetchType: 'active',
		});
	}, [queryClient, instanceParams.entityId]);

	const save = async ({ privateCopy: choice }: { privateCopy: PrivateCopyValue }) => {
		const attemptKey = `${instanceParams.entityId}:${project}`;
		if (!canSave || !project || submitting.current.has(attemptKey) || hasUnsavedEdits()) {
			return;
		}
		submitting.current.add(attemptKey);
		const sent = privateCopyToPayloadSetting(choice);
		const wanted = asRead(sent);
		const attempt = Symbol(project);
		const isOnScreen = () => attemptOnScreen.current === attempt;
		attemptOnScreen.current = attempt;
		stream.reset();
		setPackagingFailure(undefined);
		setPhase('packaging');

		try {
			const result = await deployFiles({
				project,
				branchedDatabases: sent,
				skipNodeModules: !includeNodeModules,
				onPackaged: () => {
					if (isOnScreen()) {
						setPhase('deploying');
						stream.markStarted();
					}
				},
				onEvent: event => {
					if (isOnScreen()) {
						stream.onEvent(event);
					}
				},
				...instanceParams,
			});
			invalidateComponents();
			const readBack = await readSettingBack();
			const action = recordAction(result?.deployment_id);
			if (readBack === 'unknown') {
				if (isOnScreen()) {
					stream.markSettled('inconclusive', undefined, { result });
				}
				toast.warning(`Couldn't confirm ${project}'s private database copy setting`, {
					description: `${project} was redeployed, but Studio couldn't read its setting back.`,
					action,
				});
				return;
			}
			if (!sameSetting(readBack, wanted)) {
				if (isOnScreen()) {
					stream.markSettled('error', 'Harper reports a different setting than the one saved.', { result });
				}
				toast.warning(`${project} was redeployed, but its private database copy setting didn't change`, {
					description: 'Harper reports a different setting than the one saved. Check the deployment record.',
					action,
				});
				return;
			}
			const followed = result?.rollout?.state !== 'unfollowable';
			if (isOnScreen()) {
				stream.markSettled(followed ? 'success' : 'inconclusive', undefined, { result });
			}
			await reportDeployOutcome(project, result, runHealthCheck, { action });
			if (isOnScreen() && followed && !deployNotes(result).warn) {
				closeModal();
			}
		} catch (error) {
			if (error instanceof PackagingError) {
				if (isOnScreen()) {
					setPhase('form');
					setPackagingFailure(error.message);
				} else {
					toast.error(`Couldn't package ${project}`, { description: error.message });
				}
				return;
			}
			invalidateComponents();
			if (error instanceof SSEInconclusiveError) {
				if (isOnScreen()) {
					stream.markSettled('inconclusive');
				}
				const readBack = await readSettingBack();
				void invalidateApplicationConfiguration(queryClient, instanceParams.entityId, { refetch: false });
				toast.warning(
					readBack !== 'unknown' && sameSetting(readBack, wanted)
						? `${project}'s private database copy setting changed, but its deploy didn't report back`
						: `${project} may not have been redeployed`,
					{ description: 'Live updates ended before the deploy finished. Check Deployments for its record.' },
				);
				return;
			}
			void invalidateApplicationConfiguration(queryClient, instanceParams.entityId);
			if (isOnScreen()) {
				const rolloutFailed = error instanceof DeployRolloutError;
				stream.markSettled('error', rolloutFailed ? undefined : describeError(error).message, { failure: error });
				return;
			}
			reportDeployFailure(project, error, 'redeploy', {
				action: recordAction(deployFailureDetails(error).deploymentId),
			});
		} finally {
			submitting.current.delete(attemptKey);
		}
	};

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-popover-foreground">
				<DialogHeader>
					<DialogTitle>Private Database Copy</DialogTitle>
					<DialogDescription>
						{phase === 'form'
							? `Choose whether ${project ?? 'this application'} runs on its own copy of its data.`
							: `Redeploying ${project ?? 'the application'}…`}
					</DialogDescription>
				</DialogHeader>

				{phase === 'form'
					? (
						<Form {...methods}>
							<form className="flex flex-col w-full gap-4" onSubmit={handleSubmit(save)}>
								<FormField
									control={control}
									name="privateCopy"
									rules={{ validate: value => privateCopyError(value) ?? true }}
									render={({ field }) => (
										<PrivateDatabaseCopyField
											idPrefix="application-private-copy"
											value={field.value}
											onChange={value => {
												choiceTouched.current = true;
												field.onChange(value);
											}}
										/>
									)}
								/>
								<div className="flex flex-row items-start gap-3">
									<Switch
										id="application-private-copy-node-modules"
										checked={includeNodeModules}
										onCheckedChange={setIncludeNodeModules}
									/>
									<div className="flex flex-col gap-1">
										<Label htmlFor="application-private-copy-node-modules">Include node_modules</Label>
										<p className="text-sm text-muted-foreground">
											Send the installed dependencies, so the nodes don&apos;t install them again.
										</p>
									</div>
								</div>
								<p className="text-sm text-muted-foreground">
									Saving packages{' '}
									{project}&apos;s files as they are on the server now and deploys them again with this setting. They
									replace the application&apos;s files on every node, so a change saved anywhere else while this runs is
									lost. {includeNodeModules
										? 'Every node then restarts the application.'
										: 'Every node then installs its dependencies and restarts the application.'}
								</p>
								{sizeCaution && (
									<p className="text-sm text-warning">
										{sizeCaution === 'unmeasured'
											? `Studio can't tell how large ${project}'s archive is.`
											: includeNodeModules || !measured
											? `With node_modules, ${project}'s archive can be large.`
											: `${project} is about ${humanFileSize(measured.bytes)}.`}{' '}
										The browser holds the whole archive while it uploads, which can take several minutes.
									</p>
								)}
								{blocker === 'proxy' && (
									<p role="alert" className="text-sm text-warning">
										Saving uploads the application&apos;s files, which Studio does only over a direct connection. Switch
										to direct sign-in from the cluster&apos;s page, then try again.
									</p>
								)}
								{blocker === 'package' && (
									<p role="alert" className="text-sm text-warning">
										{project} is deployed from a package. Change its private copy from Redeploy Package.
									</p>
								)}
								{blocker === 'unsaved' && (
									<p role="alert" className="text-sm text-warning">
										Save or revert your changes to{' '}
										{project}&apos;s files first, so the files Studio packages are the ones you mean.
									</p>
								)}
								{current.failed && (
									<p role="alert" className="text-sm text-warning">
										Studio couldn&apos;t read this application&apos;s current setting.{' '}
										<Button type="button" variant="link" className="h-auto p-0" onClick={current.retry}>
											Try again
										</Button>
									</p>
								)}
								{running && (
									<p role="status" className="text-sm text-muted-foreground">
										The last save for {project} is still running. Its result shows when it finishes.
									</p>
								)}
								{packagingFailure && (
									<p role="alert" className="text-sm text-destructive">
										Studio couldn&apos;t package {project}, so nothing was deployed: {packagingFailure}
									</p>
								)}
								<Button variant="positiveOutline" type="submit" className="w-full" disabled={!canSave}>
									<DatabaseIcon /> Save and Redeploy
								</Button>
								<Button type="button" variant="ghostOutline" className="w-full" onClick={closeModal}>
									Cancel
								</Button>
							</form>
						</Form>
					)
					: (
						<div className="flex flex-col gap-4">
							{phase === 'packaging'
								? <p className="text-sm text-muted-foreground">Packaging {project}…</p>
								: <DeployProgress state={stream.state} onNavigateAway={closeModal} />}
							<Button type="button" variant="ghostOutline" className="w-full" onClick={closeModal}>
								Close
							</Button>
						</div>
					)}
			</DialogContent>
		</Dialog>
	);
}
