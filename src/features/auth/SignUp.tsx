import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { zodRequireEmail } from '@/lib/zod/email';
import { zodRequirePassword } from '@/lib/zod/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { useSignUpMutation } from './hooks/useSignUp';

const SignUpSchema = z.object({
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
	const { email: searchEmail, me: formPersistenceEmail } = useSearch({ strict: false });
	const methods = useForm({
		resolver: zodResolver(SignUpSchema),
		defaultValues: {
			firstname: '',
			lastname: '',
			email: formPersistenceEmail || searchEmail || '',
			password: '',
			confirmPassword: '',
		},
	});

	const email = methods.watch('email');
	const { setFocus, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('firstname');
	}, [setFocus]);

	const { mutate: submitSignUpData } = useSignUpMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof SignUpSchema>) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { confirmPassword, ...userData } = formData;
		submitSignUpData(userData, {
			onSuccess: () => {
				const company = parseCompanyFromEmail(userData.email);
				reoClient?.identify?.({
					username: userData.email,
					type: 'email',
					firstname: userData.firstname,
					lastname: userData.lastname,
					...(company ? { company } : {}),
				});
				void navigate({ to: '/verifying?email=' + encodeURIComponent(userData.email) });
			},
		});
	}, [navigate, submitSignUpData]);

	return (
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign up for Harper Fabric</h2>

			<div className="flex flex-col gap-2 my-6">
				<GoogleAuthenticationButton text="Sign up with Google" />
				<GitHubAuthenticationButton text="Sign up with GitHub" />
			</div>

			<hr className="border-gray-600" />

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
										readOnly={!!searchEmail}
										disabled={!!searchEmail}
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
						the <a href="https://www.harper.fast/resources/privacy-policy" target="_blank" rel="noreferrer" className="underline hover:text-blue-300">
							Privacy Policy
						</a> and <a href="https://www.harper.fast/resources/terms-of-use" target="_blank" rel="noreferrer" className="underline hover:text-blue-300">
							Terms of Service
						</a></p>

					<Button type="submit" variant="submit" className="w-full rounded-full my-4">
						Sign Up For Free
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="m-auto text-sm hover:text-blue-300" to="/sign-in" search={{ me: email }}>
					Already have an account? Sign in instead.
				</Link>
			</div>
		</div>
	);
}
