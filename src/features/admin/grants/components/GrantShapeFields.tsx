import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isSelfHostedPlanId, ShapeRow } from '@/features/admin/grants/GrantFormSchema';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { getRegionsQueryOptions } from '@/features/admin/regions/queries/getRegions';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

interface ShapeFieldValues {
	shape: ShapeRow[];
}

/**
 * The one cluster a comp is for, one row per region it runs in — a plan may appear on several rows.
 * central-manager admits a claim only when the request's (plan, region) pairs equal these exactly,
 * and converts the cluster to paid on any later change, so this editor is the whole of what a comp
 * covers. A self-hosted plan has no region: its row is the plan alone, one row per instance.
 */
export function GrantShapeFields({ enabled, disabled = false, disabledNote }: {
	enabled: boolean;
	/** A comp bound to a cluster keeps its shape; the server answers 409 to any change. */
	disabled?: boolean;
	disabledNote?: string;
}) {
	const { control, watch, setValue, trigger } = useFormContext<ShapeFieldValues>();
	const rows = useFieldArray({ control, name: 'shape' });
	const plansQuery = useQuery({ ...getPlansQueryOptions(), enabled });
	const regionsQuery = useQuery({ ...getRegionsQueryOptions(), enabled });
	const plans = [...(plansQuery.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
	const regions = [...(regionsQuery.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
	const shape = watch('shape') ?? [];

	const addRow = () => {
		// Another region for the same plan is the common case, so the new row starts on the last plan.
		rows.append({ planId: shape.at(-1)?.planId ?? '', regionId: '' });
		// Say what the new row is missing straight away, rather than only after it is touched.
		void trigger('shape');
	};

	return (
		<div className="flex flex-col gap-2">
			<FormField
				control={control}
				name="shape"
				render={() => (
					<FormItem>
						<FormLabel>Cluster shape (required)</FormLabel>
						<p className="text-xs text-muted-foreground">
							One row per region the cluster runs in. The cluster must be created exactly like this to claim the comp,
							and any later change converts it to paid.
						</p>
						<FormMessage />
					</FormItem>
				)}
			/>

			{rows.fields.map((row, index) => {
				const selfHosted = isSelfHostedPlanId(shape[index]?.planId ?? '');
				return (
					<div key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
						<FormField
							control={control}
							name={`shape.${index}.planId`}
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Select
											value={field.value}
											disabled={disabled}
											onValueChange={(planId) => {
												field.onChange(planId);
												// A self-hosted plan has no region; leaving one would be refused at claim.
												if (isSelfHostedPlanId(planId)) { setValue(`shape.${index}.regionId`, ''); }
												void trigger('shape');
											}}
										>
											<SelectTrigger className="w-full" aria-label={`Plan ${index + 1}`}>
												<SelectValue placeholder="Plan" />
											</SelectTrigger>
											<SelectContent>
												{plans.map((plan) => (
													<SelectItem key={plan.id} value={plan.id}>
														{plan.id} <span className="font-light opacity-50">{plan.performanceDescription}</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={control}
							name={`shape.${index}.regionId`}
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Select
											value={field.value}
											disabled={disabled || selfHosted}
											onValueChange={(regionId) => {
												field.onChange(regionId);
												void trigger('shape');
											}}
										>
											<SelectTrigger className="w-full" aria-label={`Region ${index + 1}`}>
												<SelectValue placeholder={selfHosted ? 'No region — self-hosted' : 'Region'} />
											</SelectTrigger>
											<SelectContent>
												{regions.map((region) => (
													<SelectItem key={region.id} value={region.id}>
														{region.id} <span className="font-light opacity-50">{region.region}</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Remove row ${index + 1}`}
							disabled={disabled}
							onClick={() => {
								rows.remove(index);
								void trigger('shape');
							}}
						>
							<XIcon className="size-4" />
						</Button>
					</div>
				);
			})}

			{disabled
				? disabledNote && <p className="text-xs text-muted-foreground">{disabledNote}</p>
				: (
					<Button type="button" variant="outline" size="sm" className="w-fit" onClick={addRow}>
						<PlusIcon className="size-4" /> Add region
					</Button>
				)}
		</div>
	);
}
