import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { forgetPendingPresetSetup } from '@/features/clusters/presets/pendingPresetSetup';
import { markDeploy } from '@/features/clusters/presets/presetDeployMarks';
import {
	PresetInstallUnconfirmedError,
	presetSetupSteps,
	PresetSetupUnsupportedError,
	runPresetSetup,
	setupHoldsAcrossTabs,
	SetupStep,
} from '@/features/clusters/presets/runPresetSetup';
import { useClusterPreset } from '@/features/clusters/presets/usePresetSetup';
import { useSupportsDeploymentSSE } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import type { StudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import type { Cluster } from '@/integrations/api/api.patch';
import { getStudioConfigurationQueryOptions } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useRouteContext } from '@tanstack/react-router';
import { CircleCheckIcon, CircleIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `/<org>/<cluster>/setup`: finishes a preset cluster once its admin is signed in — installs the
 * preset's components, focuses Studio on the job, then lands on the preset's page. Starts by itself on
 * a cluster with no Studio settings of its own; one that has some waits for a click, since setup merges
 * into them. A browser whose tabs cannot wait for each other's setup doesn't run it at all. A failure
 * stops it with Retry, which is safe because every step is idempotent.
 */
export function PresetSetup() {
	const params: { organizationId?: string; clusterId?: string } = useParams({ strict: false });
	const { cluster }: { cluster?: Cluster } = useRouteContext({ strict: false });
	const preset = useClusterPreset(cluster ?? (params.clusterId ? { id: params.clusterId } : undefined));
	const canManage = useInstanceManagePermission();
	const instanceParams = useInstanceClientIdParams();
	const useSSE = useSupportsDeploymentSSE();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const configuration = useQuery(getStudioConfigurationQueryOptions({ ...instanceParams, enabled: !!preset }));
	const acrossTabs = setupHoldsAcrossTabs();
	const startsByItself = acrossTabs && !!configuration.data && !configuration.data.unavailable
		&& !hasSettings(configuration.data);

	const [steps, setSteps] = useState<SetupStep[]>(() => preset ? presetSetupSteps(preset) : []);
	const [running, setRunning] = useState(false);
	const [failed, setFailed] = useState(false);
	// The project whose install may have started; only an explicit "Install again" sends it once more.
	const [unconfirmed, setUnconfirmed] = useState<string>();
	const [attempted, setAttempted] = useState(false);
	const started = useRef(false);
	const mounted = useRef(false);
	const controller = useRef<AbortController>(undefined);
	const start = buildAbsoluteLinkToPage(params, 'start');

	// Leaving the page stops the setup before its next step. The abort waits a microtask because
	// StrictMode unmounts and remounts in the same commit, which must not stop the run it started.
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			queueMicrotask(() => {
				if (!mounted.current) {
					controller.current?.abort();
				}
			});
		};
	}, []);

	const run = useCallback(async () => {
		if (!preset || !params.clusterId) {
			return;
		}
		controller.current = new AbortController();
		const { signal } = controller.current;
		setRunning(true);
		setAttempted(true);
		setFailed(false);
		setUnconfirmed(undefined);
		setSteps(presetSetupSteps(preset));
		try {
			await runPresetSetup({
				...instanceParams,
				preset,
				useSSE,
				signal,
				onStep: (id, state, detail) =>
					setSteps((current) => current.map((step) => step.id === id ? { ...step, state, detail } : step)),
			});
			forgetPendingPresetSetup(params.clusterId);
			// The nav, the landing page and the Applications tree all just changed under this tab.
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, 'get_studio_configuration'] }),
				queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, 'get_components'] }),
			]);
			if (mounted.current) {
				await navigate({ to: start, replace: true });
			}
		} catch (error) {
			if (!signal.aborted) {
				setFailed(true);
				setUnconfirmed(error instanceof PresetInstallUnconfirmedError ? error.project : undefined);
			}
		} finally {
			setRunning(false);
		}
	}, [preset, params.clusterId, instanceParams, useSSE, queryClient, navigate, start]);

	// Once per visit; StrictMode's double effect must not deploy twice.
	useEffect(() => {
		if (canManage && preset && startsByItself && !started.current) {
			started.current = true;
			void run();
		}
	}, [canManage, preset, startsByItself, run]);
	const awaitingClick = canManage && acrossTabs && !attempted && !configuration.isPending && !startsByItself;

	if (!preset) {
		return <Navigate to={start} replace />;
	}

	return (
		<div className="flex justify-center px-4 py-12">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ExtensionIcon name={preset.icon} className="size-5 text-primary dark:text-white" />
						Setting up {preset.name}
					</CardTitle>
					<CardDescription>{preset.description}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					{!canManage
						? (
							<p className="text-sm text-muted-foreground">
								Only a super user can finish setting up this cluster. Sign in as its admin to continue.
							</p>
						)
						: (
							<>
								{!acrossTabs && (
									<p className="text-sm text-muted-foreground">{new PresetSetupUnsupportedError().message}</p>
								)}
								{awaitingClick && (
									<p className="text-sm text-muted-foreground">
										{describeMerge(preset.name, configuration.data)}
									</p>
								)}
								<ol className="grid gap-3">
									{steps.map((step) => (
										<li key={step.id} className="flex items-start gap-3 text-sm">
											<StepIcon state={step.state} />
											<div>
												<div className={step.state === 'pending' ? 'text-muted-foreground' : undefined}>
													{step.label}
												</div>
												{step.detail && (
													<div
														className={step.state === 'failed'
															? 'text-destructive text-xs'
															: 'text-muted-foreground text-xs'}
													>
														{step.detail}
													</div>
												)}
											</div>
										</li>
									))}
								</ol>
							</>
						)}
					<div className="flex justify-end gap-2">
						{/* Skipping keeps the record, so the cluster's home can offer to finish later. */}
						<Button variant="ghost" disabled={running} onClick={() => void navigate({ to: start })}>
							{failed ? 'Skip for now' : 'Skip'}
						</Button>
						{failed && unconfirmed && (
							<Button
								variant="defaultOutline"
								onClick={() => {
									// Partial, not cleared: once it is listed, its latest deploy record decides whether to skip,
									// stop or deploy it again, rather than the mark alone.
									markDeploy(instanceParams.entityId, unconfirmed, 'partial');
									void run();
								}}
							>
								Install again
							</Button>
						)}
						{failed && <Button variant="submit" onClick={() => void run()}>Retry</Button>}
						{awaitingClick && (
							<Button
								variant="submit"
								onClick={() => {
									started.current = true;
									void run();
								}}
							>
								Set up {preset.name}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

/** A landing or any tab placement: what setup would otherwise write over. */
function hasSettings(configuration: StudioConfiguration): boolean {
	return !!configuration.landing || Object.keys(configuration.navigation).length > 0;
}

function describeMerge(name: string, configuration: StudioConfiguration | undefined): string {
	if (!configuration || configuration.unavailable) {
		return `Studio could not read this cluster's settings, so setup waits for you. `
			+ `It installs ${name}'s components, then adds its Studio settings.`;
	}
	if (!hasSettings(configuration)) {
		return `Setup installs ${name}'s components, then opens the cluster on ${name}.`;
	}
	const landing = configuration.landing
		? `keeps the cluster's landing page (${configuration.landing})`
		: `opens the cluster on ${name}`;
	return `This cluster already has Studio settings, so setup waits for you. It installs ${name}'s components, `
		+ `places only the tabs the cluster has not placed itself, and ${landing}.`;
}

function StepIcon({ state }: { state: SetupStep['state'] }) {
	switch (state) {
		case 'running':
			return <LoaderCircleIcon className="size-4 mt-0.5 animate-spin text-primary" aria-label="In progress" />;
		case 'done':
			return <CircleCheckIcon className="size-4 mt-0.5 text-green-600" aria-label="Done" />;
		case 'failed':
			return <CircleXIcon className="size-4 mt-0.5 text-destructive" aria-label="Failed" />;
		default:
			return <CircleIcon className="size-4 mt-0.5 text-muted-foreground" aria-label="Waiting" />;
	}
}
