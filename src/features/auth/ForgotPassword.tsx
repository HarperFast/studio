import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { zodRequireEmail } from '@/lib/zod/email';
import { errorHandler } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthInput } from './components/AuthInput';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { describeRetryableAuthFailure } from './describeAuthFailure';
import { useCaptchaChallenge } from './hooks/useCaptchaChallenge';
import { useForgotPasswordMutation } from './hooks/useForgotPassword';

// The link may already be on its way: sending them to the inbox beats a duplicate request.
const OUTCOME_UNKNOWN_RECOVERY = 'Check your inbox before requesting another link.';

const ForgotPasswordSchema = z.object({
	email: zodRequireEmail,
});

export function ForgotPassword() {
	const navigate = useNavigate();
	const { me: formPersistenceEmail } = useSearch({ strict: false });
	const methods = useForm({
		resolver: zodResolver(ForgotPasswordSchema),
		defaultValues: {
			email: formPersistenceEmail || '',
		},
	});
	const email = methods.watch('email');
	const { setFocus, control, handleSubmit } = methods;
	// Outside react-hook-form, like SignIn: a `root` error survives a resubmit the resolver rejects
	// (#1677), and this form now routes far more than CAPTCHA rejections here.
	const [submitError, setSubmitError] = useState<string>();
	const clearSubmitError = useCallback(() => setSubmitError(undefined), []);

	useEffect(() => {
		setFocus('email');
	}, [setFocus]);

	const { mutate: submitForgotPasswordData, isPending } = useForgotPasswordMutation();
	const captcha = useCaptchaChallenge('forgot_password');

	const submitForm = async (formData: z.infer<typeof ForgotPasswordSchema>) => {
		setSubmitError(undefined);
		const captchaToken = await captcha.getToken();
		submitForgotPasswordData({ ...formData, captchaToken }, {
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
			onError: (error) => {
				const captchaMessage = captcha.describeCaptchaError(error);
				if (captchaMessage) {
					setSubmitError(captchaMessage);
					return;
				}
				const retryableMessage = describeRetryableAuthFailure(error, OUTCOME_UNKNOWN_RECOVERY);
				if (retryableMessage) {
					// The RUM channel for a handled rejection; nothing else on this path reports it.
					console.error(error);
					setSubmitError(retryableMessage);
					return;
				}
				errorHandler(error);
			},
		});
	};

	return (
		<div className="auth-form">
			<h1 className="text-2xl font-light">Enter your account email</h1>
			<p className="text-sm pt-1">If a matching account exists, we'll send you a password reset link.</p>
			<Form {...methods}>
				<form
					id="auth-forgot-password-form"
					name="auth-forgot-password-form"
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
					<SubmitErrorMessage message={submitError} suggestSupport={captcha.supportSuggested} />
					<Button type="submit" variant="submit" disabled={isPending || captcha.minting} className="sign-in-submit">
						Send Password Reset Email
					</Button>
				</form>
			</Form>
			<div className="auth-links">
				<Link className="text-sm hover:text-blue-300" to="/sign-in" search={{ me: email }}>
					Sign in to your account
				</Link>
				<Link className="text-sm hover:text-blue-300" to="/sign-up" search={{ me: email }}>
					Sign up for free
				</Link>
			</div>
		</div>
	);
}
