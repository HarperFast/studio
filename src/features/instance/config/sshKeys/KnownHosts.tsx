import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSSHKnownHostsQueryOptions } from '@/integrations/api/instance/ssh/getSSHKnownHosts';
import { SSHKnownHostsSchema, useSetSSHKnownHosts } from '@/integrations/api/instance/ssh/setSSHKnownHosts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function KnownHosts() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getSSHKnownHostsQueryOptions(instanceParams));
	const form = useForm({
		resolver: zodResolver(SSHKnownHostsSchema),
		defaultValues: {
			known_hosts: data?.known_hosts || '',
		},
	});
	const { mutate: setSSHKnownHosts, isPending } = useSetSSHKnownHosts();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof SSHKnownHostsSchema>) => {
			const { known_hosts } = formData;
			if (known_hosts) {
				setSSHKnownHosts(
					{
						known_hosts: known_hosts.trim() + '\n',
						...instanceParams,
					},
					{
						onSuccess: () => {
							form.reset(formData);
							toast.success('Known hosts saved!');
						},
					},
				);
			}
		},
		[setSSHKnownHosts, form, instanceParams],
	);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid my-4 md:grid-cols-2 overflow-x-auto rounded-md">
				<FormField
					control={form.control}
					name="known_hosts"
					render={({ field }) => (
						<FormItem className="md:col-span-2 gap-0">
							<FormLabel className="bg-black-dark py-3 px-2 m-0 text-left font-medium whitespace-nowrap">
								Known Hosts
							</FormLabel>
							<div className="border border-grey-700 p-2 pb-3">
								<FormDescription>
									Manage your known hosts here. When you add a SSH Key with a hostname of "github.com", we'll
									automatically attempt to resolve GitHub's known hosts for you.
								</FormDescription>
								<FormControl>
									<Textarea
										autoComplete="off"
										autoCapitalize="off"
										className="whitespace-nowrap"
										rows={10}
										{...field}
									/>
								</FormControl>
								<FormMessage />

								<Button
									type="submit"
									variant="submit"
									className="rounded-full mt-2"
									disabled={isPending || !form.formState.isDirty || !form.formState.isValid}
								>
									<Save /> {isPending ? 'Saving' : 'Save'} Known Hosts{isPending ? '...' : ''}
								</Button>
							</div>
						</FormItem>
					)}
				/>
			</form>
		</Form>
	);
}
