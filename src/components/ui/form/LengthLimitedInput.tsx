import { FormControl } from '@/components/ui/form/FormControl';
import { useLengthLimit } from '@/components/ui/form/useLengthLimit';
import { Input } from '@/components/ui/input';
import { ComponentProps } from 'react';

export function LengthLimitedInput(
	{ maxLength, onPaste, ...props }: ComponentProps<typeof Input> & { maxLength: number },
) {
	const { controlProps, inputProps, hint } = useLengthLimit(maxLength, onPaste);

	return (
		<>
			<FormControl {...controlProps}>
				<Input {...props} {...inputProps} />
			</FormControl>
			{hint}
		</>
	);
}
