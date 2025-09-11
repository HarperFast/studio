import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useVerifyEmailMutation, VerifyEmailToken } from '@/features/auth/hooks/useVerifyEmail';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';

const VerifyEmailSchema = z.object({
	email: z
		.email({
			error: 'Please enter a valid email address.',
		})
		.max(75, { error: 'Email cannot be longer than 75 characters.' }),
});

function SendEmailVerification() {
	const navigate = useNavigate();
	const { mutate: submitResendEmailVerification, isPending } = useResendEmailVerification();
	const form = useForm({
		resolver: zodResolver(VerifyEmailSchema),
		defaultValues: {
			email: '',
		},
	});

	const submitForm = async (formData: z.infer<typeof VerifyEmailSchema>) => {
		submitResendEmailVerification(formData, {
			onSuccess: (message) => {
				toast.success('Success', {
					description: `${message}`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				navigate({ to: '/sign-in' });
			},
		});
	};

	return (
		<Form {...form}>
			<p className="text-sm py-2">Please Enter an Email</p>
			<form onSubmit={form.handleSubmit(submitForm)} className="my-4">
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem className="my-2">
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input
									disabled={isPending}
									type="email"
									placeholder="jane.doe@harperdb.io"
									className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button type="submit" variant="submit" disabled={isPending} className="w-full my-2 rounded-full">
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
		<div className="text-white w-xs">
			<h1 className="text-3xl font-light">Verify Email</h1>
			{!isPending ? <SendEmailVerification /> : <p className="text-sm pt-1">Verifying email...</p>}
		</div>
	);
}


