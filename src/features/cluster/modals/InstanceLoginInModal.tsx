import { toast } from 'sonner';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { InstanceLoginCredentials } from '@/features/instance/operations/mutations/readInstanceLogin';
import { useCluster } from '../hooks/useCluster';

const NewClusterSchema = z.object({
	username: z.string({
		message: 'Please enter a cluster name.',
	}),
	password: z.string({
		message: 'Please enter a cluster prefix.',
	}),
});

export function InstanceLogInModal({
	instanceUrl,
	port,
	instanceName,
}: {
	instanceId: string;
	instanceUrl: string;
	port: number;
	instanceName: string;
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(NewClusterSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});
	const clusterAuth = useCluster();

	const submitForm = async (formData: { username: string; password: string }) => {
		const updatedFormData = {
			instanceUrl,
			port, // Default port for HarperDB instances
			...formData,
		} as InstanceLoginCredentials;
		try {
			const response = await clusterAuth.login(updatedFormData);
			setIsModalOpen(false);
			if (response.success) {
				toast.success(`${response.message}`);
			} else {
				toast.error(`Failed to log in: ${response.message}`);
			}
			form.reset();
		} catch (error) {
			toast.error(`Error: ${error}`);
			return;
		}
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<Button variant="positive" className="rounded-full md:w-44">
					Log In
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Enter Credentials</DialogTitle>
					<DialogDescription>
						Log into instance <strong>{instanceName}</strong>
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-6 text-white">
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Username</FormLabel>
									<FormControl>
										<Input type="text" placeholder="harpersys" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Password</FormLabel>
									<FormControl>
										<Input type="password" placeholder="password" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" variant="submit" className="rounded-full">
								Log In to Instance <ArrowRight />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
