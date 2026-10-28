import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Loading } from '@/components/Loading';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	describeWafAction,
	describeWafActivation,
	describeWafMatch,
	describeWafProvenance,
} from '@/features/instance/config/waf/describeWafRule';
import { WafRuleDialog, WafRuleDialogTarget } from '@/features/instance/config/waf/WafRuleDialog';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import {
	canBeWatchOnly,
	DEFAULT_WAF_SCORE_THRESHOLD,
	isFabricStarterRule,
	listWafRulesQueryOptions,
	supportsWaf,
	useDropWafRule,
	useSetWafMode,
	useToggleWafRule,
	WafMode,
	WafRule,
	wafRuleDeferrals,
} from '@/integrations/api/instance/waf/waf';
import { stableJson } from '@/lib/stableJson';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';

const DOCS_URL = 'https://docs.harperdb.io/reference/v5/web-application-firewall/overview';

export function ConfigWafIndex() {
	const { entityId } = useInstanceClientIdParams();
	// The router keeps this page mounted across a switch to another instance, and a draft, a pending
	// delete or a chosen mode meant for one must never be sent to the next.
	return <WafPage key={entityId} />;
}

function WafPage() {
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { user } = useInstanceAuth(instanceParams.entityId);
	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const supported = registrationInfo === undefined ? undefined : supportsWaf(registrationInfo.version);
	const { data, isFetching, isError, refetch } = useQuery(
		listWafRulesQueryOptions({ ...instanceParams, enabled: canManage && supported === true }),
	);
	const onRefreshClick = useRefreshClick(refetch);

	const { mutate: toggleRule, isPending: isTogglePending } = useToggleWafRule();
	const { mutate: dropRule, isPending: isDropPending } = useDropWafRule();
	const [dialogTarget, setDialogTarget] = useState<WafRuleDialogTarget>();
	const [dropTarget, setDropTarget] = useState<WafRule>();
	// Held through the refetch too, so a second click never acts on the row the write just replaced.
	const busy = isTogglePending || isDropPending || isFetching;

	const rules = useMemo(
		() =>
			data?.available
				? [...data.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id))
				: undefined,
		[data],
	);

	if (!canManage) {
		// No user yet means auth is still resolving, and a super user would otherwise see the denial flash.
		return user
			? <PageNotice>Only super users can view or change the firewall.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (supported === undefined) {
		return isVersionError
			? <PageNotice>This cluster's Harper version could not be read, so its firewall is not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				The firewall needs Harper 5.2 or later. This cluster runs {registrationInfo?.version}.
			</PageNotice>
		);
	}
	if (data?.available === false) {
		return (
			<PageNotice>
				This cluster's Harper doesn't have the firewall turned on. It ships with Harper Pro, and runs unless{' '}
				<code className="font-mono">waf.enabled</code> is set to false in the Harper config.
			</PageNotice>
		);
	}

	// Per-call callbacks, dropped if the page unmounts, so a write never reports on the next cluster.
	const onAlter = (rule: WafRule, patch: { shadow?: boolean; enabled?: boolean }, success: string) => {
		toggleRule({ ...instanceParams, loaded: rule, patch }, {
			onSuccess: () => toast.success(success),
			onSettled: () => void refetch(),
		});
	};

	const reloadDialogRule = async (id: string) => {
		const result = await refetch();
		// A failed refetch keeps the stale list, which would reopen the same rule; the query toasts the failure.
		if (result.isError) {
			return;
		}
		const rule = result.data?.available ? result.data.rules.find((candidate) => candidate.id === id) : undefined;
		if (!rule) {
			toast.info(`Firewall rule '${id}' no longer exists`);
		}
		// Only the edit that asked: the reader may have closed it, or opened another, while this loaded.
		setDialogTarget((open) =>
			open?.kind === 'edit' && open.rule.id === id ? (rule ? { kind: 'edit', rule } : undefined) : open
		);
	};

	const onDropConfirmed = () => {
		if (!dropTarget) {
			return;
		}
		dropRule({ ...instanceParams, loaded: dropTarget }, {
			onSuccess: () => toast.success(`Deleted firewall rule '${dropTarget.id}'`),
			onSettled: () => {
				setDropTarget(undefined);
				void refetch();
			},
		});
	};

	return (
		<div className="flex flex-col gap-6 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Firewall</h2>
					<p className="text-sm text-muted-foreground">
						The web application firewall checks each request to your applications and REST endpoints before it is
						authenticated, and can block it, log it, or score it. Rules and the mode replicate to every node in the
						cluster. The Operations API isn't covered.
					</p>
					<a
						className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
						href={DOCS_URL}
						target="_blank"
						rel="noreferrer"
					>
						Firewall docs
					</a>
				</div>
				<div className="flex gap-2">
					<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetching}>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">Refresh</span>
					</Button>
					<Button
						variant="submit"
						disabled={rules === undefined}
						onClick={() => setDialogTarget({ kind: 'add', existingIds: new Set(rules?.map((rule) => rule.id)) })}
					>
						<PlusIcon /> Add Rule
					</Button>
				</div>
			</div>

			<WafModeControls />

			<section className="flex flex-col gap-3" aria-label="Firewall rules">
				<h3 className="text-base font-semibold">Rules</h3>
				{isError
					? <PageNotice>The firewall rules could not be loaded.</PageNotice>
					: rules === undefined
					? <Loading text="Loading..." />
					: rules.length === 0
					? <PageNotice>No firewall rules yet. Add one to start filtering requests.</PageNotice>
					: (
						<ul className="flex flex-col gap-3">
							{rules.map((rule) => (
								<WafRuleCard
									key={rule.id}
									rule={rule}
									disabled={busy}
									onSetShadow={(shadow) =>
										onAlter(
											rule,
											{ shadow },
											shadow ? `'${rule.id}' is now watch-only` : `'${rule.id}' is now enforced`,
										)}
									onSetEnabled={(enabled) =>
										onAlter(rule, { enabled }, `${enabled ? 'Enabled' : 'Disabled'} '${rule.id}'`)}
									onEdit={() => setDialogTarget({ kind: 'edit', rule })}
									onDelete={() => setDropTarget(rule)}
								/>
							))}
						</ul>
					)}
			</section>

			{dialogTarget && (
				<WafRuleDialog
					// Content, not id: a reload must remount the form.
					key={dialogTarget.kind === 'edit' ? `edit:${stableJson(dialogTarget.rule)}` : 'add'}
					target={dialogTarget}
					onClose={() => setDialogTarget(undefined)}
					onFailed={() => void refetch()}
					onReload={(id) => void reloadDialogRule(id)}
					onSaved={(id) => {
						toast.success(dialogTarget.kind === 'edit' ? `Saved firewall rule '${id}'` : `Added firewall rule '${id}'`);
						setDialogTarget(undefined);
						void refetch();
					}}
				/>
			)}

			<ConfirmDeletionModal
				typeOfThingBeingDeleted={`firewall rule '${dropTarget?.id ?? ''}'`}
				isModalOpen={dropTarget !== undefined}
				setIsModalOpen={(open) => !open && setDropTarget(undefined)}
				deletionConfirmed={onDropConfirmed}
				deletionPending={isDropPending}
				hideDataLossWarning
			/>
		</div>
	);
}

function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}

function WafRuleStatus({ rule, deferred }: { rule: WafRule; deferred: boolean }) {
	if (rule.enabled === false) {
		return <Badge variant="outline">Disabled</Badge>;
	}
	if (deferred) {
		return <Badge variant="destructive">Not enforced</Badge>;
	}
	if (!canBeWatchOnly(rule)) {
		return <Badge variant="outline">Logs only</Badge>;
	}
	if (rule.shadow === true) {
		return <Badge variant="warning">Watch-only</Badge>;
	}
	return <Badge variant="success">{rule.action === 'score' ? 'Scoring' : 'Blocking'}</Badge>;
}

function WafRuleCard({ rule, disabled, onSetShadow, onSetEnabled, onEdit, onDelete }: {
	rule: WafRule;
	disabled: boolean;
	onSetShadow: (shadow: boolean) => void;
	onSetEnabled: (enabled: boolean) => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const deferrals = wafRuleDeferrals(rule);
	const starter = isFabricStarterRule(rule);
	const provenance = starter ? 'Added by Fabric when the cluster was created' : describeWafProvenance(rule);
	const conditions = describeWafMatch(rule);
	const enabled = rule.enabled !== false;
	const watchOnly = rule.shadow === true;
	const title = typeof rule.description === 'string' && rule.description ? rule.description : rule.id;
	return (
		<li className="flex flex-col gap-3 rounded-md border p-4" aria-label={`Firewall rule ${rule.id}`}>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-semibold">{title}</span>
						<WafRuleStatus rule={rule} deferred={deferrals.length > 0} />
						{starter && (
							<Badge
								variant="secondary"
								title="Fabric added this rule when the cluster was created, as watch-only. Edit or delete it like any other."
							>
								Fabric starter rule
							</Badge>
						)}
					</div>
					{title !== rule.id && <span className="break-all font-mono text-xs text-muted-foreground">{rule.id}</span>}
				</div>
				<div className="flex flex-wrap gap-2">
					{enabled && canBeWatchOnly(rule) && deferrals.length === 0 && (
						<Button
							size="sm"
							variant={watchOnly ? 'positiveOutline' : 'defaultOutline'}
							disabled={disabled}
							onClick={() => onSetShadow(!watchOnly)}
							title={watchOnly
								? `Matching requests will be ${rule.action === 'score' ? 'scored' : 'blocked'}, not just logged.`
								: 'Matching requests will be logged as would-block and let through.'}
						>
							{watchOnly ? (rule.action === 'score' ? 'Start scoring' : 'Start blocking') : 'Watch only'}
						</Button>
					)}
					<Button size="sm" variant="defaultOutline" disabled={disabled} onClick={() => onSetEnabled(!enabled)}>
						{enabled ? 'Disable' : 'Enable'}
					</Button>
					<Button size="sm" variant="defaultOutline" disabled={disabled} onClick={onEdit}>
						Edit
					</Button>
					<Button size="sm" variant="destructiveOutline" disabled={disabled} onClick={onDelete}>
						Delete
					</Button>
				</div>
			</div>
			{deferrals.length > 0 && (
				<p className="text-sm text-destructive">Harper stores this rule but skips it: {deferrals.join(' ')}</p>
			)}
			<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">Matches</dt>
				<dd>
					{conditions.length
						? (
							<ul>
								{conditions.map((condition, index) => (
									<li key={index} className="break-all font-mono text-xs">{condition}</li>
								))}
							</ul>
						)
						: <span className="text-xs">No conditions</span>}
				</dd>
				<dt className="text-muted-foreground">Action</dt>
				<dd className="text-xs">{describeWafAction(rule)}</dd>
				<dt className="text-muted-foreground">Priority</dt>
				<dd className="text-xs">{rule.priority ?? 0}</dd>
				<dt className="text-muted-foreground">Runs on</dt>
				<dd className="text-xs">{describeWafActivation(rule)}</dd>
				{provenance && (
					<>
						<dt className="text-muted-foreground">Source</dt>
						<dd className="text-xs">{provenance}</dd>
					</>
				)}
			</dl>
		</li>
	);
}

const MODE_CHOICES: Array<{ value: WafMode; label: string; detail: string }> = [
	{
		value: 'enforce',
		label: 'Enforce',
		detail: 'Rules block and score as configured. Watch-only rules only log.',
	},
	{
		value: 'monitor',
		label: 'Monitor',
		detail: 'Every rule is watch-only: matches are logged as would-block, and nothing is blocked.',
	},
	{ value: 'off', label: 'Off', detail: 'Nothing is checked. Rules stay stored.' },
];

function isWafMode(value: unknown): value is WafMode {
	return MODE_CHOICES.some((choice) => choice.value === value);
}

/**
 * Harper offers no way to read back a mode or threshold `set_waf_mode` stored, so these controls start
 * empty and only ever set. What can be read is the node's config, which applies until one is stored.
 * Each control sends only its own value, and Harper keeps the stored value of the other.
 */
function WafModeControls() {
	const instanceParams = useInstanceClientIdParams();
	const { data: configuration } = useQuery(getConfigurationQueryOptions(instanceParams));
	const configMode = isWafMode(configuration?.waf?.mode) ? configuration.waf.mode : 'enforce';
	const configThreshold = typeof configuration?.waf?.scoreThreshold === 'number'
			&& Number.isFinite(configuration.waf.scoreThreshold) && configuration.waf.scoreThreshold > 0
		? configuration.waf.scoreThreshold
		: DEFAULT_WAF_SCORE_THRESHOLD;
	const { mutate: setMode, isPending } = useSetWafMode();
	const [mode, setModeChoice] = useState<WafMode>();
	const [threshold, setThreshold] = useState('');
	const [lastSet, setLastSet] = useState<string>();
	const [confirmingOff, setConfirmingOff] = useState(false);
	const thresholdValue = threshold.trim() === '' ? NaN : Number(threshold);
	const thresholdValid = Number.isFinite(thresholdValue) && thresholdValue > 0;

	const send = (args: { mode?: WafMode; scoreThreshold?: number }, done: string) => {
		setMode({ ...instanceParams, ...args }, {
			onSuccess: () => {
				toast.success(done);
				setLastSet(`${done} from this page at ${new Date().toLocaleTimeString()}.`);
			},
		});
	};

	return (
		<section className="flex flex-col gap-4 rounded-md border p-4" aria-label="Firewall mode">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">Mode</h3>
				<p className="text-sm text-muted-foreground">
					A mode set here applies to every node, but Harper doesn't report it back, so the active mode isn't shown.
					{configuration && !lastSet && (
						<>
							{' '}If no mode has been set, this node's config runs the firewall in{' '}
							{MODE_CHOICES.find((choice) => choice.value === configMode)?.label} mode with a score threshold of{' '}
							{configThreshold}.
						</>
					)}
				</p>
				{lastSet && <p className="text-sm">{lastSet}</p>}
			</div>
			<RadioGroup value={mode ?? ''} onValueChange={(value) => setModeChoice(value as WafMode)}>
				{MODE_CHOICES.map((choice) => (
					<div key={choice.value} className="flex items-start gap-3">
						<RadioGroupItem id={`waf-mode-${choice.value}`} value={choice.value} className="mt-1" />
						<Label htmlFor={`waf-mode-${choice.value}`} className="block font-normal leading-snug">
							<span className="block font-medium">{choice.label}</span>
							<span className="block text-sm text-muted-foreground">{choice.detail}</span>
						</Label>
					</div>
				))}
			</RadioGroup>
			<Button
				className="w-fit"
				variant={mode === 'off' ? 'destructive' : 'defaultOutline'}
				disabled={!mode || isPending}
				onClick={() => {
					if (mode === 'off') {
						setConfirmingOff(true);
					} else if (mode) {
						send({ mode }, `Firewall mode set to ${mode}`);
					}
				}}
			>
				{mode === 'off' ? 'Turn the firewall off' : 'Set mode'}
			</Button>
			<div className="flex flex-col gap-2">
				<Label htmlFor="waf-score-threshold">Score threshold</Label>
				<p className="text-xs text-muted-foreground">
					The total score at which score rules block a request.
				</p>
				<div className="flex flex-wrap gap-2">
					<Input
						id="waf-score-threshold"
						inputMode="decimal"
						className="w-32"
						placeholder={String(configThreshold)}
						value={threshold}
						onChange={(event) => setThreshold(event.target.value)}
					/>
					<Button
						variant="defaultOutline"
						disabled={!thresholdValid || isPending}
						onClick={() => send({ scoreThreshold: thresholdValue }, `Score threshold set to ${thresholdValue}`)}
					>
						Set threshold
					</Button>
				</div>
				{threshold.trim() !== '' && !thresholdValid && (
					<p className="text-sm text-destructive">Use a number greater than 0.</p>
				)}
			</div>
			<AlertDialog open={confirmingOff} onOpenChange={setConfirmingOff}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Turn the firewall off?</AlertDialogTitle>
						<AlertDialogDescription>
							Every node stops checking requests, and no rule blocks anything until a mode is set again. The rules stay
							stored.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmingOff(false);
								send({ mode: 'off' }, 'Firewall mode set to off');
							}}
						>
							Turn it off
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
