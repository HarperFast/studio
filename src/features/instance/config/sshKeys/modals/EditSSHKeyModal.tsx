import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useDeleteSSHKey } from '@/integrations/api/instance/ssh/deleteSSHKey';
import { getSSHKeyQueryOptions } from '@/integrations/api/instance/ssh/getSSHKey';
import { SSHKeyName } from '@/integrations/api/instance/ssh/listSSHKeys';
import { UpdateSSHKeySchema, useUpdateSSHKey } from '@/integrations/api/instance/ssh/updateSSHKey';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function EditSSHKeyModal({
	data,
	isModalOpen,
	closeModal,
	onSelectSSHKey,
	onChangesSaved,
}: {
	data: SSHKeyName;
	isModalOpen: boolean;
	closeModal: () => void;
	onSelectSSHKey: (row?: Row<SSHKeyName>) => void;
	onChangesSaved: () => void;
}) {
	const { name } = data;

	const form = useForm({
		resolver: zodResolver(UpdateSSHKeySchema),
		defaultValues: {
			name,
			key: '',
		},
	});

	const instanceParams = useInstanceClientIdParams();

	const { data: fullData } = useQuery(getSSHKeyQueryOptions({
		...instanceParams,
		name,
	}));

	const { mutate: updateSSHKey, isPending } = useUpdateSSHKey();
	const { mutate: deleteSSHKey } = useDeleteSSHKey();

	const onSubmitClick = useCallback(
		async ({ key }: z.infer<typeof UpdateSSHKeySchema>) => {
			if (key) {
				updateSSHKey(
					{
						name,
						key: key.trim() + '\n',
						...instanceParams,
					},
					{
						onSuccess: () => {
							toast.success('SSH Key updated successfully!');
							onSelectSSHKey(undefined);
							onChangesSaved();
						},
					},
				);
			}
		},
		[updateSSHKey, name, instanceParams, onSelectSSHKey, onChangesSaved],
	);

	const onSSHKeyDeleteClicked = useCallback(() => {
		deleteSSHKey(
			{
				name,
				...instanceParams,
			},
			{
				onSuccess: () => {
					toast.success('SSH Key deleted successfully!');
					onSelectSSHKey(undefined);
					onChangesSaved();
				},
			},
		);
	}, [name, deleteSSHKey, instanceParams, onChangesSaved, onSelectSSHKey]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent className="sm:max-w-[750px]" aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4 md:grid-cols-2">
						<DialogTitle>Edit SSH Key</DialogTitle>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel className="pb-1">Name</FormLabel>
									<FormControl>
										<Input
											type="text"
											autoComplete="off"
											autoCapitalize="off"
											readOnly={true}
											disabled={true}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="key"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel className="pb-1">Key</FormLabel>
									<FormDescription>
										Replace your existing private key. Lost it? Try out "ssh-keygen"! You'll want to add your public key
										to your registry, i.e. GitHub.
									</FormDescription>
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											autoFocus={true}
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormItem className="md:col-span-2">
							<FormLabel className="pb-1">Host</FormLabel>
							<FormDescription>
								A unique identifying name for the combination of this key and your hostname, i.e.
								"your-repo.github.com". You will use this instead of the direct hostname to pick your key when importing
								applications.
							</FormDescription>
							<FormControl>
								<Input
									type="text"
									autoComplete="off"
									autoCapitalize="off"
									value={fullData?.host || ''}
									disabled={true}
									readOnly={true}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>

						<FormItem className="md:col-span-2">
							<FormLabel className="pb-1">Hostname</FormLabel>
							<FormDescription>
								When making the request, the actual hostname to use, i.e. "github.com".
							</FormDescription>
							<FormControl>
								<Input
									type="text"
									autoComplete="off"
									autoCapitalize="off"
									value={fullData?.hostname || ''}
									disabled={true}
									readOnly={true}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>

						<DialogFooter>
							<Button
								type="button"
								variant="destructiveOutline"
								className="rounded-full"
								onClick={onSSHKeyDeleteClicked}
								disabled={isPending}
							>
								Delete SSH Key
							</Button>

							<div className="grow" />

							<Button
								type="submit"
								variant="submit"
								className="rounded-full"
								disabled={isPending || !form.formState.isValid}
							>
								Update SSH Key
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
