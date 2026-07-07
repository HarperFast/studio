import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getCurrentUserQueryOptions } from '@/features/auth/queries/getCurrentUser';
import { OAuthLockedOrgCard } from '@/features/organizations/components/OAuthLockedOrgCard';
import { OrgCard } from '@/features/organizations/components/OrgCard';
import { useDeleteOrganizationMutation } from '@/features/organizations/mutations/deleteOrganization';
import { NewOrg } from '@/features/organizations/NewOrg';
import {
	ALL_ORGANIZATIONS_PAGE_SIZE,
	getAllOrganizationsQueryOptions,
} from '@/features/organizations/queries/getAllOrganizations';
import { useAdminMode } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { detectEntityId } from '@/lib/string/entityId';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearch } from '@tanstack/react-router';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

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
	const clearFilterByNameValue = useCallback(() => setFilterByNameValue(''), []);

	const isAdminMode = useAdminMode();
	const [showAllOrgs, setShowAllOrgs] = useSessionStorage('ShowAllOrganizations', false);
	const [pageIndex, setPageIndex] = useState(0);
	const showAll = isAdminMode && showAllOrgs;

	const onShowAllOrgsChanged = useCallback((checked: boolean) => {
		setShowAllOrgs(checked);
		setPageIndex(0);
	}, [setShowAllOrgs]);

	// In the admin view, filtering happens server-side; debounce so we don't
	// issue a request per keystroke.
	const debouncedFilterValue = useDebounce(filterByNameValue, 300);

	// A pasted organization/cluster id is resolved by id server-side rather than
	// matched as a title (see getAllOrganizationsQueryOptions). This works for
	// any fabric admin regardless of the "All Orgs" toggle, so support can jump
	// straight to an org from an id copied out of a log or ticket.
	const searchEntityId = useMemo(() => {
		if (!isAdminMode) {
			return null;
		}
		const entity = detectEntityId(debouncedFilterValue);
		return entity?.kind === 'organization' || entity?.kind === 'cluster' ? entity : null;
	}, [isAdminMode, debouncedFilterValue]);

	// Both the "All Orgs" listing and an id lookup render from the server query.
	const isServerSearch = showAll || !!searchEntityId;

	const { data: allOrgsPage, isPending: isAllOrgsPending } = useQuery({
		...getAllOrganizationsQueryOptions(pageIndex, debouncedFilterValue),
		enabled: isServerSearch,
	});

	const { organizationRoles, oauthLockedOrgs } = useMemo(() => {
		const roles = user?.roles || {};
		const normal: Array<{ organizationId: string; organizationName?: string; roleName: string }> = [];
		const locked: Array<
			{ organizationId: string; organizationName?: string; providers: Array<{ name: string; oauthConfigId: string }> }
		> = [];

		for (const [organizationId, role] of Object.entries(roles)) {
			// Fabric admins / super users bypass an org's OAuth requirement, so never
			// lock their cards — render the org normally even when it requires OAuth.
			if ('oauthProviders' in role && !isAdminMode) {
				locked.push({ organizationId, organizationName: role.organizationName, providers: role.oauthProviders! });
			} else {
				normal.push({ organizationId, organizationName: role.organizationName, roleName: role.role ?? 'fabric admin' });
			}
		}

		const filteredNormal = normal
			.filter(curryFilterByFuzzySearch(['organizationId', 'organizationName'], filterByNameValue))
			.sort((a, b) => ((a.organizationName || '') > (b.organizationName || '') ? 1 : -1));

		return { organizationRoles: filteredNormal, oauthLockedOrgs: locked };
	}, [filterByNameValue, user?.roles, isAdminMode]);

	// Roles for organizations the fabric admin is fetching server-side. Falls
	// back to "fabric admin" for organizations the user has no role in.
	const allOrganizationRoles = useMemo(() => {
		const roles = user?.roles || {};
		return (allOrgsPage?.organizations || []).map((org) => ({
			organizationId: org.id,
			organizationName: org.name,
			roleName: roles[org.id]?.role || 'fabric admin',
		}));
	}, [allOrgsPage?.organizations, user?.roles]);

	const displayedOrganizationRoles = isServerSearch ? allOrganizationRoles : organizationRoles;

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

	if (!showAll && organizationRoles.length === 1 && !filterByNameValue.length && createCluster) {
		return <Navigate to={`/${organizationRoles[0].organizationId}/new-cluster`} replace={true} />;
	}

	if (!showAll && !organizationRoles.length && !oauthLockedOrgs.length && !filterByNameValue.length) {
		return <NewOrg />;
	}

	return (
		<>
			<SubNavMenu>
				<div className="flex w-full items-center justify-end gap-2">
					{isAdminMode && (
						<label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
							<Switch
								checked={showAllOrgs}
								onCheckedChange={onShowAllOrgsChanged}
								aria-label="Show all organizations"
							/>
							<span className="hidden sm:inline-block">All Orgs</span>
						</label>
					)}
					<Input
						placeholder="Filter by name"
						className="inline-block w-full text-xs"
						value={filterByNameValue}
						onChange={onFilterByNameChanged}
					/>
					<Link to="/new-org">
						<Button variant="positive" accessKey="n">
							<PlusIcon />
							<span className="hidden sm:inline-block">
								<u>N</u>ew <span className="hidden md:inline-block">Organization</span>
							</span>
						</Button>
					</Link>
				</div>
			</SubNavMenu>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
					{/* OAuth-locked orgs only apply to the user's own orgs, not a server-driven listing. */}
					{!isServerSearch && oauthLockedOrgs.map((lockedOrg) => (
						<div
							key={lockedOrg.organizationId}
							className="col-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2"
						>
							<OAuthLockedOrgCard
								organizationId={lockedOrg.organizationId}
								organizationName={lockedOrg.organizationName}
								providers={lockedOrg.providers}
							/>
						</div>
					))}
					{isServerSearch && isAllOrgsPending
						? Array.from({ length: ALL_ORGANIZATIONS_PAGE_SIZE }, (_, index) => (
							<Skeleton
								key={index}
								className="col-span-1 h-40 md:col-span-4 lg:col-span-3 2xl:col-span-2"
							/>
						))
						: displayedOrganizationRoles.map((organizationRole) => (
							<div
								key={organizationRole.organizationId}
								className="col-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2"
							>
								<OrgCard organizationRole={organizationRole} onDeleteOrgModal={onDeleteOrgModal} />
							</div>
						))}
					{!displayedOrganizationRoles.length && !(isServerSearch && isAllOrgsPending)
						&& (isServerSearch || !oauthLockedOrgs.length)
						&& (
							<div className="col-span-1 md:col-span-12 text-center">
								<h2 className="my-4 text-xl">No matches found.</h2>
								<Button variant="outline" onClick={clearFilterByNameValue}>Clear Filters</Button>
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
