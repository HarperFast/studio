import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useResetPasswordMutation } from './hooks/useResetPassword';

const ResetPasswordSchema = z
	.object({
		password: z
			.string({
				error: 'Please enter your new password.',
			})
			.min(8, { error: 'Password must be at least 8 characters' })
			.max(50, { error: 'Password must be less than 50 characters.' }),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match',
		path: ['confirmPassword'],
	});

export function RestPassword() {
	const { token } = useSearch({ strict: false });
	const navigate = useNavigate();

	useEffect(() => {
		if (!token) {
			navigate({ to: '/' });
		}
	}, [token, navigate]);

	const form = useForm({
		resolver: zodResolver(ResetPasswordSchema),
		defaultValues: {
			password: '',
			confirmPassword: '',
		},
	});

	const { mutate: submitResetPasswordData, isPending } = useResetPasswordMutation();

	const submitForm = async (formData: { password: string; confirmPassword: string }) => {
		submitResetPasswordData(
			{ token: token as string, password: formData.password },
			{
				onSuccess: () => {
					toast.success('Success', {
						description: 'Your password has been reset successfully.',
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					navigate({ to: '/' });
				},
			}
		);
	};

	return (
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Reset Password</h2>
			<Form {...form}>
				<form className="my-4" onSubmit={form.handleSubmit(submitForm)}>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormItem className="my-2">
								<FormLabel>New Password</FormLabel>
								<FormControl>
									<Input
										disabled={isPending}
										type="password"
										placeholder="enter new password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="confirmPassword"
						render={({ field }) => (
							<FormItem className="my-2">
								<FormLabel>Confirm Password</FormLabel>
								<FormControl>
									<Input
										disabled={isPending}
										type="password"
										placeholder="confirm new password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button variant="submit" type="submit" disabled={isPending} className="w-full my-2 rounded-full">
						Submit New Password
					</Button>
				</form>
			</Form>
		</div>
	);
}


