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
import { revokeApiToken } from '@/features/admin/apiToken/mutations/useRevokeApiToken';
import { staffApiTokensQueryKey } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import {
	formatHours,
	STAFF_TOKEN_IDLE_DAYS,
	STAFF_TOKEN_LIFETIMES,
	STAFF_TOKEN_ROLES,
} from '@/features/admin/apiToken/staffTokenRoles';
import { MintedStaffApiToken, StaffApiTokenRole } from '@/integrations/api/api.patch';
import { describeError, errorHandler } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { KeyRoundIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
	onMinted: (token: MintedStaffApiToken) => void;
}

/**
 * The server's refusal of a role wider than the owner's (central-manager's ApiToken.post), whose
 * message names the owner's role; null for any other failure. Nothing the API exposes says which
 * role another account holds, so this answer is how the admin learns it.
 */
export function roleRefusalMessage(error: unknown): string | null {
	if (!isAxiosError(error) || error.response?.status !== 403) { return null; }
	const { description } = describeError(error);
	return /exceed the owner's/i.test(description) ? description : null;
}

async function revokeUnseen(token: MintedStaffApiToken, queryClient: QueryClient) {
	try {
		await revokeApiToken(token.id);
		toast.warning('An API token minted after its page was left was revoked.');
	} catch (error) {
		// The shared handler keeps a lost answer (502, timeout) from reading as a failed revoke.
		errorHandler(error);
	}
	void queryClient.invalidateQueries({ queryKey: staffApiTokensQueryKey });
}

export function MintStaffApiTokenForm({ self, onMinted }: MintStaffApiTokenFormProps) {
	const { mutateAsync, isPending, reset } = useGenerateApiTokenMutation();
	const queryClient = useQueryClient();
	const [owner, setOwner] = useState<StaffUserSummary | null>(self);
	const isMounted = useRef(false);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);
	const form = useForm<MintTokenValues>({
		resolver: zodResolver(MintTokenSchema),
		mode: 'onTouched',
		defaultValues: defaultValues(self.id),
	});
	const role = form.watch('role');
	const lifetime = STAFF_TOKEN_LIFETIMES[role];

	const changeOwner = (user: StaffUserSummary | null) => {
		setOwner(user);
		// Clearing the owner is the start of a pick, not a mistake to flag yet.
		form.setValue('ownerUserId', user?.id ?? '', { shouldValidate: user !== null, shouldDirty: true });
		if (user === null) { form.clearErrors('ownerUserId'); }
		// A refusal named the previous owner's role.
		form.clearErrors('role');
	};

	const changeRole = (next: StaffApiTokenRole) => {
		form.setValue('role', next, { shouldDirty: true });
		form.clearErrors('role');
		// Each role has its own cap and default; carrying the old value over would mostly be invalid.
		form.setValue('expiresInHours', STAFF_TOKEN_LIFETIMES[next].defaultHours, { shouldValidate: true });
	};

	const onSubmit = async (values: MintTokenValues) => {
		let result: MintedStaffApiToken;
		try {
			result = await mutateAsync(values);
		} catch (error) {
			if (!isMounted.current) { return; }
			const refusal = roleRefusalMessage(error);
			if (refusal) {
				form.setError('role', { message: refusal });
			} else {
				errorHandler(error);
			}
			return;
		}
		if (!isMounted.current) {
			reset();
			void revokeUnseen(result, queryClient);
			return;
		}
		// Page state first, then out of the MutationCache (see useGenerateApiTokenMutation).
		onMinted(result);
		reset();
		form.reset(defaultValues(self.id));
		setOwner(self);
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
