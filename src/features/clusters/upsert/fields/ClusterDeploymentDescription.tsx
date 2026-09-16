import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { Suspense } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

const DEPLOYMENT_FULL_DESCRIPTION: { [key: string]: string } = {
	'Colocated': 'Shared infrastructure for optimized value',
	'Dedicated': 'Dedicated infrastructure for consistent performance',
	'Self-Hosted': 'Your own infrastructure',
};

export function ClusterDeploymentDescription({
	availableDeploymentTypes,
	disabled,
	form,
}: {
	availableDeploymentTypes: string[];
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	return (
		<FormField
			control={form.control}
			name="deploymentDescription"
			render={({ field }) => (
				<FormItem className="col-span-3">
					<FormLabel className="pb-1">Harper Deployment</FormLabel>

					<Suspense fallback={<TextLoadingSkeleton />}>
						<FormControl>
							<Select
								{...field}
								disabled={disabled}
								onValueChange={(deploymentDescription) => {
									field.onChange(deploymentDescription);
									void form.trigger();
								}}
							>
								<SelectTrigger className="w-full h-auto">
									<SelectValue placeholder="Choose Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableDeploymentTypes.map((deploymentDescription) => (
											<SelectItem
												key={deploymentDescription}
												value={deploymentDescription}
											>
												<dt className="text-left font-bold text-sm/6">{deploymentDescription}</dt>
												{DEPLOYMENT_FULL_DESCRIPTION[deploymentDescription] && (
													<dd className="font-light">{DEPLOYMENT_FULL_DESCRIPTION[deploymentDescription]}</dd>
												)}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
					</Suspense>

					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
