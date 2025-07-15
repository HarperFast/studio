import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useVerifyEmailMutation, VerifyEmailToken } from '@/features/auth/hooks/useVerifyEmail';
import { useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';
import { toast } from 'sonner';

const VerifyEmailSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address' }),
});

function SendEmailVerification() {
	const navigate = useNavigate();
	const { mutate: submitResendEmailVerification, isPending } = useResendEmailVerification();
	const form = useForm<z.infer<typeof VerifyEmailSchema>>({
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
				navigate({ to: '/' });
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
					//TODO - Trigger a success toast message
					toast.success('Success', {
						description: 'Email verified successfully',
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					navigate({ to: '/' });
				},
			});
		},
		[submitEmailVerificationToken, navigate]
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


