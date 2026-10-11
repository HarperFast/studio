import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import {
	isTrustPolicyScoped,
	listOidcTrustQueryOptions,
	OidcTrustPolicy,
	supportsTrustPolicies,
	useDropTrustPolicy,
	useSetTrustPolicyEnabled,
} from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

const DOCS_URL = 'https://docs.harperdb.io/reference/v5/operations-api/operations#add_oidc_trust';

/**
 * The cluster's OIDC trust policies (HarperFast/studio#1788): list, disable or enable, and drop. Creating
 * one is left to `add_oidc_trust` until the setup flow Studio should share with the CLI is settled.
 */
export function ConfigTrustPoliciesIndex() {
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const supported = registrationInfo === undefined ? undefined : supportsTrustPolicies(registrationInfo.version);
	const { data: policies, isFetching, isError, refetch } = useQuery(
		listOidcTrustQueryOptions({ ...instanceParams, enabled: canManage && supported === true }),
	);
	const onRefreshClick = useRefreshClick(refetch);

	const { mutateAsync: setEnabled, isPending: isSetEnabledPending } = useSetTrustPolicyEnabled();
	const { mutateAsync: dropPolicy, isPending: isDropPending } = useDropTrustPolicy();
	const [dropTarget, setDropTarget] = useState<string>();
	const busy = isSetEnabledPending || isDropPending;

	if (!canManage) {
		return <PageNotice>Only super users can view or change trust policies.</PageNotice>;
	}
	if (supported === undefined) {
		return <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				Trust policies need Harper 5.3 or later. This instance runs {registrationInfo?.version}.
			</PageNotice>
		);
	}

	// Refetched on failure too: the usual failure is that the row changed or vanished, and the error
	// toast asks the reader to review what is there now.
	const onToggle = async (policy: OidcTrustPolicy, enabled: boolean) => {
		try {
			await setEnabled({ ...instanceParams, loaded: policy, enabled });
			toast.success(`${enabled ? 'Enabled' : 'Disabled'} trust policy '${policy.id}'`);
		} finally {
			await refetch();
		}
	};

	const onDropConfirmed = async () => {
		if (!dropTarget) {
			return;
		}
		try {
			await dropPolicy({ ...instanceParams, id: dropTarget });
			toast.success(`Dropped trust policy '${dropTarget}'`);
			setDropTarget(undefined);
		} finally {
			await refetch();
		}
	};

	return (
		<div className="flex flex-col gap-4 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Trust Policies</h2>
					<p className="text-sm text-muted-foreground">
						A trust policy lets a CI workflow, such as GitHub Actions, sign in as a Harper user with its OIDC identity
						token instead of a stored password or token. Policies replicate to every node in the cluster.
					</p>
					<a
						className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
						href={DOCS_URL}
						target="_blank"
						rel="noreferrer"
					>
						Trust policy docs
					</a>
				</div>
				<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetching}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">Refresh</span>
				</Button>
			</div>

			{isError
				? <PageNotice>The trust policies could not be loaded.</PageNotice>
				: policies === undefined
				? <Loading text="Loading..." />
				: policies.length === 0
				? (
					<PageNotice>
						No trust policies yet. Create one with the <code className="font-mono">add_oidc_trust</code> operation.
					</PageNotice>
				)
				: (
					// The `.catch`es below only stop an unhandled rejection; the mutation cache already toasts failures.
					<ul className="flex flex-col gap-3">
						{policies.map((policy) => (
							<TrustPolicyCard
								key={policy.id}
								policy={policy}
								disabled={busy}
								onToggle={(enabled) => void onToggle(policy, enabled).catch(() => undefined)}
								onDrop={() => setDropTarget(policy.id)}
							/>
						))}
					</ul>
				)}

			<ConfirmDeletionModal
				typeOfThingBeingDeleted="trust policy"
				nameOfThingBeingDeleted={dropTarget}
				isModalOpen={dropTarget !== undefined}
				setIsModalOpen={(open) => !open && setDropTarget(undefined)}
				deletionConfirmed={() => void onDropConfirmed().catch(() => undefined)}
				deletionPending={isDropPending}
				hideDataLossWarning
				transitiveVerb="Drop"
				presentParticiple="Dropping"
			/>
		</div>
	);
}

function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}

/** Server data rendered as text, whatever shape it arrived in. */
function textOf(value: unknown, separator = ', '): string {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value.join(separator);
	}
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function claimEntries(claims: unknown): Array<[string, string]> {
	if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
		return [['claims', textOf(claims)]];
	}
	// A claim constrained to several values matches a token carrying any one of them.
	return Object.entries(claims).map(([name, value]) => [name, textOf(value, ' or ')]);
}

function TrustPolicyCard({
	policy,
	disabled,
	onToggle,
	onDrop,
}: {
	policy: OidcTrustPolicy;
	disabled: boolean;
	onToggle: (enabled: boolean) => void;
	onDrop: () => void;
}) {
	const invalidReason = policy.invalid_reason ? textOf(policy.invalid_reason) : undefined;
	const enabled = policy.enabled === true;
	// Re-saving runs every write-time check again, so a policy Harper already flags would fail it too.
	const canToggle = !invalidReason && typeof policy.enabled === 'boolean';
	const user = textOf(policy.user);
	return (
		<li className="flex flex-col gap-2 rounded-md border p-4" aria-label={`Trust policy ${policy.id}`}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-sm font-semibold">{policy.id}</span>
					{invalidReason
						? <Badge variant="destructive">Can't match</Badge>
						: enabled
						? <Badge variant="success">Enabled</Badge>
						: <Badge variant="outline">Disabled</Badge>}
				</div>
				<div className="flex gap-2">
					{canToggle && (
						<Button
							size="sm"
							variant="defaultOutline"
							disabled={disabled}
							onClick={() => onToggle(!enabled)}
							title={enabled
								? 'Stops new runs from signing in. A token already issued keeps working until it expires, within '
									+ 'an hour.'
								: undefined}
						>
							{enabled ? 'Disable' : 'Enable'}
						</Button>
					)}
					<Button size="sm" variant="destructiveOutline" disabled={disabled} onClick={onDrop}>
						Drop
					</Button>
				</div>
			</div>
			{invalidReason && (
				<p className="text-sm text-destructive">
					Harper refuses every token for this policy: {invalidReason}.
				</p>
			)}
			{typeof policy.description === 'string' && policy.description && <p className="text-sm">{policy.description}</p>}
			<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">Issuer</dt>
				<dd className="break-all font-mono text-xs">{textOf(policy.issuer)}</dd>
				<dt className="text-muted-foreground">Audience</dt>
				<dd className="break-all font-mono text-xs">{textOf(policy.audience)}</dd>
				<dt className="text-muted-foreground">Claims</dt>
				<dd>
					<ul>
						{claimEntries(policy.claims).map(([name, value]) => (
							<li key={name} className="break-all font-mono text-xs">
								{name} = {value}
							</li>
						))}
					</ul>
				</dd>
				<dt className="text-muted-foreground">Signs in as</dt>
				<dd className="font-mono text-xs">{user}</dd>
				<dt className="text-muted-foreground">Operations</dt>
				<dd
					className="text-xs"
					title={isTrustPolicyScoped(policy)
						? 'Enforced on the Operations API and SQL. Application REST and GraphQL endpoints authorize by the '
							+ "user's role alone."
						: undefined}
				>
					{isTrustPolicyScoped(policy)
						? <span className="font-mono">{textOf(policy.operations)}</span>
						: `Not limited: the token carries everything ${user}'s role allows.`}
				</dd>
			</dl>
		</li>
	);
}
