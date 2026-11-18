import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { isDeletedCluster } from '@/config/clusterStatuses';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useConfigNavigation } from '@/features/instance/config/useConfigNavigation';
import { useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { useInstanceAuth } from '@/hooks/useAuth';
import { getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import type { Organization, User } from '@/integrations/api/api.patch';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatches, useNavigate, useParams } from '@tanstack/react-router';
import { Building2, FileTextIcon, Search, Server } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
	buildPageSearchTargets,
	buildSearchTargets,
	filterSearchTargets,
	loadSearchOrganizations,
	type SearchTarget,
} from './searchModel';

interface SearchDialogProps {
	user: User;
	onClose: () => void;
	restoreFocus: () => void;
}

export function SearchDialog(props: SearchDialogProps) {
	const { organizationId, clusterId, instanceId } = useParams({ strict: false });
	const hasConnectionRoute = useMatches({
		select: matches => matches.at(-1)?.context.hasStudioConnection === true,
	});
	if (
		hasConnectionRoute && organizationId && clusterId
		&& getOrganizationClusterPermissions(props.user, organizationId, clusterId).view
		&& getOrganizationTargets(props.user).some(target => target.id === organizationId && !target.locked)
	) {
		return (
			<ScopedSearchDialog
				key={instanceId ?? clusterId}
				clusterId={clusterId}
				instanceId={instanceId}
				organizationId={organizationId}
				{...props}
			/>
		);
	}
	return <SearchDialogContent {...props} />;
}

function ScopedSearchDialog(
	{ organizationId, clusterId, instanceId, ...props }: SearchDialogProps & {
		organizationId: string;
		clusterId: string;
		instanceId?: string;
	},
) {
	const { user: instanceUser } = useInstanceAuth(instanceId ?? clusterId);
	const { data: cluster } = useQuery({ ...getClusterInfoQueryOptions(clusterId, false), enabled: false });
	return instanceUser && !isDeletedCluster(cluster) && !cluster?.resetPassword
		? <ConnectedSearchDialog organizationId={organizationId} {...props} />
		: <SearchDialogContent {...props} />;
}

function ConnectedSearchDialog({ organizationId, ...props }: SearchDialogProps & { organizationId: string }) {
	const instance = useInstanceClientIdParams();
	const { data: registration } = useQuery({ ...getRegistrationInfoQueryOptions(instance), enabled: false });
	const version = registration?.version ?? '';
	const { links, tucked } = useInstanceNavLinks(version);
	const { groups } = useConfigNavigation(version);
	const pageTargets = useMemo(() => {
		const tabs = [...links, ...tucked];
		const section = instance.entityType === 'cluster' ? 'Cluster page' : 'Instance page';
		const pages = tabs.filter(tab => tab.key !== 'config').map(({ name, to }) => ({ name, to, hierarchy: section }));
		const configPages = tabs.some(tab => tab.key === 'config')
			? groups.flatMap(({ label, entries }) =>
				entries.map(({ name, to, exact, keywords }) => ({
					name: exact ? 'Config Overview' : name,
					to,
					hierarchy: label ? `Config › ${label}` : 'Config',
					keywords,
				}))
			)
			: [];
		return buildPageSearchTargets([...pages, ...configPages], organizationId);
	}, [groups, instance.entityType, links, organizationId, tucked]);

	return <SearchDialogContent {...props} pageTargets={pageTargets} />;
}

function SearchDialogContent(
	{ user, onClose, restoreFocus, pageTargets }: SearchDialogProps & { pageTargets?: SearchTarget[] },
) {
	const client = useQueryClient();
	const navigate = useNavigate();
	const { organizationId } = useParams({ strict: false });
	const [search, setSearch] = useState('');
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [organizations, setOrganizations] = useState(new Map<string, Organization>());
	const [failed, setFailed] = useState(0);
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);
	const listId = useId();
	const list = useRef<HTMLDivElement>(null);
	const memberships = useMemo(() => getOrganizationTargets(user).filter(target => !target.locked), [user]);
	const membershipIds = useMemo(() => JSON.stringify(memberships.map(target => target.id)), [memberships]);
	useEffect(() => {
		let cancelled = false;
		setFailed(0);
		setLoading(true);
		void loadSearchOrganizations(JSON.parse(membershipIds) as string[], id =>
			client.fetchQuery({
				...getOrganizationQueryOptions(id),
				staleTime: 60_000,
				meta: { inlineSearchError: true },
			}), (id, organization) => {
			if (organization) { setOrganizations(previous => new Map(previous).set(id, organization)); }
			else {
				setFailed(count => count + 1);
				setOrganizations(previous => {
					const next = new Map(previous);
					next.delete(id);
					return next;
				});
			}
		}, () => cancelled).then(() => {
			if (!cancelled) { setLoading(false); }
		});
		return () => {
			cancelled = true;
		};
	}, [client, membershipIds, attempt]);
	const locations = useMemo(() => buildSearchTargets(user, organizations), [user, organizations]);
	const targets = useMemo(() => pageTargets ? [...pageTargets, ...locations] : locations, [pageTargets, locations]);
	const matches = useMemo(() => filterSearchTargets(targets, search, organizationId), [
		targets,
		search,
		organizationId,
	]);
	const results = matches.slice(0, 40);
	const activeIndex = selectedKey === null ? 0 : results.findIndex(target => target.key === selectedKey);
	useEffect(() => {
		list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex]);
	const openTarget = (target: SearchTarget) => {
		onClose();
		void navigate({ to: target.to });
	};
	return (
		<Dialog
			open
			onOpenChange={value => {
				if (!value) { onClose(); }
			}}
		>
			<DialogContent
				className="top-[18vh] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 lg:max-w-2xl"
				onCloseAutoFocus={event => {
					event.preventDefault();
					restoreFocus();
				}}
			>
				<div className="border-b border-border px-5 pt-5 pb-4">
					<DialogTitle className="pr-8">{pageTargets ? 'Search Studio' : 'Search your organizations'}</DialogTitle>
					<DialogDescription className="mt-2 text-xs">
						{pageTargets
							? 'Jump to a page in this connection, an organization, or a cluster.'
							: 'Jump to an organization or cluster by name.'}
					</DialogDescription>
					<div className="mt-4 flex items-center gap-3">
						<Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<input
							autoFocus
							role="combobox"
							aria-label={pageTargets
								? 'Search pages, organizations, and clusters'
								: 'Search organizations and clusters'}
							aria-expanded="true"
							aria-autocomplete="list"
							aria-controls={listId}
							aria-activedescendant={results.length && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
							placeholder={pageTargets
								? 'Search pages, organizations, or clusters…'
								: 'Search organizations or clusters…'}
							value={search}
							onChange={event => {
								setSearch(event.target.value);
								setSelectedKey(null);
							}}
							className="w-full bg-transparent py-1 text-base outline-none"
							onKeyDown={event => {
								if (event.nativeEvent.isComposing) { return; }
								if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
									event.preventDefault();
									setSelectedKey(
										results.length
											? results[
												activeIndex < 0
													? (event.key === 'ArrowDown' ? 0 : results.length - 1)
													: (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
											]
												.key
											: null,
									);
								} else if (event.key === 'Enter' && results[activeIndex]) {
									event.preventDefault();
									openTarget(results[activeIndex]);
								}
							}}
						/>
					</div>
				</div>
				<div
					role="listbox"
					aria-label="Search results"
					id={listId}
					ref={list}
					className="max-h-[45vh] overflow-y-auto p-2"
				>
					{results.map((target, index) => {
						const Icon = target.kind === 'Page' ? FileTextIcon : target.kind === 'Organization' ? Building2 : Server;
						return (
							<div
								key={target.key}
								id={`${listId}-${index}`}
								role="option"
								aria-selected={activeIndex === index}
								onMouseEnter={() => setSelectedKey(target.key)}
								onMouseDown={event => event.preventDefault()}
								onClick={() => openTarget(target)}
								className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 ${
									activeIndex === index ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-muted'
								}`}
							>
								<span className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<Icon className="size-4" aria-hidden="true" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium text-foreground">{target.name}</span>
									<span className="block truncate text-xs">
										{target.kind === 'Page'
											? target.hierarchy
											: target.kind === 'Cluster'
											? `Cluster · ${target.organizationName}`
											: 'Organization'}
									</span>
								</span>
								<span className="text-xs opacity-50" aria-hidden="true">↵</span>
							</div>
						);
					})}
				</div>
				<div role="status" className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
					{loading
						? 'Loading cluster names…'
						: results.length
						? `Showing ${results.length} of ${matches.length} results`
						: pageTargets
						? 'No matching pages, organizations, or clusters.'
						: memberships.length
						? 'No matching organizations or clusters.'
						: 'No organizations available to search.'}
					{failed > 0 && (
						<p className="mt-2">
							Some organizations could not be loaded. Results may be incomplete.{' '}
							<button
								type="button"
								className="cursor-pointer underline"
								disabled={loading}
								onClick={() => setAttempt(value => value + 1)}
							>
								Retry
							</button>
						</p>
					)}
					<p className="mt-2 opacity-70">↑ ↓ to choose · Enter to open · Esc to close</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}
