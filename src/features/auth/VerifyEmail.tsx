import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { fetchCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { zodRequireEmail } from '@/lib/zod/email';
import { NewAccountPasswordSchema, zodRequirePassword } from '@/lib/zod/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { KeyRound, LoaderCircle, MailCheck, MailWarning } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthHeading } from './components/AuthHeading';
import { AuthInput } from './components/AuthInput';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { describeAuthFailure } from './describeAuthFailure';
import { OFFLINE_MESSAGE, OfflineSubmitError, reportAuthFailure } from './failFastOffline';
import { useCompleteCloudSignIn, useLoginMutation } from './hooks/useCloudSignIn';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';
import {
	isVerifyEmailUnconfirmed,
	useVerifyEmailMutation,
	VerifyEmailRequest,
	VerifyEmailResponse,
} from './hooks/useVerifyEmail';
import { clearSignUpBrowserProof, readNewestSignUpBrowserProof, readSignUpBrowserProofFor } from './signUpBrowserProof';

// Claims no outcome: each of these can follow a verify that landed (`unansweredWrite.ts`).
const VERIFICATION_UNCONFIRMED_MESSAGE =
	"We couldn't confirm your email was verified. Your link still works, so try again in a minute.";
const PASSWORD_MISMATCH_MESSAGE = "That isn't the password you chose when you signed up.";

const VerifyEmailSchema = z.object({
	email: zodRequireEmail,
});

const SignUpPasswordSchema = z.object({
	password: zodRequirePassword,
});

function SendEmailVerification() {
	const navigate = useNavigate();
	const { mutate: submitResendEmailVerification, isPending } = useResendEmailVerification();
	const methods = useForm({
		resolver: zodResolver(VerifyEmailSchema),
		defaultValues: {
			email: '',
		},
	});
	const { setFocus, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('email');
	}, [setFocus]);

	const submitForm = useCallback(async (formData: z.infer<typeof VerifyEmailSchema>) => {
		submitResendEmailVerification(formData, {
			onSuccess: (message) => {
				toast.success('Success', {
					description: `${message}`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				navigate({ to: '/sign-in', state: { prefillEmail: formData.email } });
			},
		});
	}, [navigate, submitResendEmailVerification]);

	return (
		<Form {...methods}>
			<form
				id="auth-verify-email-form"
				name="auth-verify-email-form"
				onSubmit={handleSubmit(submitForm)}
				className="sign-in-form"
			>
				<FormField
					control={control}
					name="email"
					render={({ field }) => (
						<FormItem className="auth-field">
							<FormLabel>Email</FormLabel>
							<AuthInput
								disabled={isPending}
								type="email"
								autoComplete="email"
								placeholder="you@company.com"
								{...field}
							/>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button type="submit" variant="submit" disabled={isPending} className="sign-in-submit">
					Send Verification Email
				</Button>
			</form>
		</Form>
	);
}

type Submission = 'browserProof' | 'password' | 'newPassword';

function submissionOf(request: VerifyEmailRequest | undefined): Submission | undefined {
	if (!request) {
		return undefined;
	}
	if (request.newPassword !== undefined) {
		return 'newPassword';
	}
	return request.password !== undefined ? 'password' : 'browserProof';
}

function opensSession(response: VerifyEmailResponse): boolean {
	return (response.outcome === 'verified' || response.outcome === 'password_set') && response.signedIn === true;
}

function Pending({ message }: { message: string }) {
	return (
		<div className="auth-form">
			<AuthHeading icon={MailCheck} title="Verify Email" />
			<p role="status" className="auth-pending-message">
				<LoaderCircle aria-hidden="true" className="auth-loading-icon" />
				{message}
			</p>
		</div>
	);
}

// The hidden field lets a password manager match the password to its account.
function SignedUpAs({ email }: { email: string | undefined }) {
	if (!email) {
		return null;
	}
	return (
		<>
			<p className="text-sm">
				Signed up as <strong>{email}</strong>
			</p>
			<input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
		</>
	);
}

function EnterSignUpPassword({ email, pending, mismatch, onSubmit, onChooseNewPassword }: {
	email: string | undefined;
	pending: boolean;
	mismatch: boolean;
	onSubmit: (password: string) => void;
	onChooseNewPassword: () => void;
}) {
	const methods = useForm({
		resolver: zodResolver(SignUpPasswordSchema),
		defaultValues: {
			password: '',
		},
	});
	const { setFocus, setError, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('password');
	}, [setFocus]);

	useEffect(() => {
		if (mismatch) {
			setError('password', { type: 'server', message: PASSWORD_MISMATCH_MESSAGE }, { shouldFocus: true });
		}
	}, [mismatch, setError]);

	return (
		<div className="auth-form">
			<AuthHeading icon={KeyRound} title="Verify Email" subtitle="Enter the password you chose when you signed up." />
			<Form {...methods}>
				<form
					id="auth-verify-email-password-form"
					name="auth-verify-email-password-form"
					onSubmit={handleSubmit(({ password }) => onSubmit(password))}
					className="sign-in-form"
				>
					<SignedUpAs email={email} />
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>Password</FormLabel>
								<AuthInput
									disabled={pending}
									type="password"
									autoComplete="current-password"
									placeholder="Your password"
									{...field}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" variant="submit" disabled={pending} className="sign-in-submit">
						Verify Email
					</Button>
				</form>
			</Form>
			<div className="auth-links">
				<button type="button" className="auth-link-button" disabled={pending} onClick={onChooseNewPassword}>
					Forgot it? Choose a new password
				</button>
			</div>
		</div>
	);
}

function ChooseNewPassword({ email, pending, onSubmit, onEnterPassword }: {
	email: string | undefined;
	pending: boolean;
	onSubmit: (newPassword: string) => void;
	onEnterPassword: () => void;
}) {
	const methods = useForm({
		resolver: zodResolver(NewAccountPasswordSchema),
		defaultValues: {
			password: '',
			confirmPassword: '',
		},
	});
	const { setFocus, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('password');
	}, [setFocus]);

	return (
		<div className="auth-form">
			<AuthHeading
				icon={KeyRound}
				title="Choose a new password"
				subtitle="It replaces the password you chose when you signed up."
			/>
			<Form {...methods}>
				<form
					id="auth-verify-email-new-password-form"
					name="auth-verify-email-new-password-form"
					onSubmit={handleSubmit(({ password }) => onSubmit(password))}
					className="sign-in-form"
				>
					<SignedUpAs email={email} />
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>New Password</FormLabel>
								<AuthInput
									disabled={pending}
									type="password"
									autoComplete="new-password"
									placeholder="Your new password"
									passwordLabel="new password"
									{...field}
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
									disabled={pending}
									type="password"
									autoComplete="new-password"
									placeholder="Confirm your new password"
									passwordLabel="password confirmation"
									{...field}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" variant="submit" disabled={pending} className="sign-in-submit">
						Set Password and Verify
					</Button>
				</form>
			</Form>
			<div className="auth-links">
				<button type="button" className="auth-link-button" disabled={pending} onClick={onEnterPassword}>
					Remember it? Enter your password instead
				</button>
			</div>
		</div>
	);
}

function VerifyWithPassword({ email, pending, mismatch, onSubmit }: {
	email: string | undefined;
	pending: boolean;
	/** The `password_mismatch` answer, by identity, so one the user moved on from isn't shown again. */
	mismatch: VerifyEmailResponse | undefined;
	onSubmit: (credential: Pick<VerifyEmailRequest, 'password' | 'newPassword'>) => void;
}) {
	const [choosingNewPassword, setChoosingNewPassword] = useState(false);
	const [dismissedMismatch, setDismissedMismatch] = useState<VerifyEmailResponse>();
	return choosingNewPassword
		? (
			<ChooseNewPassword
				email={email}
				pending={pending}
				onSubmit={(newPassword) => onSubmit({ newPassword })}
				onEnterPassword={() => setChoosingNewPassword(false)}
			/>
		)
		: (
			<EnterSignUpPassword
				email={email}
				pending={pending}
				mismatch={!!mismatch && mismatch !== dismissedMismatch}
				onSubmit={(password) => onSubmit({ password })}
				onChooseNewPassword={() => {
					setDismissedMismatch(mismatch);
					setChoosingNewPassword(true);
				}}
			/>
		);
}

function VerifiedCopy({ outcome, email }: { outcome: string | undefined; email: string | undefined }) {
	switch (outcome) {
		case 'reset_email_sent':
			return (
				<>
					<AuthHeading icon={MailCheck} title="Email verified" subtitle="Check your inbox to set your password." />
					<p>
						For your security, the password you chose when signing up has been replaced. We sent a link to set a new one
						to {email ? <strong>{email}</strong> : 'your email'}.
					</p>
					<p>Open that link, choose a new password, then sign in with it.</p>
				</>
			);
		case 'already_verified':
			// A repeat visit: a reload, a second click, or a retry of a request whose answer was lost. The first
			// visit may have replaced the password.
			return (
				<>
					<AuthHeading icon={MailCheck} title="Already verified" subtitle="Your email is already verified." />
					<p>
						If we emailed you a link to set your password, use it before signing in. If your password doesn't work, use
						Forgot Password.
					</p>
				</>
			);
		case 'password_reset_required':
			return (
				<>
					<AuthHeading icon={KeyRound} title="Email verified" subtitle="Set a new password to sign in." />
					<p>
						For your security, the password you chose when signing up has been replaced, but we couldn't send you a link
						to set a new one. Use Forgot Password to get one.
					</p>
				</>
			);
		default:
			// An outcome this build doesn't know: say only what every outcome has in common.
			return (
				<>
					<AuthHeading icon={MailCheck} title="Email verified" />
					<p>If your password doesn't work when you sign in, use Forgot Password to set a new one.</p>
				</>
			);
	}
}

function SignInLinks({ email }: { email: string | undefined }) {
	const state = email ? { prefillEmail: email } : undefined;
	return (
		<div className="auth-links">
			<Link className="text-sm" to="/sign-in" state={state}>Back to sign in</Link>
			<Link className="text-sm" to="/forgot-password" state={state}>Forgot password?</Link>
		</div>
	);
}

function VerifiedOutcome(props: { outcome: string | undefined; email: string | undefined }) {
	return (
		<div role="status" aria-live="polite" className="auth-form flex flex-col gap-4">
			<VerifiedCopy {...props} />
			<SignInLinks email={props.email} />
		</div>
	);
}

// Verified, but this page couldn't sign them in: central-manager didn't open a session (Harper staff sign in
// with Google), or Studio couldn't pick it up.
function SignInToContinue({ email, passwordSet, newPasswordIgnored, signInError }: {
	email: string;
	passwordSet?: boolean;
	newPasswordIgnored?: boolean;
	signInError?: string;
}) {
	const navigate = useNavigate();
	return (
		<div role="status" aria-live="polite" className="auth-form flex flex-col gap-4">
			<AuthHeading
				icon={MailCheck}
				title="Email verified"
				subtitle={passwordSet ? 'Sign in with your new password.' : 'Sign in to continue.'}
			/>
			{newPasswordIgnored && (
				<p>
					We couldn't save your new password, so sign in with the one you chose when you signed up. If you don't
					remember it, use Forgot Password.
				</p>
			)}
			<SubmitErrorMessage message={signInError} />
			<Button
				type="button"
				variant="submit"
				className="sign-in-submit"
				onClick={() => void navigate({ to: '/sign-in', state: { prefillEmail: email } })}
			>
				Sign In
			</Button>
			<div className="auth-links">
				<Link className="text-sm" to="/forgot-password" state={{ prefillEmail: email }}>
					Forgot password?
				</Link>
			</div>
		</div>
	);
}

function VerificationUnconfirmed({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
	return (
		<div className="auth-form flex flex-col gap-4">
			<AuthHeading icon={MailWarning} title="Verify Email" />
			<SubmitErrorMessage message={offline ? OFFLINE_MESSAGE : VERIFICATION_UNCONFIRMED_MESSAGE} />
			<Button type="button" variant="submit" className="sign-in-submit" onClick={onRetry}>
				Try again
			</Button>
			<SignInLinks email={undefined} />
		</div>
	);
}

function toastVerified() {
	toast.success('Success', {
		description: 'Email verified successfully',
		action: {
			label: 'Dismiss',
			onClick: () => toast.dismiss(),
		},
	});
}

export function VerifyEmail() {
	const { token: searchToken } = useSearch({ strict: false });
	// central-manager's tokens are JWTs, which the router's JSON parse of search values leaves as strings.
	const token = typeof searchToken === 'string' && searchToken ? searchToken : undefined;

	const { mutate: submitVerification, data, error, status, variables, reset } = useVerifyEmailMutation();
	const { mutate: logIn } = useLoginMutation();
	const completeSignIn = useCompleteCloudSignIn();
	const submittedToken = useRef<string | undefined>(undefined);
	// Bumped by every submit and every change of link, so a late answer can tell it has been superseded.
	const attempt = useRef(0);
	const mounted = useRef(false);
	const [sessionLost, setSessionLost] = useState(false);
	const [signInError, setSignInError] = useState<string>();
	// The link's account, from central-manager's answer: a stored proof may be another sign-up's.
	const [accountEmail, setAccountEmail] = useState<string>();
	const [retrying, setRetrying] = useState(false);
	const proof = useMemo(() => (token ? readNewestSignUpBrowserProof() : null), [token]);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const isCurrent = useCallback((id: number) => mounted.current && attempt.current === id, []);

	const enterApp = useCallback(async (id: number, user: User) => {
		let entered = false;
		try {
			toastVerified();
			entered = await completeSignIn(user);
		} catch (error) {
			if (isCurrent(id)) {
				reportAuthFailure(error);
			}
		}
		if (!entered && isCurrent(id)) {
			setSessionLost(true);
		}
	}, [completeSignIn, isCurrent]);

	const pickUpSession = useCallback(async (id: number, userId: string, authUnchanged: () => boolean) => {
		let user;
		try {
			// `fetchCurrentUser`, which writes nothing to the store until the checks below pass.
			user = await fetchCurrentUser();
		} catch (error) {
			if (isCurrent(id)) {
				reportAuthFailure(error);
				setSessionLost(true);
			}
			return;
		}
		if (!isCurrent(id)) {
			return;
		}
		// Another tab can sign this browser into someone else between the verify and this request.
		if (authUnchanged() && user.id === userId) {
			await enterApp(id, user);
		} else {
			setSessionLost(true);
		}
	}, [enterApp, isCurrent]);

	const submit = useCallback(
		(request: VerifyEmailRequest) => {
			const id = ++attempt.current;
			// Read before sending: a sign-out or another sign-in while the request is out supersedes its answer.
			const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
			const signInRevision = authStore.getSignInRevision(OverallAppSignIn);
			const authUnchanged = () =>
				authStore.getSignOutGeneration(OverallAppSignIn) === signOutGeneration
				&& authStore.getSignInRevision(OverallAppSignIn) === signInRevision;
			setSessionLost(false);
			setSignInError(undefined);
			const onSuccess = (sent: VerifyEmailRequest, response: VerifyEmailResponse) => {
				if (!isCurrent(id)) {
					return;
				}
				setAccountEmail(response.email);
				const own = readSignUpBrowserProofFor(response.email);
				if (
					response.outcome === 'password_required' && sent.browserProof !== undefined && own
					&& own.proof !== sent.browserProof
				) {
					const retry = { token: sent.token, browserProof: own.proof };
					submitVerification(retry, { onSuccess: (answer) => onSuccess(retry, answer) });
					return;
				}
				clearSignUpBrowserProof(response.email);
				if (!authUnchanged()) {
					setSessionLost(true);
				} else if (opensSession(response)) {
					void pickUpSession(id, response.userId, authUnchanged);
				} else if (response.outcome === undefined && sent.password !== undefined) {
					// A central-manager without #781's change verified on the token alone, and opens no session.
					logIn({ email: response.email, password: sent.password }, {
						onSuccess: (user) => {
							if (!isCurrent(id)) {
								return;
							}
							if (authUnchanged()) {
								void enterApp(id, user);
							} else {
								setSessionLost(true);
							}
						},
						onError: (loginError) => {
							if (isCurrent(id)) {
								setSignInError(describeAuthFailure(loginError, 'Try signing in again.'));
							}
						},
					});
				}
			};
			submitVerification(request, { onSuccess: (response) => onSuccess(request, response) });
		},
		[enterApp, isCurrent, logIn, pickUpSession, submitVerification],
	);

	// Once per arrival of a token, and only with this browser's sign-up proof: a mail scanner opening the link
	// has none, and must not verify the email for whoever chose the password. StrictMode runs this twice in
	// development, and the second PUT would answer `already_verified` and replace the first answer. A token
	// that comes back after another one or after none is handled again.
	useEffect(() => {
		if (submittedToken.current === token) {
			return;
		}
		attempt.current++;
		submittedToken.current = token;
		if (token) {
			setAccountEmail(undefined);
			setRetrying(false);
			if (proof) {
				submit({ token, browserProof: proof.proof });
			} else {
				clearSignUpBrowserProof(undefined);
				reset();
			}
		}
	}, [proof, reset, submit, token]);

	if (token) {
		const submission = submissionOf(variables);
		const passwordForm = (pending: boolean, mismatch?: VerifyEmailResponse) => (
			<VerifyWithPassword
				key={token}
				email={accountEmail}
				pending={pending}
				mismatch={mismatch}
				onSubmit={(credential) => {
					setRetrying(false);
					submit({ token, ...credential });
				}}
			/>
		);

		if (status === 'idle') {
			return proof ? <Pending message="Verifying email..." /> : passwordForm(false);
		}
		if (status === 'pending') {
			return submission === 'browserProof' || retrying
				? <Pending message="Verifying email..." />
				: passwordForm(true);
		}
		if (status === 'success') {
			const { outcome, email } = data;
			if (outcome === 'password_required' || outcome === 'password_mismatch') {
				return passwordForm(false, outcome === 'password_mismatch' ? data : undefined);
			}
			if (outcome === 'verified' || outcome === 'password_set') {
				return opensSession(data) && !sessionLost
					? <Pending message="Signing you in..." />
					: <SignInToContinue email={email} passwordSet={outcome === 'password_set'} />;
			}
			if (outcome === undefined) {
				return submission === 'password' && !signInError && !sessionLost
					? <Pending message="Signing you in..." />
					: (
						<SignInToContinue
							email={email}
							newPasswordIgnored={submission === 'newPassword'}
							signInError={signInError}
						/>
					);
			}
			return <VerifiedOutcome outcome={outcome} email={email} />;
		}
		if (isVerifyEmailUnconfirmed(error) && variables) {
			return (
				<VerificationUnconfirmed
					offline={error instanceof OfflineSubmitError}
					onRetry={() => {
						setRetrying(true);
						submit(variables);
					}}
				/>
			);
		}
	}

	return (
		<div className="auth-form">
			<AuthHeading icon={MailCheck} title="Verify Email" subtitle="Enter your email to receive a verification link." />
			<SendEmailVerification />
		</div>
	);
}
