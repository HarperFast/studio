import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { EmailSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { GitHubAuthenticationButton } from './components/GitHubAuthenticationButton';
import { GoogleAuthenticationButton } from './components/GoogleAuthenticationButton';
import { useCloudSignIn } from './hooks/useCloudSignIn';

export function SignIn() {
	const { me: formPersistenceEmail } = useSearch({ strict: false });

	const methods = useForm({
		resolver: zodResolver(EmailSignInSchema),
		defaultValues: {
			email: formPersistenceEmail || '',
			password: '',
		},
	});
	const { handleSubmit, control } = methods;
	const email = methods.watch('email');

	const { submitForm, isPending } = useCloudSignIn();

	return (
		<div className="text-foreground dark:text-white w-xs">
			<h2 className="text-2xl font-light text-center">Sign in to Harper Fabric</h2>
			<Form {...methods}>
				<form
					id="auth-signin-form"
					name="auth-signin-form"
					onSubmit={handleSubmit(submitForm)}
					className="my-4"
				>
					<FormField
						control={control}
						name="email"
						render={({ field }) => (
							<FormItem className="my-4">
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										type="email"
										autoFocus={true}
										autoComplete="email"
										className="dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={control}
						name="password"
						render={({ field }) => (
							<FormItem className="my-4">
								<FormLabel>Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										autoComplete="current-password"
										className="dark:bg-black dark:border-black"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" variant="submit" className="w-full my-2 rounded-full" disabled={isPending}>
						Sign In
					</Button>
					<div className="flex px-4 mt-4 underline place-content-between">
						<Link
							className="text-sm text-muted-foreground hover:text-foreground dark:text-inherit dark:hover:text-blue-300"
							to="/sign-up"
							search={{ me: email }}
						>
							Sign up for free
						</Link>
						<Link
							className="text-sm text-muted-foreground hover:text-foreground dark:text-inherit dark:hover:text-blue-300"
							to="/forgot-password"
							search={{ me: email }}
						>
							Forgot password?
						</Link>
					</div>
				</form>
			</Form>

			<hr className="border-border dark:border-gray-600 my-6" />

			<div className="flex flex-col gap-2">
				<GoogleAuthenticationButton text="Sign in with Google" />
				<GitHubAuthenticationButton text="Sign in with GitHub" />
			</div>
		</div>
	);
}
