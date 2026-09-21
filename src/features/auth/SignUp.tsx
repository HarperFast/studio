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
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { MouseEvent, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthInput } from './components/AuthInput';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { describeAuthFailure } from './describeAuthFailure';
import { useCaptchaChallenge } from './hooks/useCaptchaChallenge';
import { useSignUpMutation } from './hooks/useSignUp';

// The account may already exist: sending them to the inbox beats a resubmit that 409s (#1668).
const SIGN_UP_OUTCOME_UNKNOWN_RECOVERY = 'Check your email for a verification link before signing up again.';

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
		// Only reached on a valid submit, so a failure the resolver rejects keeps the previous one on
		// screen — #1677, reproduced by this form's own test. An `onInvalid` handler does not fix it.
		clearErrors('root');
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
			// away from the inputs, doesn't read as "this attempt failed".
			onError: (error) => {
				// `message`, not `description`: the latter is the toast's body, with the first clause
				// of a "Conflict: …" style message moved out into the heading this has no room for.
				setError('root', {
					type: 'server',
					message: captcha.describeCaptchaError(error)
						?? describeAuthFailure(error, SIGN_UP_OUTCOME_UNKNOWN_RECOVERY),
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
		<div className="auth-form">
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
					className="sign-in-form"
				>
					<FormField
						control={control}
						name="firstname"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>First Name</FormLabel>
								<AuthInput
									type="text"
									autoCapitalize="words"
									{...field}
									placeholder="Your first name"
									autoComplete="given-name"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="lastname"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Last Name</FormLabel>
								<AuthInput
									type="text"
									autoCapitalize="words"
									{...field}
									placeholder="Your last name"
									autoComplete="family-name"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="email"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Email</FormLabel>
								<AuthInput
									type="email"
									placeholder="you@company.com"
									readOnly={!!searchEmail}
									disabled={!!searchEmail}
									autoComplete="email"
									autoCapitalize="none"
									{...field}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Password</FormLabel>
								<AuthInput
									type="password"
									autoComplete="new-password"
									{...field}
									placeholder="Your password"
									passwordLabel="password"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="confirmPassword"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Confirm Password</FormLabel>
								<AuthInput
									type="password"
									autoComplete="new-password"
									{...field}
									placeholder="Confirm your password"
									passwordLabel="password confirmation"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					{termsCheckbox}

					<SubmitErrorMessage message={submitError} suggestSupport={captcha.supportSuggested} />

					<Button type="submit" variant="submit" disabled={isPending || captcha.minting} className="sign-in-submit">
						Sign Up For Free
					</Button>
				</form>
			</Form>
			<div className="auth-links">
				<Link className="m-auto text-sm hover:text-blue-300" to="/sign-in" search={{ me: email }}>
					Already have an account? Sign in instead.
				</Link>
			</div>
		</div>
	);
}
