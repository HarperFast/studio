import { measurePasteCut, PasteCut } from '@/components/ui/form/measurePasteCut';
import { useFormField } from '@/components/ui/form/useFormField';
import { pluralize } from '@/lib/pluralize';
import { TriangleAlertIcon } from 'lucide-react';
import { ClipboardEvent, ClipboardEventHandler, useEffect, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';

type PasteState = 'pending' | (PasteCut & { value: string }) | null;

/** The browser cuts a paste to `maxLength` without a word, so this says when it has, and when the limit is reached. */
export function useLengthLimit(
	maxLength: number | null | undefined,
	onPaste?: ClipboardEventHandler<HTMLInputElement>,
) {
	const { name, formLengthHintId } = useFormField();
	const watched: unknown = useWatch({ name, disabled: maxLength == null });
	const value = typeof watched === 'string' ? watched : '';
	const [paste, setPaste] = useState<PasteState>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	// zod's `.maxLength` is null on a schema without `.max()`.
	if (maxLength == null) {
		return { controlProps: {}, inputProps: { onPaste }, hint: null };
	}

	// Any later change, even one that stays at the limit, means the value is no longer what the paste left.
	let shown = paste;
	if (shown && shown !== 'pending' && value !== shown.value) {
		shown = null;
		setPaste(null);
	}

	const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
		onPaste?.(event);
		const input = event.currentTarget;
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (event.defaultPrevented || input.readOnly || !text) {
			return;
		}
		const before = input.value;
		const { selectionStart: start, selectionEnd: end } = input;
		const selection = start === null || end === null ? null : [start, end] as const;
		setPaste('pending');
		clearTimeout(timer.current);
		// The browser inserts the paste after this handler returns, so measure once it has.
		timer.current = setTimeout(() => {
			const after = input.value;
			const cut = measurePasteCut({ text, before, after, selection, maxLength });
			setPaste(cut && { ...cut, value: after });
		});
	};

	const limit = describeLimit(maxLength, value.length);
	let message: string | null = null;
	if (shown && shown !== 'pending') {
		const fit = shown.kept ? `only the first ${shown.kept} fit` : 'none of it fit';
		message = `${limit} Pasted text was ${pluralize(shown.pasted, 'character', 'characters')}; ${fit}.`;
	} else if (!shown && value.length >= maxLength) {
		// Not while a paste is pending, or the limit is announced and then the paste right after it.
		message = limit;
	}

	return {
		controlProps: { 'aria-describedby': formLengthHintId },
		inputProps: { maxLength, onPaste: handlePaste },
		hint: <FormLengthHint id={formLengthHintId} message={message} />,
	};
}

function describeLimit(maxLength: number, length: number) {
	// A value can start over the limit, such as a name saved before the limit was lowered.
	if (length > maxLength) {
		return `Maximum ${maxLength} characters; this has ${length}.`;
	}
	// Short of it only after a paste that stopped before a surrogate pair.
	return length === maxLength ? `Maximum ${maxLength} characters reached.` : `Maximum ${maxLength} characters.`;
}

// Always rendered, so screen readers already track the live region when the message arrives.
function FormLengthHint({ id, message }: { id: string; message: string | null }) {
	return (
		<p
			id={id}
			data-slot="form-length-hint"
			aria-live="polite"
			aria-atomic="true"
			className={message ? 'flex items-start gap-1.5 text-sm text-amber-800 dark:text-yellow' : 'sr-only'}
		>
			{message && <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
			{message}
		</p>
	);
}
