import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { EmailSignInSchema } from '@/features/instance/operations/schemas/signInSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
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
		<div className="text-white w-xs">
			<h2 className="text-2xl font-light">Sign in to Harper Fabric</h2>
			<Form {...methods}>
				<form onSubmit={handleSubmit(submitForm)} className="my-4">
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
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
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
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
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
				</form>
			</Form>
			<div className="flex px-4 mt-4 underline place-content-between">
				<Link className="text-sm hover:text-blue-300" to="/sign-up" search={{ me: email }}>
					Sign up for free
				</Link>
				<Link className="text-sm hover:text-blue-300" to="/forgot-password" search={{ me: email }}>
					Forgot password?
				</Link>
			</div>
		</div>
	);
}
