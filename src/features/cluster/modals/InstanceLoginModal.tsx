import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
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
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useCallback, useState } from 'react';
import { useInstanceLoginMutation } from '@/features/auth/hooks/useInstanceLoginMutation';
import { authStore } from '@/lib/authStore';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';
import { Instance } from '@/lib/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

const InstanceLoginSchema = z.object({
	username: z.string({
		message: 'Please enter your instance username.',
	}),
	password: z.string({
		message: 'Please enter your instance password.',
	}),
});

export function InstanceLogInModal({ instance }: { readonly instance: Instance; }) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const operationsUrl = getOperationsUrlForInstance(instance);
	const form = useForm({
		resolver: zodResolver(InstanceLoginSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});
	const { mutate: submitInstanceLogin } = useInstanceLoginMutation();

	// TODO: We'll want to be able to redirect the user to this page if they access an instance page without being
	//  signed into it (with a nice redirect, ideally). So we'll want it to be a whole page I think.
	const submitForm = useCallback((formData: z.infer<typeof InstanceLoginSchema>) => {
		submitInstanceLogin({
			...formData,
			operationsUrl,
		}, {
			onSuccess: async (response) => {
				toast.success(response.message);
				const user = await getUserInfo({ operationsUrl });
				authStore.setUserForEntity(instance, user);
				setIsModalOpen(false);
				form.reset();
				// TODO: jump to the instance browse page, or a redirect
				//  await navigate({ to: redirect?.startsWith('/') ? redirect : '/browse' });
			},
			onError: (error) => {
				toast.error(`Failed to log in: ${error}`);
			},
		});
	}, [submitInstanceLogin, operationsUrl, instance, form]);

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
						Log into instance <strong>{instance.name}</strong>
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
