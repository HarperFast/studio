import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useFormContext } from 'react-hook-form';

export function InfoForm() {
	const form = useFormContext();

	return (
		<>
			<FormField
				control={form.control}
				name="clusterName"
				render={({ field }) => (
					<FormItem className="">
						<FormLabel className="pb-1">Cluster Name</FormLabel>
						<FormControl>
							<Input type="text" placeholder="User Cluster" maxLength={255} {...field} className="max-w-64" />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="abbreviatedName"
				render={({ field }) => (
					<FormItem className="">
						<FormLabel className="pb-1">Abbreviated Name</FormLabel>
						<FormControl>
							<Input type="text" placeholder="ex. cluster-1" maxLength={20} {...field} className="max-w-64" />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);
}
