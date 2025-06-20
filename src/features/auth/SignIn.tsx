import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useLoginMutation } from '@/features/auth/hooks/useSignIn';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const SignInSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address.',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address.' }),
	password: z
		.string({
			message: 'Please enter your password',
		})
		.min(1, { message: 'Password is required' })
		.max(50, { message: 'Password must be less than 50 characters' }),
});

export function SignIn() {
	const navigate = useNavigate();
	const router = useRouter();
	const form = useForm<z.infer<typeof SignInSchema>>({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const { mutate: submitLoginData } = useLoginMutation();

	const submitForm = async (formData: z.infer<typeof SignInSchema>) => {
		await submitLoginData(formData, {
			onSuccess: () => {
				navigate({ to: '/orgs' });
				router.invalidate();
			},
		});
	};

	return (
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign in to Harper Fabric</h2>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="my-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="my-4">
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										type="email"
										placeholder="jane.smith@harperdb.io"
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
						name="password"
						render={({ field }) => (
							<FormItem className="my-4">
								<FormLabel>Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										placeholder="password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" variant="submit" className="w-full my-2 rounded-full">
						Sign In
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="text-sm" to="/signup">
					Sign up for free
				</Link>
				<Link className="text-sm" to="/forgotpassword">
					Forgot password?
				</Link>
			</div>
		</div>
	);
}


