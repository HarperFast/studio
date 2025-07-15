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
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/react-query/constants';
import { useCreateNewOrganizationMutation } from '@/features/organizations/hooks/useCreateNewOrganization';
import { SchemaOrganization } from '@/lib/api.gen';

const NewOrganizationSchema = z.object({
	name: z
		.string({
			message: 'Please enter a cluster name.',
		})
		.max(30, {
			message: 'Cluster name must be less than 30 characters.',
		}),
	subdomain: z
		.string({
			message: 'Please enter a cluster prefix.',
		})
		.max(14, {
			message: 'Subdomain must be less than 14 characters.',
		}),
});

export function NewOrganizationModal() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(NewOrganizationSchema),
		defaultValues: {
			name: '',
			subdomain: '',
		},
	});

	const { mutate: submitNewOrganizationData } = useCreateNewOrganizationMutation();
	const queryClient = useQueryClient();

	const submitForm = async (formData: Omit<SchemaOrganization, "id">) => {
		submitNewOrganizationData(formData, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'active' });
				setIsModalOpen(false);
			},
		});
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<Button variant="positive" className="rounded-full md:w-44 w-full">
					<Plus /> New Organization
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
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
								<FormItem className="">
									<FormLabel className="pb-1">Organization Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="Harper Systems" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="subdomain"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Organization Subdomain</FormLabel>
									<FormControl>
										<Input type="text" placeholder="harper-dev" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" variant="submit" className="rounded-full">
								Create New Organization <ArrowRight />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
