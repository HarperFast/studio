import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { EmailSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearch } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { AuthInput } from './components/AuthInput';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { useCloudSignIn } from './hooks/useCloudSignIn';
import { useLastUsedSignInMethod } from './hooks/useLastUsedSignInMethod';

const rememberControlClassName =
	'mx-auto mt-3 block text-xs text-muted-foreground underline hover:text-foreground dark:text-inherit dark:hover:text-blue-300';

export function SignIn() {
	const { me: formPersistenceEmail } = useSearch({ strict: false });

	const methods = useForm({
		resolver: zodResolver(EmailSignInSchema),
		defaultValues: {
			email: formPersistenceEmail || '',
			password: '',
		},
	});
	const { handleSubmit, control } = methods;
	const email = methods.watch('email');

	const { submitForm, isPending, submitError, clearSubmitError } = useCloudSignIn();
	const { lastUsed, remember, recordMethod, disable, enable } = useLastUsedSignInMethod();

	return (
		<div className="auth-form fabric-sign-in">
			<h1>Welcome back</h1>
			<p className="sign-in-subtitle">Sign in to Harper Fabric</p>
			<Form {...methods}>
				<form
					id="auth-signin-form"
					name="auth-signin-form"
					onSubmit={handleSubmit(submitForm, clearSubmitError)}
					className="sign-in-form"
				>
					<FormField
						control={control}
						name="email"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Email</FormLabel>
								<AuthInput
									type="email"
									placeholder="you@company.com"
									autoFocus={true}
									autoComplete="email"
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
									placeholder="Your password"
									autoComplete="current-password"
									{...field}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<SubmitErrorMessage message={submitError} />
					<Button type="submit" variant="submit" className="sign-in-submit" disabled={isPending}>
						Sign In <ArrowRight aria-hidden="true" />
					</Button>
					<div className="sign-in-recovery">
						<Link to="/forgot-password" search={{ me: email }}>Forgot password?</Link>
					</div>
				</form>
			</Form>

			<div className="sign-in-divider">
				<span>or continue with</span>
			</div>

			<div className="sign-in-providers">
				<GoogleAuthenticationButton
					text="Sign in with Google"
					compact
					lastUsed={lastUsed === 'google'}
					onClick={() => recordMethod('google')}
				/>
				<GitHubAuthenticationButton
					text="Sign in with GitHub"
					compact
					lastUsed={lastUsed === 'github'}
					onClick={() => recordMethod('github')}
				/>
			</div>

			<p className="sign-in-signup">
				Don’t have an account? <Link to="/sign-up" search={{ me: email }}>Sign up for free</Link>
			</p>

			{remember
				? (
					lastUsed && (
						<button type="button" onClick={disable} className={rememberControlClassName}>
							On a shared device? Forget my sign-in method.
						</button>
					)
				)
				: (
					<button type="button" onClick={enable} className={rememberControlClassName}>
						Remember my last sign-in method on this device.
					</button>
				)}
		</div>
	);
}
