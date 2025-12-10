import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useToggler } from '@/hooks/useToggler';
import { cx } from 'class-variance-authority';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { ControllerRenderProps } from 'react-hook-form';
import { z } from 'zod';
import { newTableSchema } from './newTableSchema';

export function DatabaseName(
	{ field }: { field: ControllerRenderProps<z.infer<typeof newTableSchema>, 'databaseName'> },
) {
	const { toggled, toggle } = useToggler(false);
	return (
		<FormItem className="my-4">
			<FormLabel
				onClick={toggle}
				className={cx(
					'flex items-center gap-2',
					toggled ? '' : 'text-muted-foreground italic',
				)}
			>
				{toggled ? <ArrowDownIcon /> : <ArrowRightIcon />} Optional Database Name
			</FormLabel>
			<FormDescription className={toggled ? '' : 'hidden'}>"data" is the default recommended name</FormDescription>
			<FormControl className={toggled ? '' : 'hidden'}>
				<Input type="text" className="my-1" {...field} />
			</FormControl>
			<FormMessage />
		</FormItem>
	);
}
