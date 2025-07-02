import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useLocalSignIn } from '@/features/auth/hooks/useLocalSignIn';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthenticationContext } from '@/hooks/useAuthenticationContext';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient } from '@tanstack/react-query';

const LocalSignInSchema = z.object({
	username: z
		.string({
			message: 'Please enter the instance username.',
		})
		.max(75, { message: 'Email must be less than 75 characters' }),
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
	const { setUser } = useAuthenticationContext();

	const form = useForm<z.infer<typeof LocalSignInSchema>>({
		resolver: zodResolver(LocalSignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});

	const { mutate: submitLocalSignInCredentials } = useLocalSignIn();

	const submitForm = async (formData: z.infer<typeof LocalSignInSchema>) => {
		submitLocalSignInCredentials(formData, {
			onSuccess: async (data) => {
				setUser(data);
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
											type="text"
											placeholder="harpersys"
											className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
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
											className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
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
