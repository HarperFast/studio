import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	isOperationsValueUnusable,
	RolePermissionEditor,
	useRoleEditorSchema,
} from '@/features/instance/config/roles/editor/RolePermissionEditor';
import { useRolePermissionDraft } from '@/features/instance/config/roles/editor/useRolePermissionDraft';
import { preparePermissionForSave } from '@/features/instance/config/roles/preparePermissionForSave';
import { AddRoleFormData, useAddRoleMutation } from '@/integrations/api/instance/auth/addRole';
import { AddRoleFormSchema } from '@/integrations/api/instance/auth/addRoleFormSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

/** The shape add_role has always been sent for a new, not-yet-granted role. */
const NEW_ROLE_PERMISSION = { super_user: false, structure_user: false };

/**
 * Creates a role with its full permissions in one step, through the same editor as editing one.
 * Render it only while open: its draft lives in this component's state.
 */
export function AddRoleModal({
	onChangesSaved,
	closeModal,
}: {
	onChangesSaved: () => void;
	closeModal: () => void;
}) {
	const form = useForm({
		resolver: zodResolver(AddRoleFormSchema),
		defaultValues: { role: '' },
	});
	const instanceParams = useInstanceClientIdParams();
	const schema = useRoleEditorSchema();
	const { mutate: addRole, isPending: isAddPending } = useAddRoleMutation();
	const draft = useRolePermissionDraft(NEW_ROLE_PERMISSION);
	const { permission } = draft;
	const operationsUnusable = isOperationsValueUnusable(permission, schema.version);

	const onSubmitClick = useCallback(
		(formData: AddRoleFormData) => {
			if (!permission || operationsUnusable) {
				return;
			}
			addRole(
				{
					role: formData.role,
					// Also what lets a super user role be created at all: Harper rejects one that carries any
					// other key, including the `structure_user: false` a new role starts with.
					permission: preparePermissionForSave(permission),
					...instanceParams,
				},
				{
					onSuccess: () => {
						toast.success('Role added successfully!');
						onChangesSaved();
					},
				},
			);
		},
		[addRole, instanceParams, onChangesSaved, operationsUnusable, permission],
	);

	return (
		<Dialog onOpenChange={closeModal} open>
			<DialogContent resizable aria-describedby={undefined}>
				<Form {...form}>
					<form
						id="instance-add-role-form"
						name="instance-add-role-form"
						onSubmit={form.handleSubmit(onSubmitClick)}
						className="flex min-h-0 flex-1 flex-col gap-4"
					>
						<DialogHeader>
							<DialogTitle>Add New Role</DialogTitle>
							<DialogDescription>Name the role and choose what it can access.</DialogDescription>
						</DialogHeader>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Name</FormLabel>
									<FormControl>
										<Input type="text" maxLength={AddRoleFormSchema.shape.role.maxLength!} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<RolePermissionEditor draft={draft} schema={schema} />
						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									type="button"
									onClick={closeModal}
									disabled={isAddPending}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									variant="submit"
									disabled={isAddPending || !permission || operationsUnusable}
								>
									<Save /> Add Role
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
