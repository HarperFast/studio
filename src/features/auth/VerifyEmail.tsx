import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { zodRequireEmail } from '@/lib/zod/email';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { LoaderCircle, MailCheck } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthHeading } from './components/AuthHeading';
import { AuthInput } from './components/AuthInput';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';
import { useVerifyEmailMutation, VerifyEmailToken } from './hooks/useVerifyEmail';

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

export function VerifyEmail() {
	const { token } = useSearch({ strict: false });
	const navigate = useNavigate();

	const { mutate: submitEmailVerificationToken, isPending } = useVerifyEmailMutation();

	const submitEmailToken = useCallback(
		(emailToken: VerifyEmailToken) => {
			submitEmailVerificationToken(emailToken, {
				onSuccess: () => {
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

	useEffect(() => {
		if (token) {
			submitEmailToken(token);
		}
	}, [submitEmailToken, token]);

	return (
		<div className="auth-form">
			<AuthHeading
				icon={MailCheck}
				title="Verify Email"
				subtitle={isPending ? undefined : 'Enter your email to receive a verification link.'}
			/>
			{!isPending ? <SendEmailVerification /> : (
				<p role="status" className="auth-pending-message">
					<LoaderCircle aria-hidden="true" className="auth-loading-icon" />Verifying email...
				</p>
			)}
		</div>
	);
}
