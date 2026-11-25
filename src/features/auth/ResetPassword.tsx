import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { NewAccountPasswordSchema } from '@/lib/zod/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthInput } from './components/AuthInput';
import { useResetPasswordMutation } from './hooks/useResetPassword';
import { emailedFlowParam, keptSignInRedirectSearch } from './pendingSignInRedirect';

export function ResetPassword() {
	const { token: searchToken, flow: flowParam } = useSearch({ strict: false });
	// The app's router hands `token` over as the link spells it (`@/router/searchParams`).
	const token = typeof searchToken === 'string' && searchToken ? searchToken : undefined;
	const flow = emailedFlowParam(flowParam);
	const navigate = useNavigate();

	useEffect(() => {
		if (!token) {
			void navigate({ to: '/sign-in' });
		}
	}, [token, navigate]);

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

	const { mutate: submitResetPasswordData, isPending } = useResetPasswordMutation();

	const submitForm = useCallback(async (formData: { password: string; confirmPassword: string }) => {
		if (!token) {
			return;
		}
		submitResetPasswordData(
			{ token, password: formData.password },
			{
				onSuccess: (response) => {
					toast.success('Success', {
						description: 'Your password has been reset successfully.',
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					const email = typeof response?.email === 'string' && response.email ? response.email : undefined;
					navigate({
						to: '/sign-in',
						// As `?redirect=` too, so a Google or GitHub sign-in from there keeps it.
						search: keptSignInRedirectSearch(flow),
						state: { ...(email ? { prefillEmail: email } : {}), ...(flow ? { emailedFlow: flow } : {}) },
					});
				},
			},
		);
	}, [flow, navigate, submitResetPasswordData, token]);

	return (
		<div className="auth-form">
			<h1 className="text-2xl font-light">Reset Password</h1>
			<Form {...methods}>
				<form
					id="auth-reset-password-form"
					name="auth-reset-password-form"
					className="sign-in-form"
					onSubmit={handleSubmit(submitForm)}
				>
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="auth-field">
								<FormLabel>New Password</FormLabel>
								<AuthInput
									disabled={isPending}
									type="password"
									autoComplete="new-password"
									{...field}
									placeholder="Your new password"
									passwordLabel="new password"
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
									disabled={isPending}
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
					<Button variant="submit" type="submit" disabled={isPending} className="sign-in-submit">
						Submit New Password
					</Button>
				</form>
			</Form>
		</div>
	);
}
