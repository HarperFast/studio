import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Input } from '@/components/ui/input';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { useUpdateUserMutation } from '@/features/profile/mutations/updateUserMutation';
import { UpdateUserSchema } from '@/features/profile/mutations/updateUserSchema';
import { useCloudAuth } from '@/hooks/useAuth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { KeyRound, Save, UserRound } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function ProfileIndex() {
	const router = useRouter();
	const navigate = useNavigate();
	const { user } = useCloudAuth();

	const methods = useForm({
		resolver: zodResolver(UpdateUserSchema),
		mode: 'onTouched',
		defaultValues: {
			confirmNewPassword: '',
			firstname: user?.firstname || '',
			id: user?.id || '',
			lastname: user?.lastname || '',
			newPassword: '',
		},
	});
	const { control, getFieldState, handleSubmit, reset, trigger, formState: { defaultValues, isDirty, isValid } } =
		methods;
	const { mutate: updateUser, isPending: isUpdatePending } = useUpdateUserMutation();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof UpdateUserSchema>) => {
			if (formData) {
				updateUser(formData, {
					onSuccess: (data) => {
						reset({
							...defaultValues,
							...data,
						});
						authStore.updateUserForEntity(OverallAppSignIn, data);
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
		[defaultValues, navigate, reset, router, updateUser],
	);

	return (
		<div className="mx-auto mt-20 w-full max-w-6xl px-4 py-8 md:px-12 md:py-10">
			<header className="mb-8 flex items-center gap-4">
				<div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:text-violet-300">
					<UserRound className="size-6" aria-hidden="true" />
				</div>
				<div>
					<p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Your account</p>
					<h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
					<p className="mt-2 text-sm text-muted-foreground">Manage your personal details and account password.</p>
				</div>
			</header>
			<Form {...methods}>
				<form
					id="profile-edit-form"
					name="profile-edit-form"
					onSubmit={handleSubmit(onSubmitClick)}
					onKeyDown={revealFieldErrorOnEnter(methods)}
					className="space-y-6"
				>
					<div className="grid items-start gap-6 lg:grid-cols-2">
						<Card className="gap-0 overflow-hidden py-0">
							<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/20 py-5 dark:from-primary/20 dark:to-primary/5">
								<div className="flex items-center gap-2 text-primary dark:text-violet-300">
									<UserRound className="size-4" aria-hidden="true" />
									<h2 className="text-base font-semibold text-foreground">Personal information</h2>
								</div>
								<p className="text-sm text-muted-foreground">Your name and sign-in email.</p>
							</CardHeader>
							<CardContent className="grid gap-5 py-6 sm:grid-cols-2">
								<FormField
									control={control}
									name="firstname"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">First Name</FormLabel>
											<FormControl>
												<Input
													type="text"
													className="bg-background/60"
													autoCapitalize="words"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={control}
									name="lastname"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">Last Name</FormLabel>
											<FormControl>
												<Input
													type="text"
													className="bg-background/60"
													autoCapitalize="words"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormItem className="sm:col-span-2">
									<FormLabel htmlFor="profile-email" className="pb-1">Email</FormLabel>
									<FormControl>
										<Input
											id="profile-email"
											type="email"
											enterKeyHint="next"
											autoComplete="email"
											autoCapitalize="none"
											value={user?.email || ''}
											disabled={true}
											readOnly={true}
										/>
									</FormControl>
								</FormItem>

								<p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
									Your email is used to sign in and can’t be changed here.
								</p>
							</CardContent>
						</Card>
						<Card className="gap-0 overflow-hidden py-0">
							<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/20 py-5 dark:from-primary/20 dark:to-primary/5">
								<div className="flex items-center gap-2 text-primary dark:text-violet-300">
									<KeyRound className="size-4" aria-hidden="true" />
									<h2 className="text-base font-semibold text-foreground">Password</h2>
								</div>
								<p className="text-sm text-muted-foreground">Leave these fields empty to keep your current password.</p>
							</CardHeader>
							<CardContent className="grid gap-5 py-6">
								<FormField
									control={control}
									name="newPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">New Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Optional"
													className="bg-background/60"
													autoComplete="new-password"
													autoCapitalize="none"
													{...field}
													onChange={(event) => {
														field.onChange(event);
														// Not `deps`: they fire on this field's first blur, before the confirmation is visited.
														if (getFieldState('confirmNewPassword').isTouched) {
															void trigger('confirmNewPassword');
														}
													}}
												/>
											</FormControl>
											<FormDescription>
												Use at least 8 characters. Changing your password will sign you out.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={control}
									name="confirmNewPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">Confirm New Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													className="bg-background/60"
													autoComplete="new-password"
													autoCapitalize="none"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</CardContent>
						</Card>
					</div>
					<div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm text-muted-foreground">
							{isDirty ? 'You have unsaved changes.' : 'Your profile is up to date.'}
						</p>
						<Button
							type="submit"
							variant="submit"
							disabled={isUpdatePending || !isDirty || !isValid}
						>
							<Save className="size-4" aria-hidden="true" /> {isUpdatePending ? 'Saving…' : 'Save changes'}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}
