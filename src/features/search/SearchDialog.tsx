import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import type { Organization, User } from '@/integrations/api/api.patch';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Building2, Search, Server } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildSearchTargets, filterSearchTargets, loadSearchOrganizations, type SearchTarget } from './searchModel';

export function SearchDialog(
	{ user, onClose, restoreFocus }: { user: User; onClose: () => void; restoreFocus: () => void },
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
	const targets = useMemo(() => buildSearchTargets(user, organizations), [user, organizations]);
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
					<DialogTitle className="pr-8">Search your organizations</DialogTitle>
					<DialogDescription className="mt-2 text-xs">Jump to an organization or cluster by name.</DialogDescription>
					<div className="mt-4 flex items-center gap-3">
						<Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<input
							autoFocus
							role="combobox"
							aria-label="Search organizations and clusters"
							aria-expanded="true"
							aria-autocomplete="list"
							aria-controls={listId}
							aria-activedescendant={results.length && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
							placeholder="Search organizations or clusters…"
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
						const Icon = target.kind === 'Organization' ? Building2 : Server;
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
										{target.kind === 'Cluster' ? `Cluster · ${target.organizationName}` : 'Organization'}
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
