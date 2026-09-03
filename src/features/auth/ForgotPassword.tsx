import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { zodRequireEmail } from '@/lib/zod/email';
import { errorHandler } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SubmitErrorMessage } from './components/SubmitErrorMessage';
import { describeRetryableAuthFailure } from './describeAuthFailure';
import { useCaptchaChallenge } from './hooks/useCaptchaChallenge';
import { useForgotPasswordMutation } from './hooks/useForgotPassword';

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
	const { setFocus, setError, clearErrors, control, handleSubmit, formState } = methods;
	const submitError = formState.errors.root?.message;

	useEffect(() => {
		setFocus('email');
	}, [setFocus]);

	const { mutate: submitForgotPasswordData, isPending } = useForgotPasswordMutation();
	const captcha = useCaptchaChallenge('forgot_password');

	const submitForm = async (formData: z.infer<typeof ForgotPasswordSchema>) => {
		// Like SignUp: the resolver only rewrites field errors, so clear stale root.
		clearErrors('root');
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
					setError('root', { type: 'server', message: captchaMessage });
					return;
				}
				const retryableMessage = describeRetryableAuthFailure(error);
				if (retryableMessage) {
					// The RUM channel for a handled rejection; nothing else on this path reports it.
					console.error(error);
					setError('root', { type: 'server', message: retryableMessage });
					return;
				}
				errorHandler(error);
			},
		});
	};

	return (
		<div className="text-foreground dark:text-white w-xs">
			<h1 className="text-2xl font-light">Enter your account email</h1>
			<p className="text-sm pt-1">If a matching account exists, we'll send you a password reset link.</p>
			<Form {...methods}>
				<form
					id="auth-forgot-password-form"
					name="auth-forgot-password-form"
					onSubmit={handleSubmit(submitForm)}
					className="my-4"
				>
					<FormField
						control={control}
						name="email"
						render={({ field }) => (
							<FormItem className="my-2">
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										disabled={isPending}
										type="email"
										className="dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<SubmitErrorMessage message={submitError} suggestSupport={captcha.supportSuggested} />
					<Button type="submit" variant="submit" disabled={isPending || captcha.minting} className="w-full my-2">
						Send Password Reset Email
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
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
