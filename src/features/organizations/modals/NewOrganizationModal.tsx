import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useCreateNewOrganizationMutation } from '@/features/organizations/hooks/useCreateNewOrganization';
import { NewOrganizationSchema } from '@/features/organizations/modals/newOrganizationSchema';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function NewOrganizationModal() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(NewOrganizationSchema),
		defaultValues: {
			name: '',
			subdomain: '',
		},
	});
	const name = form.watch('name');
	const subdomain = form.watch('subdomain');
	const calculatedNames = useMemo(() => {
		const suggestedSubdomain = collapseKebabsToMaxLength(
			toKebabCase(name),
			NewOrganizationSchema.shape.subdomain.maxLength!,
		) || 'your-subdomain';
		return {
			suggestedSubdomain,
			fullHostName: `future-cluster-names.${subdomain || suggestedSubdomain}.harperfabric.com`,
		};
	}, [name, subdomain]);

	const { mutate: submitNewOrganizationData, isPending } = useCreateNewOrganizationMutation();
	const queryClient = useQueryClient();

	const submitForm = useCallback(async (formData: z.infer<typeof NewOrganizationSchema>) => {
		submitNewOrganizationData({
			name: formData.name,
			subdomain: formData.subdomain || calculatedNames.suggestedSubdomain,
		}, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'active' });
				setIsModalOpen(false);
			},
		});
	}, [calculatedNames.suggestedSubdomain, queryClient, submitNewOrganizationData]);

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<Button variant="positive" className="rounded-full md:w-44 w-full" accessKey="n">
					<Plus /> <span><u>N</u>ew Organization</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[525px]">
				<DialogHeader>
					<DialogTitle>Create a New Organization</DialogTitle>
					<DialogDescription>Create a new organization here.</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-6 text-white">

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Name</FormLabel>
									<FormControl>
										<Input
											type="text"
											maxLength={NewOrganizationSchema.shape.name.maxLength!}
											autoCapitalize="words"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="subdomain"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Subdomain</FormLabel>
									<FormControl>
										<Input
											type="text"
											maxLength={NewOrganizationSchema.shape.subdomain.maxLength!}
											autoCapitalize="none"
											placeholder={calculatedNames.suggestedSubdomain}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormItem>
							<FormLabel className="pb-1">Full Host Name</FormLabel>
							<FormControl>
								<span>{calculatedNames.fullHostName}</span>
							</FormControl>
							<FormMessage />
						</FormItem>

						<DialogFooter>
							<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
								Create New Organization <ArrowRight />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
