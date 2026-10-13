import { ReactNode } from 'react';

/** A native <select> standing in for the Radix Select, whose portal listbox jsdom does not open. */
export const selectStub = {
	Select: ({
		value,
		onValueChange,
		disabled,
		children,
	}: {
		value?: string;
		onValueChange: (value: string) => void;
		disabled?: boolean;
		children: ReactNode;
	}) => (
		<select
			aria-label="Role"
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			<option value="">Choose a role</option>
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}
	</option>,
};
