import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getCurrentUserQueryOptions } from '@/features/auth/queries/getCurrentUser';
import { OAuthLockedOrgCard } from '@/features/organizations/components/OAuthLockedOrgCard';
import { OrgCard } from '@/features/organizations/components/OrgCard';
import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { useDeleteOrganizationMutation } from '@/features/organizations/mutations/deleteOrganization';
import { NewOrg } from '@/features/organizations/NewOrg';
import {
	ALL_ORGANIZATIONS_PAGE_SIZE,
	getAllOrganizationsQueryOptions,
} from '@/features/organizations/queries/getAllOrganizations';
import { useStaffPermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { detectEntityId } from '@/lib/string/entityId';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearch } from '@tanstack/react-router';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type OrganizationAccess, selectOrganizations, summarizeOrganizations } from './lib/organizationListModel';

export function OrganizationsIndex() {
	const queryClient = useQueryClient();
	const { data: user } = useSuspenseQuery(getCurrentUserQueryOptions());
	const { mutate: deleteOrg, isPending: isDeletingOrgPending } = useDeleteOrganizationMutation();

	const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
	const [deleteOrgInfo, setDeleteOrgInfo] = useState<
		null | {
			organizationId: string;
			organizationName?: string;
		}
	>(null);

	const [filterByNameValue, setFilterByNameValue] = useState('');
	const [access, setAccess] = useState<OrganizationAccess>('all');
	const [role, setRole] = useState('');
	const [descending, setDescending] = useState(false);
	const clearFilters = () => {
		setFilterByNameValue('');
		setAccess('all');
		setRole('');
		setDescending(false);
		setPageIndex(0);
	};

	// The server-side listing and id lookup read every organization, so the
	// staff org:read permission is what unlocks them.
	const canReadAllOrgs = useStaffPermission('org:read');
	const [showAllOrgs, setShowAllOrgs] = useSessionStorage('ShowAllOrganizations', false);
	const [pageIndex, setPageIndex] = useState(0);
	const showAll = canReadAllOrgs && showAllOrgs;

	const onShowAllOrgsChanged = useCallback((checked: boolean) => {
		setShowAllOrgs(checked);
		setPageIndex(0);
	}, [setShowAllOrgs]);

	// In the admin view, filtering happens server-side; debounce so we don't
	// issue a request per keystroke.
	const debouncedFilterValue = useDebounce(filterByNameValue, 300);

	// A pasted organization/cluster id is resolved by id server-side rather than
	// matched as a title (see getAllOrganizationsQueryOptions). This works for
	// any staff account regardless of the "All Orgs" toggle, so support can jump
	// straight to an org from an id copied out of a log or ticket.
	const searchEntityId = useMemo(() => {
		if (!canReadAllOrgs) {
			return null;
		}
		const entity = detectEntityId(debouncedFilterValue);
		return entity?.kind === 'organization' || entity?.kind === 'cluster' ? entity : null;
	}, [canReadAllOrgs, debouncedFilterValue]);

	// Both the "All Orgs" listing and an id lookup render from the server query.
	const isServerSearch = showAll || !!searchEntityId;

	const { data: allOrgsPage, isPending: isAllOrgsPending, isError: isAllOrgsError, refetch: retryAllOrgs } = useQuery({
		...getAllOrganizationsQueryOptions(pageIndex, debouncedFilterValue),
		enabled: isServerSearch,
	});

	const targets = useMemo(() => getOrganizationTargets(user), [user]);
	const summary = useMemo(() => summarizeOrganizations(targets), [targets]);
	const roles = useMemo(
		() => [...new Set(targets.filter(target => !target.locked).map(target => target.roleName))].sort(),
		[targets],
	);
	const visibleTargets = useMemo(
		() => isServerSearch ? [] : selectOrganizations(targets, filterByNameValue, access, role, descending),
		[targets, filterByNameValue, access, role, descending, isServerSearch],
	);
	const hasControls = !!filterByNameValue || access !== 'all' || !!role || descending;

	// Roles for organizations the staff account is fetching server-side. Falls
	// back to "fabric staff" for organizations the user has no role in.
	const allOrganizationRoles = useMemo(() => {
		const roles = user?.roles || {};
		return (allOrgsPage?.organizations || []).map((org) => ({
			organizationId: org.id,
			organizationName: org.name || org.id,
			roleName: roles[org.id]?.role || 'fabric staff',
		}));
	}, [allOrgsPage?.organizations, user?.roles]);

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		// Keep the raw casing: the fuzzy filter lowercases internally, and the
		// server-side admin filter wants the value as typed.
		setFilterByNameValue(e.currentTarget.value || '');
		setPageIndex(0);
	}, []);

	const handleDeleteOrg = useCallback(
		(org: { organizationId: string; organizationName?: string }) => {
			if (org?.organizationId) {
				deleteOrg(org.organizationId, {
					onSuccess: () => {
						toast.success('Success', {
							description: `Organization successfully deleted.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						void queryClient.invalidateQueries({ queryKey: [] });
						setIsDeleteOrgModalOpen(false);
					},
					onError: () => setIsDeleteOrgModalOpen(false),
				});
			}
		},
		[deleteOrg, queryClient, setIsDeleteOrgModalOpen],
	);

	const onDeleteOrgModal = useCallback((orgRole: { organizationId: string; organizationName?: string }) => {
		setDeleteOrgInfo(orgRole);
		setIsDeleteOrgModalOpen(true);
	}, []);

	const { createCluster }: { createCluster?: string } = useSearch({ strict: false });

	if (!isServerSearch && summary.accessible === 1 && !hasControls && createCluster) {
		return <Navigate to={`/${targets.find(target => !target.locked)!.id}/new-cluster`} replace={true} />;
	}

	if (!isServerSearch && !targets.length && !hasControls) {
		return <NewOrg />;
	}

	return (
		<>
			<SubNavMenu />
			<section className="mt-32 px-4 pt-6 pb-10 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<header className="flex flex-wrap items-center justify-between gap-4 pb-6">
					<div>
						<p className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-violet-300">
							Organizations
						</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight">Your teams, connected.</h1>
						<p className="mt-2 text-sm text-muted-foreground">Find your organization and get back to building.</p>
					</div>
					<Button asChild variant="positive">
						<Link to="/new-org">
							<PlusIcon />New Organization
						</Link>
					</Button>
				</header>
				{!isServerSearch && (
					<div role="group" aria-label="Organization summary" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
						{([{ value: 'all', label: 'Total organizations', count: summary.total }, {
							value: 'accessible',
							label: 'Accessible',
							count: summary.accessible,
						}, { value: 'locked', label: 'Sign-in required', count: summary.locked }] as const).map(item => (
							<button
								key={item.value}
								type="button"
								aria-pressed={access === item.value}
								onClick={() => {
									setAccess(item.value);
									setRole('');
								}}
								className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring ${
									access === item.value ? 'border-primary/40 bg-primary/10' : 'border-border bg-card/60'
								}`}
							>
								<span className="text-muted-foreground">{item.label}</span>
								<span className="text-xl font-semibold">{item.count}</span>
							</button>
						))}
					</div>
				)}
				<div
					role="search"
					aria-label="Find organizations"
					className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/60 p-3"
				>
					<Input
						aria-label="Search organizations"
						placeholder="Search name or ID…"
						className="min-w-0 flex-1 basis-56 dark:bg-background/60"
						value={filterByNameValue}
						onChange={onFilterByNameChanged}
					/>
					{!isServerSearch && (
						<>
							<select
								aria-label="Organization access"
								value={access}
								onChange={event => setAccess(event.target.value as OrganizationAccess)}
								className="max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
							>
								<option value="all">All access</option>
								<option value="accessible">Accessible</option>
								<option value="locked">Sign-in required</option>
							</select>
							{roles.length > 1 && (
								<select
									aria-label="Organization role"
									value={role}
									onChange={event => setRole(event.target.value)}
									className="max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
								>
									<option value="">All roles</option>
									{roles.map(value => <option key={value} value={value}>{value}</option>)}
								</select>
							)}
							<select
								aria-label="Sort organizations"
								value={descending ? 'desc' : 'asc'}
								onChange={event => setDescending(event.target.value === 'desc')}
								className="max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
							>
								<option value="asc">Name: A–Z</option>
								<option value="desc">Name: Z–A</option>
							</select>
						</>
					)}
					{canReadAllOrgs && (
						<label className="flex cursor-pointer items-center gap-2 text-sm">
							<Switch
								checked={showAllOrgs}
								onCheckedChange={onShowAllOrgsChanged}
								aria-label="Show all organizations"
							/>All organizations
						</label>
					)}
				</div>
				<p role="status" className="mb-4 text-xs text-muted-foreground">
					{isServerSearch
						? 'Staff directory · Server search and pagination'
						: `Showing ${visibleTargets.length} of ${summary.total} organizations`}
				</p>
				<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
					{isServerSearch
						? isAllOrgsPending
							? Array.from(
								{ length: ALL_ORGANIZATIONS_PAGE_SIZE },
								(_, index) => <Skeleton key={index} className="h-48" />,
							)
							: isAllOrgsError
							? (
								<div role="alert" className="col-span-full rounded-xl border p-6">
									<p>Organizations couldn’t be loaded.</p>
									<Button variant="outline" onClick={() => void retryAllOrgs()}>Retry</Button>
								</div>
							)
							: allOrganizationRoles.map(organizationRole => (
								<OrgCard
									key={organizationRole.organizationId}
									organizationRole={organizationRole}
									onDeleteOrgModal={onDeleteOrgModal}
								/>
							))
						: visibleTargets.map(target =>
							target.locked
								? (
									<OAuthLockedOrgCard
										key={target.id}
										organizationId={target.id}
										organizationName={target.name}
										providers={target.providers}
									/>
								)
								: (
									<OrgCard
										key={target.id}
										organizationRole={{
											organizationId: target.id,
											organizationName: target.name,
											roleName: target.roleName,
										}}
										onDeleteOrgModal={onDeleteOrgModal}
									/>
								)
						)}
					{(isServerSearch
						? !isAllOrgsPending && !isAllOrgsError && !allOrganizationRoles.length
						: !visibleTargets.length) && (
						<div className="col-span-full rounded-xl border border-dashed p-10 text-center">
							<h2 className="text-lg font-medium">No matching organizations</h2>
							<p className="my-3 text-sm text-muted-foreground">Try another name or clear your filters.</p>
							<Button variant="outline" onClick={clearFilters}>Clear filters</Button>
						</div>
					)}
				</div>
				{isServerSearch && (pageIndex > 0 || allOrgsPage?.hasNextPage) && (
					<div className="flex items-center justify-center gap-4 py-6">
						<Button
							variant="defaultOutline"
							size="sm"
							className="select-none"
							disabled={pageIndex === 0}
							onClick={() => setPageIndex((index) => index - 1)}
						>
							<ArrowLeftIcon />
							Previous
						</Button>
						<span className="text-sm text-gray-500 dark:text-gray-400">Page {pageIndex + 1}</span>
						<Button
							variant="defaultOutline"
							size="sm"
							className="select-none"
							disabled={!allOrgsPage?.hasNextPage}
							onClick={() => setPageIndex((index) => index + 1)}
						>
							Next
							<ArrowRightIcon />
						</Button>
					</div>
				)}
			</section>
			{deleteOrgInfo && (
				<ConfirmDeletionModal
					typeOfThingBeingDeleted="organization"
					nameOfThingBeingDeleted={deleteOrgInfo.organizationName}
					isModalOpen={isDeleteOrgModalOpen}
					setIsModalOpen={() => setIsDeleteOrgModalOpen(false)}
					deletionConfirmed={() => handleDeleteOrg(deleteOrgInfo)}
					deletionPending={isDeletingOrgPending}
				/>
			)}
		</>
	);
}
