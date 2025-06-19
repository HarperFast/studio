import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFormContext } from 'react-hook-form';

function InfoForm() {
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

export default InfoForm;
