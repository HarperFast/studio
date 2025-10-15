import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useSignUpMutation } from '@/features/auth/hooks/useSignUp';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { zodRequireEmail } from '@/lib/zod/email';
import { zodRequirePassword } from '@/lib/zod/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const SignInSchema = z.object({
	email: zodRequireEmail
		.max(80, { error: 'Email cannot be longer than 80 characters.' }),
	firstname: z
		.string()
		.trim()
		.min(2, { error: 'Please enter your first name.' })
		.max(40, { error: 'First name cannot be longer than 40 characters.' }),
	lastname: z
		.string()
		.trim()
		.min(2, { error: 'Please enter your last name.' })
		.max(80, { error: 'Last name cannot be longer than 80 characters.' }),
	password: zodRequirePassword
		.min(8, { error: 'Password must be at least 8 characters long.' }),
	confirmPassword: z.string(),
})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'],
	});

export function SignUp() {
	const navigate = useNavigate();
	const { email } = useSearch({ strict: false });
	const methods = useForm({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			firstname: '',
			lastname: '',
			email: email || '',
			password: '',
			confirmPassword: '',
		},
	});
	const { setFocus, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('firstname');
	}, [setFocus]);

	const { mutate: submitSignUpData } = useSignUpMutation();

	const submitForm = async (formData: z.infer<typeof SignInSchema>) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { confirmPassword, ...userData } = formData;
		submitSignUpData(userData, {
			onSuccess: () => {
				toast.success('Success', {
					duration: 60_000,
					description: 'Your account has been created! Please check your email to finish activating your' +
						' account.',
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				const company = parseCompanyFromEmail(userData.email);
				reoClient?.identify?.({
					username: userData.email,
					type: 'email',
					firstname: userData.firstname,
					lastname: userData.lastname,
					...(company ? { company } : {}),
				});
				navigate({ to: '/sign-in' });
			},
		});
	};

	return (
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign up for Harper Fabric</h2>
			<Form {...methods}>
				<form onSubmit={handleSubmit(submitForm)} className="grid gap-4 my-4">
					<FormField
						control={control}
						name="firstname"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">First Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										autoCapitalize="words"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="lastname"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Last Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										autoCapitalize="words"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Email</FormLabel>
								<FormControl>
									<Input
										type="email"
										readOnly={!!email}
										disabled={!!email}
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										autoComplete="email"
										autoCapitalize="none"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="confirmPassword"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Confirm Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<p className="text-xs">By creating an account, you agree to
						the <a rel="noopener" href="https://www.harper.fast/resources/privacy-policy" target="_blank" className="underline hover:text-blue-300">
							Privacy Policy
						</a> and <a rel="noopener" href="https://www.harper.fast/resources/terms-of-use" target="_blank" className="underline hover:text-blue-300">
							Terms of Service
						</a></p>

					<Button type="submit" variant="submit" className="w-full my-2 rounded-full">
						Sign Up For Free
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="m-auto text-sm hover:text-blue-300" to="/sign-in">
					Already have an account? Sign in instead.
				</Link>
			</div>
		</div>
	);
}


