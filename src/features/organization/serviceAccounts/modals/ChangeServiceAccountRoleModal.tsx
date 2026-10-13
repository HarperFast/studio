import { RoleOptionLabel } from '@/components/RoleOptionLabel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { useUpdateServiceAccountMutation } from '@/features/organization/serviceAccounts/mutations/serviceAccounts';
import { ServiceAccount } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

/** Render only while open, so each opening starts from the account's current role. */
export function ChangeServiceAccountRoleModal(
	{ organizationId, account, onClose }: { organizationId: string; account: ServiceAccount; onClose: () => void },
) {
	const { data: roles } = useQuery(getOrganizationRolesQueryOptions(organizationId));
	const { mutate: update, isPending } = useUpdateServiceAccountMutation(organizationId);
	const [roleId, setRoleId] = useState(account.roleName ? account.roleId : '');
	const isUnchanged = Boolean(account.roleName) && roleId === account.roleId;

	const onSave = () =>
		update(
			{ id: account.id, roleId },
			{
				onSuccess: () => {
					toast.success('Role changed. It applies to the account’s next request.');
					onClose();
				},
			},
		);

	return (
		<Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogTitle>Change role</DialogTitle>
				<DialogDescription>
					{account.name}'s tokens act with this role from their next request.
				</DialogDescription>
				<Select value={roleId} onValueChange={setRoleId} disabled={isPending}>
					<SelectTrigger className="w-full" aria-label="Role">
						<SelectValue placeholder="Choose a role" />
					</SelectTrigger>
					<SelectContent>
						{roles?.map((role) => (
							<SelectItem key={role.id} value={role.id}>
								<RoleOptionLabel name={role.roleName} id={role.id} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<DialogFooter>
					<Button variant="destructiveOutline" type="button" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button variant="submit" type="button" onClick={onSave} disabled={!roleId || isUnchanged || isPending}>
						{isPending ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
