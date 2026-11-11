/**
 * A native `<select>` standing in for the Radix Select in component tests, whose portalled listbox
 * jsdom does not open. Use with `vi.mock('@/components/ui/select', () => nativeSelectStub)`.
 *
 * The `<select>` takes the `id` and `aria-label` given to `SelectTrigger`, so it is found by the same
 * label as the real control (`getByRole('combobox', { name })`, or a `<Label htmlFor>`), and is driven
 * with `fireEvent.change(select, { target: { value } })`. An empty first option stands for "nothing
 * chosen", like a Radix placeholder.
 */
import { Children, isValidElement, ReactNode } from 'react';

interface TriggerProps {
	id?: string;
	'aria-label'?: string;
}

function SelectTrigger(_props: TriggerProps & { children?: ReactNode; className?: string }) {
	return null;
}

function triggerProps(children: ReactNode): TriggerProps {
	let props: TriggerProps = {};
	Children.forEach(children, child => {
		if (isValidElement<TriggerProps>(child) && child.type === SelectTrigger) {
			props = child.props;
		}
	});
	return props;
}

/** An option holds text only, so flatten whatever markup the item's label has. */
function textOf(node: ReactNode): string {
	if (typeof node === 'string' || typeof node === 'number') {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(textOf).join('');
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return textOf(node.props.children);
	}
	return '';
}

export const nativeSelectStub = {
	Select: ({ value, onValueChange, disabled, children }: {
		value?: string;
		onValueChange: (value: string) => void;
		disabled?: boolean;
		children: ReactNode;
	}) => {
		const { id, 'aria-label': ariaLabel } = triggerProps(children);
		return (
			<select
				id={id}
				aria-label={ariaLabel}
				value={value ?? ''}
				disabled={disabled}
				onChange={event => onValueChange(event.target.value)}
			>
				<option value="" />
				{children}
			</select>
		);
	},
	SelectTrigger,
	SelectValue: (_props: { placeholder?: string }) => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{textOf(children)}</option>
	),
};
