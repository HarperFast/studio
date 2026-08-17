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
import { personNameRegex } from '@/lib/string/regex/personNameRegex';
import { clearUtmParamsFromUrl } from '@/lib/urls/clearUtmParams';
import { zodRequireEmail } from '@/lib/zod/email';
import { zodRequirePassword } from '@/lib/zod/password';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { MouseEvent, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { useCaptchaChallenge } from './hooks/useCaptchaChallenge';
import { useSignUpMutation } from './hooks/useSignUp';

const SignUpSchema = z.object({
	email: zodRequireEmail
		.max(80, { error: 'Email cannot be longer than 80 characters.' }),
	firstname: z
		.string()
		.trim()
		.min(2, { error: 'Please enter your first name.' })
		.regex(
			personNameRegex,
			{ error: 'First name can only contain letters, spaces, and hyphens.' },
		)
		.max(40, { error: 'First name cannot be longer than 40 characters.' }),
	lastname: z
		.string()
		.trim()
		.min(2, { error: 'Please enter your last name.' })
		.regex(
			personNameRegex,
			{ error: 'Last name can only contain letters, spaces, and hyphens.' },
		)
		.max(80, { error: 'Last name cannot be longer than 80 characters.' }),
	password: zodRequirePassword
		.min(8, { error: 'Password must be at least 8 characters long.' }),
	confirmPassword: z.string(),
	acceptTerms: z.boolean().refine(val => val === true, {
		message: 'You must accept the Privacy Policy and Terms of Service.',
	}),
})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'],
	});

export function SignUp() {
	const navigate = useNavigate();
	const { email: searchEmail, me: formPersistenceEmail } = useSearch({ strict: false });
	const [flashTerms, setFlashTerms] = useState(false);

	const methods = useForm({
		resolver: zodResolver(SignUpSchema),
		defaultValues: {
			firstname: '',
			lastname: '',
			email: formPersistenceEmail || searchEmail || '',
			password: '',
			confirmPassword: '',
			acceptTerms: false,
		},
	});

	const email = methods.watch('email');
	const acceptTerms = methods.watch('acceptTerms');
	const { setFocus, setError, clearErrors, control, handleSubmit, formState } = methods;
	const submitError = formState.errors.root?.message;

	useEffect(() => {
		setFocus('firstname');
	}, [setFocus]);

	const { mutate: submitSignUpData, isPending } = useSignUpMutation();
	const captcha = useCaptchaChallenge('signup');

	const submitForm = useCallback(async (formData: z.infer<typeof SignUpSchema>) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { confirmPassword, acceptTerms, ...userData } = formData;
		// Drop the previous attempt's failure explicitly — `handleSubmit` reruns the resolver,
		// which only rewrites field errors, so a stale `root` would outlive the retry.
		clearErrors('root');
		// Minted per submit: tokens are single use and expire in ~2 minutes.
		const captchaToken = await captcha.getToken();
		submitSignUpData({ ...userData, captchaToken }, {
			onSuccess: () => {
				const company = parseCompanyFromEmail(userData.email);
				reoClient?.identify?.({
					username: userData.email,
					type: 'email',
					firstname: userData.firstname,
					lastname: userData.lastname,
					...(company ? { company } : {}),
				});
				clearUtmParamsFromUrl();
				void navigate({ to: '/verifying?email=' + encodeURIComponent(userData.email) });
			},
			// The sign-up mutation opts out of the global error toast (meta.skipGlobalErrorToast)
			// and renders the failure in the form instead. RUM showed people resubmitting the
			// same details two and three times before giving up (#1612): a toast that fades,
			// away from the inputs, doesn't read as "this attempt failed". Deliberately status-
			// agnostic — it reports whatever the server said rather than mapping specific codes.
			onError: (error) => {
				console.error(error);
				// `message`, not `description`: the latter is the toast's body, with the first clause
				// of a "Conflict: …" style message moved out into the heading this has no room for.
				setError('root', {
					type: 'server',
					message: captcha.describeCaptchaError(error) ?? describeError(error).message,
				});
			},
		});
	}, [clearErrors, navigate, setError, submitSignUpData, captcha]);

	const onOAuthClick = useCallback((e: MouseEvent) => {
		if (!acceptTerms) {
			setFlashTerms(true);
			setTimeout(() => setFlashTerms(false), 1000);
			e.preventDefault();
			return false;
		}
	}, [acceptTerms]);

	const termsCheckbox = (
		<FormField
			control={control}
			name="acceptTerms"
			render={({ field }) => (
				<FormItem
					className={`flex flex-row items-start space-x-3 space-y-0 p-1 transition-colors duration-300 ${
						flashTerms ? 'bg-red-500/20 animate-pulse rounded' : ''
					}`}
				>
					<FormControl>
						<Input
							type="checkbox"
							className="size-4 rounded border-gray-300 bg-white text-purple-600 focus:ring-purple-500"
							checked={field.value}
							onChange={field.onChange}
						/>
					</FormControl>
					<div className="space-y-1 leading-none">
						<FormLabel className="text-xs font-normal">
							I accept the{' '}
							<a
								href="https://www.harper.fast/resources/privacy-policy"
								target="_blank"
								rel="noreferrer"
								className="underline hover:text-blue-300"
								aria-label="Privacy Policy (opens in new tab)"
							>
								Privacy Policy
							</a>{' '}
							and{' '}
							<a
								href="https://www.harper.fast/resources/paas-terms-of-service"
								target="_blank"
								rel="noreferrer"
								className="underline hover:text-blue-300"
								aria-label="Terms of Service (opens in new tab)"
							>
								Terms of Service
							</a>
						</FormLabel>
						<FormMessage />
					</div>
				</FormItem>
			)}
		/>
	);

	return (
		<div className="text-foreground dark:text-white w-xs">
			<h1 className="text-2xl font-light text-center">Sign up for Harper Fabric</h1>

			<Form {...methods}>
				<div className="flex flex-col gap-2 my-6">
					{termsCheckbox}
					<GoogleAuthenticationButton
						text="Sign up with Google"
						disabled={!acceptTerms}
						onClick={onOAuthClick}
					/>
					<GitHubAuthenticationButton
						text="Sign up with GitHub"
						disabled={!acceptTerms}
						onClick={onOAuthClick}
					/>
				</div>

				<hr className="border-gray-600" />

				<form
					id="auth-signup-form"
					name="auth-signup-form"
					onSubmit={handleSubmit(submitForm)}
					className="grid gap-4 my-4"
				>
					<FormField
						control={control}
						name="firstname"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">First Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										className="dark:bg-black dark:border-black"
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
										className="dark:bg-black dark:border-black"
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
										className="dark:bg-black dark:border-black"
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
										autoComplete="new-password"
										className="dark:bg-black dark:border-black"
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
										autoComplete="new-password"
										className="dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					{termsCheckbox}

					{submitError && (
						<p role="alert" data-slot="form-message" className="text-destructive text-sm">
							{submitError}
						</p>
					)}

					<Button type="submit" variant="submit" disabled={isPending || captcha.minting} className="w-full my-4">
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
