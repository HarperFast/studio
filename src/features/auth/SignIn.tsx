import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useLoginMutation } from '@/features/auth/hooks/useSignIn';
import { reoClient } from '@/integrations/reo/reo';
import { authStore, OverallAppSignIn } from '@/lib/authStore';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const SignInSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address.',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address.' }),
	password: z
		.string({
			message: 'Please enter your password',
		})
		.min(1, { message: 'Password is required' })
		.max(50, { message: 'Password must be less than 50 characters' }),
});

export function SignIn() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { redirect } = useSearch({ strict: false });

	const form = useForm({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const { mutate: submitLoginData, isPending } = useLoginMutation();

	const submitForm = (formData: z.infer<typeof SignInSchema>) => {
		submitLoginData(formData, {
			onSuccess: async (data) => {
				authStore.setUserForEntity(OverallAppSignIn, data);
				const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(data);

				const company = parseCompanyFromEmail(data.email);
				if (company) {
					reoClient.identify({
						username: data.email,
						type: 'email',
						company,
					});
				}
				await queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'none' });
				router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : defaultCloudRoute });
			},
		});
	};

	return (
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign in to Harper Fabric</h2>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="my-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="my-4">
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										type="email"
										placeholder="jane.smith@harperdb.io"
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
								<FormLabel>Password</FormLabel>
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
					<Button type="submit" variant="submit" className="w-full my-2 rounded-full" disabled={isPending}>
						Sign In
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="text-sm" to="/sign-up">
					Sign up for free
				</Link>
				<Link className="text-sm" to="/forgot-password">
					Forgot password?
				</Link>
			</div>
		</div>
	);
}


