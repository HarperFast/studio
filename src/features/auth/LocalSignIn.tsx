import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useInstanceLoginMutation } from '@/features/auth/hooks/useInstanceLoginMutation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient } from '@tanstack/react-query';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { authStore, OverallAppSignIn } from '@/lib/authStore';
import { toast } from 'sonner';

const LocalSignInSchema = z.object({
	username: z
		.string({
			message: 'Please enter the instance username.',
		})
		.max(75, { message: 'Username must be less than 75 characters' }),
	password: z
		.string({
			message: 'Please enter your password',
		})
		.min(1, { message: 'Password is required' })
		.max(50, { message: 'Password must be less than 50 characters' }),
});

export function LocalSignIn() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { redirect } = useSearch({ strict: false });

	const form = useForm<z.infer<typeof LocalSignInSchema>>({
		resolver: zodResolver(LocalSignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});

	const { mutate: submitInstanceLogin } = useInstanceLoginMutation();

	const submitForm = async (formData: z.infer<typeof LocalSignInSchema>) => {
		submitInstanceLogin(formData, {
			onSuccess: async (response) => {
				toast.success(response.message);
				const user = await getInstanceUserInfo();
				authStore.setUserForEntity(OverallAppSignIn, user);
				await queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'none' });
				router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : '/browse' });
			},
		});
	};

	return (
		<div className="h-screen items-center justify-center flex">
			<div className="text-white w-xs">
				<h2 className="text-2xl font-light">Sign in to Harper Local</h2>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="my-4">
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem className="my-4">
									<FormLabel>Instance User</FormLabel>
									<FormControl>
										<Input
											autoComplete="username"
											type="text"
											placeholder="harpersys"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem className="my-4">
									<FormLabel>Instance Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder="password"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" variant="submit" className="w-full my-2 rounded-full">
							Sign In
						</Button>
					</form>
				</Form>
			</div>
		</div>
	);
}
