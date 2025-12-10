import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useToggler } from '@/hooks/useToggler';
import { cx } from 'class-variance-authority';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { ChangeEvent, useCallback } from 'react';
import { ControllerRenderProps } from 'react-hook-form';
import { z } from 'zod';
import { newTableSchema } from './newTableSchema';

export function OptionalExpiration(
	{ field }: { field: ControllerRenderProps<z.infer<typeof newTableSchema>, 'expiration'> },
) {
	const { toggled, toggle } = useToggler(false);
	const onChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) =>
			field.onChange(e.target.value ? parseInt(e.target.value, 10) : e.target.value),
		[],
	);
	return (
		<FormItem className="my-4">
			<FormLabel
				onClick={toggle}
				className={cx(
					'flex items-center gap-2',
					toggled ? '' : 'text-muted-foreground italic',
				)}
			>
				{toggled ? <ArrowDownIcon /> : <ArrowRightIcon />} Optional Expiration
			</FormLabel>
			<FormDescription className={toggled ? '' : 'hidden'}>
				After how many seconds should records be automatically evicted? Leave blank or set to 0 to skip this feature.
				(It can be useful for cache records.)
			</FormDescription>
			<FormControl className={toggled ? '' : 'hidden'}>
				<Input {...field} type="number" min={0} step={1} className="my-1" onChange={onChange} />
			</FormControl>
			<FormMessage />
		</FormItem>
	);
}
