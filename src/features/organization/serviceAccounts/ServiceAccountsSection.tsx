import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ServiceAccountTokens } from '@/features/organization/serviceAccounts/components/ServiceAccountTokens';
import { Timestamp } from '@/features/organization/serviceAccounts/components/Timestamp';
import { ChangeServiceAccountRoleModal } from '@/features/organization/serviceAccounts/modals/ChangeServiceAccountRoleModal';
import { CreateServiceAccountModal } from '@/features/organization/serviceAccounts/modals/CreateServiceAccountModal';
import {
	useDeleteServiceAccountMutation,
	useUpdateServiceAccountMutation,
} from '@/features/organization/serviceAccounts/mutations/serviceAccounts';
import { getServiceAccountsQueryOptions } from '@/features/organization/serviceAccounts/queries/serviceAccounts';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { ServiceAccount } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import {
	BanIcon,
	CheckCircleIcon,
	EllipsisIcon,
	PlusIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	Trash2Icon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';

function AccountStatus({ status }: { status: ServiceAccount['status'] }) {
	const isActive = status === 'ACTIVE';
	return (
		<span className="inline-flex items-center gap-2">
			<span aria-hidden className={cn('size-2 rounded-full', isActive ? 'bg-green' : 'bg-amber-600')} />
			<span className={cn(!isActive && 'text-amber-600')}>{isActive ? 'Enabled' : 'Disabled'}</span>
		</span>
	);
}

function ServiceAccountActions(
	{ organizationId, account, onDeleted }: { organizationId: string; account: ServiceAccount; onDeleted: () => void },
) {
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isRoleOpen, setIsRoleOpen] = useState(false);
	const { mutate: update, isPending: isUpdating } = useUpdateServiceAccountMutation(organizationId);
	const { mutate: remove, isPending: isDeleting } = useDeleteServiceAccountMutation(organizationId);
	// isDeleting lags a second confirm by a render, and a second DELETE would detach the first's onSuccess.
	const isDeleteSent = useRef(false);
	const isActive = account.status === 'ACTIVE';

	const onToggleStatus = () =>
		update(
			{ id: account.id, status: isActive ? 'DISABLED' : 'ACTIVE' },
			{ onSuccess: () => toast.success(isActive ? 'Service account disabled.' : 'Service account enabled.') },
		);

	const onDelete = () => {
		if (isDeleteSent.current) { return; }
		isDeleteSent.current = true;
		remove(
			{ id: account.id },
			{
				onError: () => {
					isDeleteSent.current = false;
				},
				onSuccess: () => {
					toast.success(`Service account "${account.name}" deleted; its tokens no longer work.`);
					setIsDeleteOpen(false);
					onDeleted();
				},
			},
		);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={`Options for ${account.name}`}
					>
						<EllipsisIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-40">
					<DropdownMenuItem onClick={() => setIsRoleOpen(true)}>
						<ShieldCheckIcon />
						Change role…
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onToggleStatus} disabled={isUpdating}>
						{isActive ? <BanIcon /> : <CheckCircleIcon />}
						{isActive ? 'Disable' : 'Enable'}
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onClick={() => setIsDeleteOpen(true)}>
						<Trash2Icon />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{isRoleOpen && (
				<ChangeServiceAccountRoleModal
					organizationId={organizationId}
					account={account}
					onClose={() => setIsRoleOpen(false)}
				/>
			)}
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="service account"
				nameOfThingBeingDeleted={account.name}
				isModalOpen={isDeleteOpen}
				setIsModalOpen={setIsDeleteOpen}
				deletionConfirmed={onDelete}
				deletionPending={isDeleting}
				hideDataLossWarning
			/>
		</>
	);
}

export function ServiceAccountsSection({ organizationId }: { organizationId: string }) {
	const regionId = useId();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const { data: serviceAccounts, isLoading, isError, refetch, isFetching } = useQuery(
		getServiceAccountsQueryOptions(organizationId),
	);
	const onRefreshClick = useRefreshClick(refetch);
	const selected = serviceAccounts?.find((account) => account.id === selectedId);
	const toggle = (account: ServiceAccount) => setSelectedId((current) => (current === account.id ? null : account.id));

	return (
		<div className="px-4 py-4">
			<div className="flex flex-wrap items-start justify-between gap-3 mb-3">
				<div>
					<h3 className="font-medium text-foreground">Service accounts</h3>
					<p className="text-sm text-muted-foreground">
						Identities for CI pipelines and scripts, each acting with one of this organization’s roles.
					</p>
				</div>
				{/* Inset by the token panel's border and padding, so this lines up with its Create token. */}
				<div className="flex items-center gap-2 mr-[17px]">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Refresh service accounts"
								onClick={onRefreshClick}
								disabled={isFetching}
							>
								<RefreshCwIcon />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Refresh</TooltipContent>
					</Tooltip>
					<Button variant="positive" size="sm" onClick={() => setIsCreateOpen(true)} disabled={isCreateOpen}>
						<PlusIcon />
						Create service account
					</Button>
				</div>
			</div>

			{isLoading
				? <Loading className="py-6" />
				: isError && !serviceAccounts
				? <p className="py-4 text-sm text-red-500">Couldn’t load service accounts.</p>
				: !serviceAccounts?.length
				? <p className="py-4 text-sm text-muted-foreground">No service accounts yet.</p>
				: (
					<Table>
						<TableHeader>
							<TableRow className="border-border">
								<TableHead>Name</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Active tokens</TableHead>
								<TableHead>Created</TableHead>
								<TableHead>
									<span className="sr-only">Actions</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{serviceAccounts.map((account) => {
								const isSelected = account.id === selectedId;
								return (
									<TableRow
										key={account.id}
										data-state={isSelected ? 'selected' : undefined}
										onClick={() => toggle(account)}
										className="cursor-pointer border-border hover:bg-muted/40 data-[state=selected]:bg-primary/10 dark:data-[state=selected]:bg-white/10"
									>
										<TableCell className="py-2.5">
											<button
												type="button"
												aria-expanded={isSelected}
												aria-controls={isSelected ? regionId : undefined}
												onClick={(event) => {
													event.stopPropagation();
													toggle(account);
												}}
												className="group flex flex-col items-start text-left rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
											>
												<span className="font-medium text-foreground group-hover:underline group-focus-visible:underline">
													{account.name}
												</span>
												<span className="font-mono text-xs text-muted-foreground">{account.id}</span>
											</button>
										</TableCell>
										<TableCell className="py-2.5">
											{account.roleName ?? <span className="text-red-500">Role deleted</span>}
										</TableCell>
										<TableCell className="py-2.5">
											<AccountStatus status={account.status} />
										</TableCell>
										<TableCell className="py-2.5">{account.activeTokens}</TableCell>
										<TableCell className="py-2.5 whitespace-nowrap">
											<Timestamp value={account.createdAt} format="date" />
										</TableCell>
										{/* The menu and the delete dialog render in portals, whose clicks still bubble to this row. */}
										<TableCell className="py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
											<ServiceAccountActions
												organizationId={organizationId}
												account={account}
												onDeleted={() => setSelectedId((current) => (current === account.id ? null : current))}
											/>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}

			{selected && <ServiceAccountTokens organizationId={organizationId} account={selected} regionId={regionId} />}

			{isCreateOpen && (
				<CreateServiceAccountModal
					organizationId={organizationId}
					onClose={() => setIsCreateOpen(false)}
					onCreated={(serviceAccount) => {
						setIsCreateOpen(false);
						setSelectedId(serviceAccount.id);
					}}
				/>
			)}
		</div>
	);
}
