import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { InfoIcon } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterRecordLocks({
	className,
	form,
	onUserChange,
}: {
	className?: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	onUserChange?: () => void;
}) {
	return (
		<FormField
			control={form.control}
			name="recordLocks"
			render={({ field }) => (
				<FormItem className={className}>
					<div className="flex items-center gap-2">
						<FormControl>
							<Input
								type="checkbox"
								className="w-4 h-4 cursor-pointer"
								checked={field.value || false}
								onChange={(event) => {
									onUserChange?.();
									field.onChange(event);
								}}
								onBlur={field.onBlur}
								name={field.name}
								ref={field.ref}
							/>
						</FormControl>
						<FormLabel className="cursor-pointer">Cluster-wide record locks</FormLabel>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="What are cluster-wide record locks?"
									className="text-muted-foreground hover:text-foreground"
								>
									<InfoIcon className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								Lets <code>lock()</code> in your application code lock a record across every instance. Without it,{' '}
								<code>lock()</code> on a table that replicates fails, and only{' '}
								<code>lock({'{'} scope: 'node' {'}'})</code>{' '}
								works, on one instance. You can change this later from the cluster's Record Locks page.
							</TooltipContent>
						</Tooltip>
					</div>
				</FormItem>
			)}
		/>
	);
}
