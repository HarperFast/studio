import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { zodRequireEmail } from '@/lib/zod/email';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { KeyRound, LoaderCircle, MailCheck, MailWarning } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthHeading } from './components/AuthHeading';
import { AuthInput } from './components/AuthInput';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { OFFLINE_MESSAGE, OfflineSubmitError } from './failFastOffline';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';
import { isVerifyEmailUnconfirmed, useVerifyEmailMutation } from './hooks/useVerifyEmail';

// Claims no outcome: each of these can follow a verify that landed (`unansweredWrite.ts`).
const VERIFICATION_UNCONFIRMED_MESSAGE =
	"We couldn't confirm your email was verified. Your link still works, so try again in a minute.";

const VerifyEmailSchema = z.object({
	email: zodRequireEmail,
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
	const email = methods.watch('email');
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
				navigate({ to: '/sign-in', search: { me: email } });
			},
		});
	}, [email, navigate, submitResendEmailVerification]);

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

// No outcome: a central-manager that keeps the sign-up password when verifying.
function signsInNext(outcome: string | undefined): boolean {
	return outcome === undefined || outcome === 'password_set';
}

function VerifyingEmail() {
	return (
		<div className="auth-form">
			<AuthHeading icon={MailCheck} title="Verify Email" />
			<p role="status" className="auth-pending-message">
				<LoaderCircle aria-hidden="true" className="auth-loading-icon" />Verifying email...
			</p>
		</div>
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
			// A repeat visit: a reload, a second click, a mail scanner that opened the link first, or a retry
			// of a request whose answer was lost. The first visit may have replaced the password.
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

function SignInLinks() {
	return (
		<div className="auth-links">
			<Link className="text-sm" to="/sign-in">Back to sign in</Link>
			<Link className="text-sm" to="/forgot-password">Forgot password?</Link>
		</div>
	);
}

function VerifiedOutcome(props: { outcome: string | undefined; email: string | undefined }) {
	return (
		<div role="status" aria-live="polite" className="auth-form flex flex-col gap-4">
			<VerifiedCopy {...props} />
			<SignInLinks />
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
			<SignInLinks />
		</div>
	);
}

export function VerifyEmail() {
	const { token: searchToken } = useSearch({ strict: false });
	// central-manager's tokens are JWTs, which the router's JSON parse of search values leaves as strings.
	const token = typeof searchToken === 'string' && searchToken ? searchToken : undefined;
	const navigate = useNavigate();

	const { mutate: submitEmailVerificationToken, data, error, status } = useVerifyEmailMutation();
	const submittedToken = useRef<string | undefined>(undefined);

	const submitEmailToken = useCallback(
		(emailToken: string) => {
			submitEmailVerificationToken({ token: emailToken }, {
				onSuccess: (response) => {
					// Also skipped when the route dropped this token while its PUT was out.
					if (submittedToken.current !== emailToken || !signsInNext(response?.outcome)) {
						return;
					}
					toast.success('Success', {
						description: 'Email verified successfully',
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					void navigate({ to: '/sign-in' });
				},
			});
		},
		[submitEmailVerificationToken, navigate],
	);

	// Once per arrival of a token. StrictMode runs this twice in development, and the second PUT would
	// answer `already_verified` and replace the first answer, which may be the only word of a set-password
	// email. A token that comes back after another one or after none is sent again, and that answer is
	// explained.
	useEffect(() => {
		if (!token) {
			submittedToken.current = undefined;
		} else if (submittedToken.current !== token) {
			submittedToken.current = token;
			submitEmailToken(token);
		}
	}, [submitEmailToken, token]);

	if (token) {
		if (status === 'idle' || status === 'pending' || (status === 'success' && signsInNext(data?.outcome))) {
			return <VerifyingEmail />;
		}
		if (status === 'success') {
			return <VerifiedOutcome outcome={data?.outcome} email={data?.email} />;
		}
		if (isVerifyEmailUnconfirmed(error)) {
			return (
				<VerificationUnconfirmed
					offline={error instanceof OfflineSubmitError}
					onRetry={() => submitEmailToken(token)}
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
