import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';
import { getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { useUpdateUserMutation } from '@/features/profile/mutations/updateUserMutation';
import { UpdateUserSchema } from '@/features/profile/mutations/updateUserSchema';
import { useCloudAuth } from '@/hooks/useAuth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function ProfileIndex() {
	const router = useRouter();
	const navigate = useNavigate();
	const { user } = useCloudAuth();
	const form = useForm({
		resolver: zodResolver(UpdateUserSchema),
		defaultValues: async () => {
			const user = await getCurrentUser();
			return {
				confirmNewPassword: '',
				firstname: user.firstname,
				id: user.id,
				lastname: user.lastname,
				newPassword: '',
			};
		},
	});
	const { mutate: updateUser, isPending: isUpdatePending } = useUpdateUserMutation();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof UpdateUserSchema>) => {
			if (formData) {
				updateUser(formData, {
					onSuccess: (data) => {
						form.reset(data);
						if (formData.newPassword) {
							toast.success('Profile updated successfully!', {
								description: 'Please sign in with your new password.',
							});
							logoutOnSuccess();
							void navigate({ to: '/sign-in' });
							void router.invalidate();
						} else {
							toast.success('Profile updated successfully!');
						}
					},
				});
			}
		},
		[form, navigate, router, updateUser],
	);

	return (
		<div className="mt-20 px-4 pt-4 md:px-12">
			<h2 className="text-2xl font-light">Profile</h2>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
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
										autoCapitalize="words"
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
										autoCapitalize="words"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormLabel className="pb-1">Email</FormLabel>
					<FormControl>
						<Input
							type="email"
							enterKeyHint="next"
							autoComplete="email"
							autoCapitalize="none"
							value={user?.email || ''}
							disabled={true}
							readOnly={true}
						/>
					</FormControl>

					<FormField
						control={form.control}
						name="newPassword"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">New Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										placeholder="Optional"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										autoComplete="new-password"
										autoCapitalize="none"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="confirmNewPassword"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Confirm New Password</FormLabel>
								<FormControl>
									<Input
										type="password"
										className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
										autoComplete="new-password"
										autoCapitalize="none"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>


					<div className="flex justify-between w-full">
						<Button
							type="submit"
							variant="submit"
							className="rounded-full"
							disabled={isUpdatePending || !form.formState.isDirty || !form.formState.isValid}
						>
							<Save /> Update Profile
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}
