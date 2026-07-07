/**
 * Add/edit dialogs shared by every secrets surface: the cluster-level Secrets config page and the
 * application editor's `.env` panel. The surfaces differ in copy and in what they can show (a
 * plaintext `.env` can reveal the current value; encrypted/protected stores cannot), so both are
 * injected — the dialogs own the form shell, validation, toasts, and the deliberate
 * click-to-reveal affordance.
 */
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ENV_KEY_REGEX, ENV_VALUE_MASK } from '@/lib/env/envFile';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, Save, Trash2 } from 'lucide-react';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const secretKeySchema = z
	.string()
	.trim()
	.min(1)
	.regex(ENV_KEY_REGEX, { error: 'Letters, numbers, underscore, dash and dot only.' });

export function AddSecretModal({
	description,
	valueDescription,
	existingKeys,
	onSubmit,
	isModalOpen,
	setIsModalOpen,
}: {
	description: ReactNode;
	valueDescription?: ReactNode;
	/** Keys that already exist — adding one of these is rejected (edit it instead). */
	existingKeys?: string[];
	/** Persist the new secret; reject to keep the dialog open and surface the error. */
	onSubmit: (data: { key: string; value: string }) => Promise<unknown>;
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
}) {
	const schema = useMemo(
		() =>
			z.object({
				key: secretKeySchema.refine((key) => !existingKeys?.includes(key), {
					error: 'This key already exists — edit it instead.',
				}),
				value: z.string().min(1),
			}),
		[existingKeys],
	);
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: { key: '', value: '' },
	});
	// Destructured unconditionally so react-hook-form tracks all three (see EditSecretModal).
	const { isDirty, isValid, isSubmitting: isPending } = form.formState;

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof schema>) => {
			try {
				await onSubmit(formData);
				form.reset();
				toast.success(`Secret "${formData.key}" saved.`);
				setIsModalOpen(false);
			} catch (error) {
				toast.error(String(error));
			}
		},
		[onSubmit, form, setIsModalOpen],
	);

	const onClickCancel = useCallback(() => {
		form.reset();
		setIsModalOpen(false);
	}, [form, setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form
						id="add-secret-form"
						name="add-secret-form"
						onSubmit={form.handleSubmit(onSubmitClick)}
						className="grid gap-4 my-4"
					>
						<DialogHeader>
							<DialogTitle>Add Secret</DialogTitle>
							<DialogDescription>{description}</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="key"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Key</FormLabel>
									<FormControl>
										<Input type="text" autoComplete="off" autoCapitalize="off" autoFocus={true} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="value"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Value</FormLabel>
									{valueDescription && <FormDescription>{valueDescription}</FormDescription>}
									<FormControl>
										<Textarea autoComplete="off" autoCapitalize="off" rows={3} {...field} />
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
									onClick={onClickCancel}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									variant="submit"
									disabled={isPending || !isDirty || !isValid}
								>
									<Save /> Add Secret
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

const EditSecretSchema = z.object({ value: z.string().min(1) });

export function EditSecretModal({
	name,
	description,
	valueDescription,
	currentValue,
	onSave,
	onDelete,
	closeModal,
	children,
}: {
	name: string;
	description: ReactNode;
	valueDescription?: ReactNode;
	/**
	 * The secret's current plaintext value, when the source can be read (older Harper `.env`
	 * files). Not pre-filled: the field starts masked and the value only appears after a
	 * deliberate click-to-reveal. Omit when the value can't be read back (encrypted/protected).
	 */
	currentValue?: string;
	/** Persist the replacement value; reject to keep the dialog open and surface the error. */
	onSave: (value: string) => Promise<unknown>;
	/** Remove the secret entirely (second click confirms). Omit to hide the delete button. */
	onDelete?: () => Promise<unknown>;
	closeModal: () => void;
	/** Extra content rendered between the value field and the footer (e.g. a grants editor). */
	children?: ReactNode;
}) {
	const form = useForm({ resolver: zodResolver(EditSecretSchema), defaultValues: { value: '' } });
	// Destructured unconditionally: react-hook-form only tracks formState fields that are actually
	// read during render, and the short-circuiting `disabled` expression below would otherwise
	// never read `isValid` while the form is pristine — leaving Save disabled after a single
	// change event (e.g. a pasted value).
	const { isDirty, isValid, isSubmitting } = form.formState;
	const [isDeleting, setIsDeleting] = useState(false);
	const busy = isSubmitting || isDeleting;

	// Revealing fills the field with the current value without marking the form dirty, so Save
	// stays disabled until the user actually changes something.
	const [revealed, setRevealed] = useState(false);
	const onRevealClick = useCallback(() => {
		form.setValue('value', currentValue ?? '', { shouldDirty: false });
		setRevealed(true);
	}, [form, currentValue]);

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof EditSecretSchema>) => {
			try {
				await onSave(formData.value);
				toast.success(`Secret "${name}" updated.`);
				closeModal();
			} catch (error) {
				toast.error(String(error));
			}
		},
		[onSave, name, closeModal],
	);

	// Deleting a secret can break running applications, so require a second click to confirm.
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const onDeleteClick = useCallback(async () => {
		if (!confirmingDelete) {
			setConfirmingDelete(true);
			return;
		}
		setIsDeleting(true);
		try {
			await onDelete?.();
			toast.success(`Secret "${name}" deleted.`);
			closeModal();
		} catch (error) {
			toast.error(String(error));
		} finally {
			setIsDeleting(false);
		}
	}, [confirmingDelete, onDelete, name, closeModal]);

	return (
		<Dialog onOpenChange={closeModal} open={true}>
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
						<DialogHeader>
							<DialogTitle>{name}</DialogTitle>
							<DialogDescription>{description}</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="value"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">{currentValue !== undefined ? 'Value' : 'New value'}</FormLabel>
									{valueDescription && <FormDescription>{valueDescription}</FormDescription>}
									<FormControl>
										<Textarea
											autoComplete="off"
											autoCapitalize="off"
											autoFocus={true}
											rows={3}
											placeholder={currentValue !== undefined && !revealed ? ENV_VALUE_MASK : undefined}
											{...field}
										/>
									</FormControl>
									{currentValue !== undefined && !revealed && (
										<Button type="button" variant="defaultOutline" size="sm" onClick={onRevealClick}>
											<EyeIcon /> Reveal current value
										</Button>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>

						{children}

						<DialogFooter>
							<div className="flex justify-between w-full">
								{onDelete
									? (
										<Button
											variant="destructiveOutline"
											type="button"
											onClick={onDeleteClick}
											disabled={busy}
										>
											<Trash2 /> {confirmingDelete ? 'Confirm delete' : 'Delete'}
										</Button>
									)
									: (
										<Button
											variant="destructiveOutline"
											type="button"
											onClick={closeModal}
											disabled={busy}
										>
											Cancel
										</Button>
									)}
								<Button
									type="submit"
									variant="submit"
									disabled={busy || !isDirty || !isValid}
								>
									<Save /> Save
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
