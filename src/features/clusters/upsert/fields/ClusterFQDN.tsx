import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterFQDN({
	disabled,
	form,
}: {
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	return (
		<FormField
			control={form.control}
			name="fqdn"
			render={({ field }) => (
				<FormItem className="md:col-span-6 col-span-3">
					<FormLabel className="pb-1">Optional Cluster Load Balancer Host Name</FormLabel>
					<FormControl>
						<Input
							{...field}
							type="text"
							autoCapitalize="none"
							autoComplete="off"
							autoCorrect="off"
							placeholder="example.your-company.com"
							disabled={disabled}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
