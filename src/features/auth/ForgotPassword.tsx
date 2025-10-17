import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { zodRequireEmail } from '@/lib/zod/email';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useForgotPasswordMutation } from '@/features/auth/hooks/useForgotPassword';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

	useEffect(() => {
		setFocus('email');
	}, [setFocus]);

	const { mutate: submitForgotPasswordData, isPending } = useForgotPasswordMutation();

	const submitForm = async (formData: z.infer<typeof ForgotPasswordSchema>) => {
		submitForgotPasswordData(formData, {
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
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Enter your account email</h2>
			<p className="text-sm pt-1">If a matching account exists, we'll send you a password reset link.</p>
			<Form {...methods}>
				<form onSubmit={handleSubmit(submitForm)} className="my-4">
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
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" variant="submit" disabled={isPending} className="w-full my-2 rounded-full">
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
