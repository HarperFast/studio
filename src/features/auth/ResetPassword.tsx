import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
		password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
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
		await submitResetPasswordData(
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


