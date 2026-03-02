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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { CertificateSchema, useAddCertificate } from '@/integrations/api/instance/certificates/useAddCertificate';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function AddCertificateModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const form = useForm({
		resolver: zodResolver(CertificateSchema),
		defaultValues: {
			name: '',
			certificate: '',
			private_key: '',
			is_authority: false,
			hosts: '',
			uses: '',
		},
	});
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addCertificate, isPending } = useAddCertificate();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof CertificateSchema>) => {
			const { hosts, uses, private_key, ...rest } = formData;
			const hostsArray = hosts
				? hosts
					.split(',')
					.map((h) => h.trim())
					.filter(Boolean)
				: undefined;

			const usesArray = uses
				? uses
					.split(',')
					.map((u) => u.trim())
					.filter(Boolean)
				: undefined;

			addCertificate(
				{
					instanceParams,
					certificateParams: {
						...rest,
						private_key: private_key || undefined,
						hosts: hostsArray && hostsArray.length > 0 ? hostsArray : undefined,
						uses: usesArray && usesArray.length > 0 ? usesArray : undefined,
					},
				},
				{
					onSuccess: () => {
						form.reset();
						onChangesSaved();
						toast.success('Certificate added successfully!');
						setIsModalOpen(false);
					},
				},
			);
		},
		[addCertificate, form, instanceParams, onChangesSaved, setIsModalOpen],
	);

	const onClickCancel = useCallback(() => {
		form.reset();
		setIsModalOpen(false);
	}, [form, setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form
						id="instance-create-certificate-form"
						name="instance-create-certificate-form"
						onSubmit={form.handleSubmit(onSubmitClick)}
						className="grid gap-4 my-4"
					>
						<DialogHeader>
							<DialogTitle>Add New Certificate</DialogTitle>
							<DialogDescription>
								Enter the details of your Certificate below.
							</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
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
							name="is_authority"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-800 p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Is Authority</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="certificate"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Certificate</FormLabel>
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											rows={5}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="hosts"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Hosts (optional)</FormLabel>
									<FormDescription>
										Comma-separated list of hostnames this certificate is valid for.
									</FormDescription>
									<FormControl>
										<Input
											type="text"
											autoComplete="off"
											autoCapitalize="off"
											placeholder="e.g. example.com, *.example.com"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="uses"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Uses (optional)</FormLabel>
									<FormDescription>
										Comma-separated list of intended uses, e.g. "https, operations, wss".
									</FormDescription>
									<FormControl>
										<Input
											type="text"
											autoComplete="off"
											autoCapitalize="off"
											placeholder="e.g. https, operations, wss"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="private_key"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Private Key (optional)</FormLabel>
									<FormDescription>
										PEM formatted private key string.
									</FormDescription>
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											rows={5}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
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
									<Save /> Add Certificate
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
