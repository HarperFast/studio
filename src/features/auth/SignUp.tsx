import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useSignUpMutation } from '@/features/auth/hooks/useSignUp';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const SignInSchema = z.object({
	firstname: z
		.string({
			error: 'Please enter your first name.',
		})
		.min(2, { error: 'First name is required.' })
		.max(50, { error: 'First name must be less than 50 characters.' }),
	lastname: z
		.string({
			error: 'Please enter your last name.',
		})
		.min(2, { error: 'Last name is required.' })
		.max(50, { error: 'Last name must be less than 50 characters.' }),
	email: z
		.email({
			error: 'Please enter a valid email address.',
		})
		.max(75, { error: 'Email must be less than 75 characters.' }),
	password: z
		.string({
			error: 'Please enter your password.',
		})
		.min(8, { error: 'Password must be 8 characters or more.' })
		.max(50, { error: 'Password must be less than 50 characters.' }),
});

export function SignUp() {
	const navigate = useNavigate();
	const { email } = useSearch({ strict: false });
	const form = useForm({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			firstname: '',
			lastname: '',
			email: email || '',
			password: '',
		},
	});

	const { mutate: submitSignUpData } = useSignUpMutation();

	const submitForm = async (formData: z.infer<typeof SignInSchema>) => {
		submitSignUpData(formData, {
			onSuccess: () => {
				toast.success('Success', {
					description: 'Your account has been created! Please check your email to finish activating your' +
						' account.',
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
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign up for Harper Studio</h2>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-4 my-4">
					<FormField
						control={form.control}
						name="firstname"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">First Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder="Jane"
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
						name="lastname"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Last Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder="Doe"
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
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Email</FormLabel>
								<FormControl>
									<Input
										type="email"
										readOnly={!!email}
										disabled={!!email}
										placeholder="jane.doe@harpersystems.dev"
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
							<FormItem>
								<FormLabel className="pb-1">Password</FormLabel>
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
						Sign Up For Free
					</Button>
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="m-auto text-sm" to="/">
					Already have an account? Sign in instead.
				</Link>
			</div>
		</div>
	);
}


