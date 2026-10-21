import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StaffUserPicker } from '@/features/admin/apiToken/components/StaffUserPicker';
import { MintTokenSchema, MintTokenValues, TOKEN_NAME_MAX_LENGTH } from '@/features/admin/apiToken/mintTokenSchema';
import { useGenerateApiTokenMutation } from '@/features/admin/apiToken/mutations/useGenerateApiToken';
import { StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import {
	formatHours,
	STAFF_TOKEN_IDLE_DAYS,
	STAFF_TOKEN_LIFETIMES,
	STAFF_TOKEN_ROLES,
} from '@/features/admin/apiToken/staffTokenRoles';
import { MintedStaffApiToken, StaffApiTokenRole } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/** The safest choice is the one the form opens on; an admin token is a deliberate pick. */
const DEFAULT_ROLE: StaffApiTokenRole = 'fabric_readonly';

function defaultValues(ownerUserId: string): MintTokenValues {
	return {
		ownerUserId,
		role: DEFAULT_ROLE,
		name: '',
		expiresInHours: STAFF_TOKEN_LIFETIMES[DEFAULT_ROLE].defaultHours,
	};
}

interface MintStaffApiTokenFormProps {
	self: StaffUserSummary;
	/** Receives the token with its secret; the caller holds it, this form forgets it at once. */
	onMinted: (token: MintedStaffApiToken) => void;
}

/**
 * Mints a token for a staff owner. The role list is every staff role: nothing the API exposes
 * says which role another account holds, so a role wider than the owner's is refused by the
 * server (403) and surfaced by the global error toast rather than prevented here.
 */
export function MintStaffApiTokenForm({ self, onMinted }: MintStaffApiTokenFormProps) {
	const { mutate, isPending, reset } = useGenerateApiTokenMutation();
	const [owner, setOwner] = useState<StaffUserSummary | null>(self);
	const form = useForm<MintTokenValues>({
		resolver: zodResolver(MintTokenSchema),
		mode: 'onTouched',
		defaultValues: defaultValues(self.id),
	});
	const role = form.watch('role');
	const lifetime = STAFF_TOKEN_LIFETIMES[role];

	const changeOwner = (user: StaffUserSummary | null) => {
		setOwner(user);
		form.setValue('ownerUserId', user?.id ?? '', { shouldValidate: true, shouldDirty: true });
	};

	const changeRole = (next: StaffApiTokenRole) => {
		form.setValue('role', next, { shouldDirty: true });
		// Each role has its own cap and default; carrying the old value over would mostly be invalid.
		form.setValue('expiresInHours', STAFF_TOKEN_LIFETIMES[next].defaultHours, { shouldValidate: true });
	};

	const onSubmit = (values: MintTokenValues) => {
		// The global MutationCache.onError surfaces failures (400/403/404/409) with a toast.
		mutate(values, {
			onSuccess: (result) => {
				// Hand the credential to the page's local state, then drop it from the shared
				// MutationCache so it can't be read there or outlive the page.
				onMinted(result);
				reset();
				form.reset(defaultValues(self.id));
				setOwner(self);
			},
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Mint a token</CardTitle>
				<CardDescription>
					The token acts as its owner with the role you choose, for the lifetime you set, and is refused once it has
					gone unused for {STAFF_TOKEN_IDLE_DAYS} days. Each owner can hold 3 live tokens.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						id="mint-staff-api-token-form"
						name="mint-staff-api-token-form"
						className="flex flex-col gap-4"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
							<FormField
								control={form.control}
								name="ownerUserId"
								render={() => (
									<FormItem>
										<FormLabel className="pb-1" htmlFor="mint-token-owner">Owner</FormLabel>
										<StaffUserPicker
											id="mint-token-owner"
											value={owner}
											onChange={changeOwner}
											self={self}
											disabled={isPending}
										/>
										<FormDescription>An active Harper staff account; the token acts as them.</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="role"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Role</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={changeRole} disabled={isPending}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a role" />
												</SelectTrigger>
												<SelectContent>
													{STAFF_TOKEN_ROLES.map((option) => (
														<SelectItem key={option} value={option}>
															{option} — up to {formatHours(STAFF_TOKEN_LIFETIMES[option].maxHours)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormControl>
										<FormDescription>
											At or below the owner's own role; the server refuses anything wider.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Name</FormLabel>
										<FormControl>
											<Input
												placeholder="e.g. nightly-usage-report"
												maxLength={TOKEN_NAME_MAX_LENGTH}
												disabled={isPending}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="expiresInHours"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Lifetime (hours)</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												max={lifetime.maxHours}
												step={1}
												disabled={isPending}
												name={field.name}
												ref={field.ref}
												onBlur={field.onBlur}
												value={Number.isFinite(field.value) ? field.value : ''}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormDescription>
											Up to {formatHours(lifetime.maxHours)} ({lifetime.maxHours} hours) for {role}; it never renews.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div>
							<Button type="submit" variant="submit" disabled={isPending}>
								<KeyRoundIcon />
								{isPending ? 'Minting…' : 'Mint token'}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
