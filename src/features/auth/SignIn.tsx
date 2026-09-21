import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { EmailSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearch } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { useCloudSignIn } from './hooks/useCloudSignIn';
import { useLastUsedSignInMethod } from './hooks/useLastUsedSignInMethod';

const rememberControlClassName =
	'mx-auto mt-3 block text-xs text-muted-foreground underline hover:text-foreground dark:text-inherit dark:hover:text-blue-300';

export function SignIn() {
	const [showPassword, setShowPassword] = useState(false);
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
							<FormItem className="sign-in-field">
								<FormLabel>Email</FormLabel>
								<div className="sign-in-input">
									<FormControl>
										<Input
											type="email"
											placeholder="you@company.com"
											autoFocus={true}
											autoComplete="email"
											{...field}
										/>
									</FormControl>
									<Mail aria-hidden="true" className="sign-in-input-icon" />
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="sign-in-field">
								<FormLabel>Password</FormLabel>
								<div className="sign-in-input">
									<FormControl>
										<Input
											type={showPassword ? 'text' : 'password'}
											placeholder="Your password"
											autoComplete="current-password"
											{...field}
										/>
									</FormControl>
									<LockKeyhole aria-hidden="true" className="sign-in-input-icon" />
									<button
										type="button"
										className="sign-in-password-toggle"
										aria-label={showPassword ? 'Hide password' : 'Show password'}
										aria-pressed={showPassword}
										onClick={() => setShowPassword(value => !value)}
									>
										{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
									</button>
								</div>
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
