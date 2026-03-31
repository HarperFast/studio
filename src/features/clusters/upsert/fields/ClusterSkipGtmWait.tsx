import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { Input } from '@/components/ui/input';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterSkipGtmWait({
	className,
	form,
}: {
	className?: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	return (
		<FormField
			control={form.control}
			name="skipGtmWait"
			render={({ field }) => (
				<FormItem className={className}>
					<div className="flex items-center gap-2">
						<FormControl>
							<Input
								type="checkbox"
								className="w-4 h-4 cursor-pointer"
								checked={field.value || false}
								onChange={field.onChange}
								onBlur={field.onBlur}
								name={field.name}
								ref={field.ref}
							/>
						</FormControl>
						<FormLabel className="cursor-pointer">Immediate upgrade and restart</FormLabel>
					</div>
					<FormDescription>
						Apply changes immediately without waiting for each instance to be taken out of the load balancer (faster,
						but potentially less safe).
					</FormDescription>
				</FormItem>
			)}
		/>
	);
}
