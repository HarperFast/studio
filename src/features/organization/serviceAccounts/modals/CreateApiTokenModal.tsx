import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Input } from '@/components/ui/input';
import { useCreateOrganizationApiTokenMutation } from '@/features/organization/serviceAccounts/mutations/createOrganizationApiToken';
import { revokeOrganizationApiToken } from '@/features/organization/serviceAccounts/mutations/revokeOrganizationApiToken';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { CreatedOrganizationApiToken } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const DEFAULT_LIFETIME_DAYS = 30;
// Central manager's default ceiling; a lower configured one comes back as a 400 with the limit.
const MAX_LIFETIME_DAYS = 90;

const CreateApiTokenSchema = z.object({
	name: z
		.string()
		.trim()
		.nonempty({ error: 'Please enter a name.' })
		.max(100, { error: 'Name cannot be longer than 100 characters.' }),
	expiresInDays: z
		.number({ error: 'Enter a whole number of days.' })
		.int({ error: 'Enter a whole number of days.' })
		.min(1, { error: 'Must be at least 1 day.' })
		.max(MAX_LIFETIME_DAYS, { error: `Must be at most ${MAX_LIFETIME_DAYS} days.` }),
});

type CreateApiTokenForm = z.infer<typeof CreateApiTokenSchema>;

/**
 * Render only while open: unmounting on close is what discards the token, so it can't reappear on the
 * next open. A token that is not on screen when the modal unmounts was never seen, so it is revoked.
 */
export function CreateApiTokenModal({
	organizationId,
	serviceAccountId,
	onClose,
}: {
	organizationId: string;
	serviceAccountId: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const copyText = useCopyTextToClipboard();
	const { mutateAsync: createToken, isPending, reset } = useCreateOrganizationApiTokenMutation();
	const [created, setCreated] = useState<CreatedOrganizationApiToken | null>(null);
	const isMounted = useRef(false);
	const isSubmitting = useRef(false);
	// One token per dialog: a submit still in async validation must not mint a second after the reveal.
	const hasMinted = useRef(false);
	const unseenToken = useRef<CreatedOrganizationApiToken | null>(null);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
			if (unseenToken.current) { void revokeUnseen(unseenToken.current); }
		};
	}, []);
	useEffect(() => {
		if (created) {
			unseenToken.current = null;
			isSubmitting.current = false;
			reset();
		}
	}, [created, reset]);

	const form = useForm<CreateApiTokenForm>({
		resolver: zodResolver(CreateApiTokenSchema),
		mode: 'onTouched',
		defaultValues: { name: '', expiresInDays: DEFAULT_LIFETIME_DAYS },
	});
	const { isValid } = form.formState;

	const refreshList = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: [organizationId, 'apiTokens'], refetchType: 'active' }),
			queryClient.invalidateQueries({ queryKey: [organizationId, 'serviceAccounts'], refetchType: 'active' }),
		]);

	// No token names in these toasts: the session may change hands while the request is in flight.
	const revokeUnseen = async (token: CreatedOrganizationApiToken) => {
		try {
			await revokeOrganizationApiToken({ tokenId: token.id });
			toast.warning('An API token created after its dialog closed was revoked.');
		} catch (error) {
			console.error('Failed to revoke an API token that was never shown', error);
			toast.error(
				'An API token created after its dialog closed could not be revoked. Revoke it from its service account’s API Tokens.',
			);
		}
		void refreshList();
	};

	const onSubmit = async (formData: CreateApiTokenForm) => {
		if (isSubmitting.current || hasMinted.current || !isMounted.current) { return; }
		isSubmitting.current = true;
		let result: CreatedOrganizationApiToken;
		try {
			result = await createToken({ serviceAccountId, ...formData });
		} catch {
			// The global MutationCache.onError already toasts the server's message.
			isSubmitting.current = false;
			return;
		}
		hasMinted.current = true;
		if (!isMounted.current) {
			void revokeUnseen(result);
			return;
		}
		unseenToken.current = result;
		setCreated(result);
		void refreshList();
	};

	// isSubmitting, not the rendered isPending, which lags the submit by a tick.
	const closeUnlessSubmitting = () => {
		if (!isSubmitting.current) { onClose(); }
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) { closeUnlessSubmitting(); }
			}}
		>
			<DialogContent className="sm:max-w-[600px]">
				{created
					? (
						<>
							<DialogTitle>Copy your API token</DialogTitle>
							<DialogDescription>
								It won't be shown again. Expires {new Date(created.expiresAt).toLocaleString()}.
							</DialogDescription>
							<div className="my-4 flex items-center gap-2">
								<Input
									readOnly
									aria-label="API token"
									value={created.token}
									className="font-mono text-xs"
									onClick={() => copyText(created.token)}
								/>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									className="shrink-0"
									aria-label="Copy token"
									onClick={() => copyText(created.token)}
								>
									<CopyIcon />
								</Button>
							</div>
							<p className="text-sm text-muted-foreground">
								Send it as a bearer token:{' '}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>. It
								acts as this service account, with its role, on this organization's clusters and their instances.
							</p>
							<DialogFooter>
								<Button type="button" variant="submit" onClick={onClose}>
									Done
								</Button>
							</DialogFooter>
						</>
					)
					: (
						<>
							<DialogTitle>Create API Token</DialogTitle>
							<DialogDescription>
								For CI pipelines and scripts. The token acts as this service account, with its role.
							</DialogDescription>
							<Form {...form}>
								<form
									id="create-api-token-form"
									name="create-api-token-form"
									className="flex flex-col gap-4 my-4"
									onSubmit={form.handleSubmit(onSubmit)}
									onKeyDown={revealFieldErrorOnEnter(form)}
								>
									<FormField
										control={form.control}
										name="name"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="pb-1">Name</FormLabel>
												<LengthLimitedInput
													type="text"
													placeholder="e.g. github-actions-deploy"
													maxLength={CreateApiTokenSchema.shape.name.maxLength!}
													{...field}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="expiresInDays"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="pb-1">Expires in (days)</FormLabel>
												<FormControl>
													<Input
														type="number"
														min={1}
														max={MAX_LIFETIME_DAYS}
														step={1}
														name={field.name}
														ref={field.ref}
														onBlur={field.onBlur}
														value={Number.isFinite(field.value) ? field.value : ''}
														onChange={(e) => field.onChange(e.target.valueAsNumber)}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<DialogFooter>
										<div className="flex justify-between w-full">
											<Button
												variant="destructiveOutline"
												type="button"
												onClick={closeUnlessSubmitting}
												disabled={isPending}
											>
												Cancel
											</Button>
											<Button variant="submit" type="submit" disabled={isPending || !isValid}>
												{isPending ? 'Creating…' : 'Create Token'}
											</Button>
										</div>
									</DialogFooter>
								</form>
							</Form>
						</>
					)}
			</DialogContent>
		</Dialog>
	);
}
