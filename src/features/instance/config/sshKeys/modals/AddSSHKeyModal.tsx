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
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { SSHKeySchema, useAddSSHKey } from '@/integrations/api/instance/ssh/addSSHKey';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function AddSSHKeyModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const form = useForm({
		resolver: zodResolver(SSHKeySchema),
		defaultValues: {
			name: '',
			key: '',
			host: '',
			hostname: '',
			known_hosts: '',
		},
	});
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addSSHKey, isPending } = useAddSSHKey();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof SSHKeySchema>) => {
			if (formData) {
				const { name, key, host, hostname, known_hosts } = formData;
				addSSHKey(
					{
						name,
						key: key.trim() + '\n',
						host,
						hostname,
						known_hosts: known_hosts || undefined,
						...instanceParams,
					},
					{
						onSuccess: () => {
							form.reset();
							onChangesSaved();
							toast.success('SSH Key added successfully!');
							setIsModalOpen(false);
						},
					},
				);
			}
		},
		[addSSHKey, form, instanceParams, onChangesSaved, setIsModalOpen],
	);

	const onClickCancel = useCallback(() => {
		form.reset();
		setIsModalOpen(false);
	}, [form, setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4 md:grid-cols-2">
						<DialogHeader className="md:col-span-2">
							<DialogTitle>Add New SSH Key</DialogTitle>
							<DialogDescription>
								Enter the details of your SSH Key below.
							</DialogDescription>
						</DialogHeader>

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
											autoFocus={true}
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
										Your private key. Don't have one? Try out "ssh-keygen"! You'll want to add your public key to your
										registry, i.e. GitHub.
									</FormDescription>
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="host"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel className="pb-1">Host</FormLabel>
									<FormDescription>
										A unique identifying name for the combination of this key and your hostname, i.e.
										"your-repo.github.com". You will use this instead of the direct hostname to pick your key when
										importing applications.
									</FormDescription>
									<FormControl>
										<Input
											type="text"
											autoComplete="off"
											autoCapitalize="off"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="hostname"
							render={({ field }) => (
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
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="known_hosts"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel className="pb-1">Known Hosts</FormLabel>
									<FormDescription>
										Optionally, append known hosts, one per line. GitHub known hosts should resolve automatically.
									</FormDescription>
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											className="whitespace-nowrap"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className="md:col-span-2">
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									type="button"
									className="rounded-full"
									onClick={onClickCancel}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									variant="submit"
									className="rounded-full"
									disabled={isPending || !form.formState.isDirty || !form.formState.isValid}
								>
									<Save /> Add SSH Key
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
