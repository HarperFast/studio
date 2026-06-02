import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { cn } from '@/lib/cn';
import { humanFileSize } from '@/lib/humanFileSize';
import { humanNumber } from '@/lib/humanNumber';
import { pluralize } from '@/lib/pluralize';
import { isPositive } from '@/lib/types/isPositive';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function ResourcesPerInstance({ selectedPlan, selectedRegion, isEnterprise, cloudProvider }: {
	readonly selectedPlan: SchemaPlan | undefined;
	readonly selectedRegion: SchemaRegion | undefined;
	readonly isEnterprise: boolean;
	readonly cloudProvider: keyof SchemaCloudInstanceTypes | undefined;
}) {
	const [toggled, setToggled] = useState(false);
	const onUsageLimitsClick = useCallback(() => {
		setToggled(!toggled);
	}, [toggled, setToggled]);
	const planLimits = selectedPlan?.planLimits;
	const resourcesPerInstance = selectedPlan?.resourcesPerInstance;
	const cloudInstanceType = cloudProvider && selectedPlan?.cloudInstanceTypes?.[cloudProvider];

	const expirationMonths = isPositive(planLimits?.expirationMonths) && planLimits.expirationMonths < 1000
		&& planLimits.expirationMonths;
	const multiplier = selectedRegion?.purchasedBlockMultiplier ?? 1;
	const rows = useMemo<{ label: string; value: string }[]>(() => {
		if (!planLimits) {
			return [];
		}
		return ([
			isPositive(planLimits.totalReadCount) && {
				label: 'Total Reads',
				value: `${humanNumber(planLimits.totalReadCount * multiplier)} reads`,
			},
			isPositive(planLimits.totalReadsBytes) && {
				label: 'Total Read Transfer',
				value: `${humanFileSize(planLimits.totalReadsBytes * multiplier)}`,
			},
			isPositive(planLimits.readsPerMinuteCount) && {
				label: 'Read Rate',
				value: `${humanNumber(planLimits.readsPerMinuteCount * 60 * multiplier)}/min`,
			},
			isPositive(planLimits.readsPerMinuteBytes) && {
				label: 'Read Bandwidth',
				value: `${humanFileSize(planLimits.readsPerMinuteBytes * 60 * multiplier)}/min`,
			},
			isPositive(planLimits.totalWriteCount) && {
				label: 'Total Writes',
				value: `${humanNumber(planLimits.totalWriteCount)} reads`,
			},
			isPositive(planLimits.totalWritesBytes) && {
				label: 'Total Write Transfer',
				value: `${humanFileSize(planLimits.totalWritesBytes)}`,
			},
			isPositive(planLimits.writesPerMinuteCount) && {
				label: 'Write Rate',
				value: `${humanNumber(planLimits.writesPerMinuteCount * 60)}/min`,
			},
			isPositive(planLimits.writesPerMinuteBytes) && {
				label: 'Write Bandwidth',
				value: `${humanFileSize(planLimits.writesPerMinuteBytes * 60)}/min`,
			},
			isPositive(planLimits.totalRealTimeMessageDeliveries) && {
				label: 'Total Real-Time Messages',
				value: `${humanNumber(planLimits.totalRealTimeMessageDeliveries * multiplier)} messages`,
			},
			isPositive(planLimits.totalRealTimeMessageDeliveryBytes) && {
				label: 'Total Real-Time Message Transfer',
				value: `${humanFileSize(planLimits.totalRealTimeMessageDeliveryBytes * multiplier)}`,
			},
			isPositive(planLimits.realTimeMessageDeliveriesPerMinute) && {
				label: 'Real-Time Message Rate',
				value: `${humanNumber(planLimits.realTimeMessageDeliveriesPerMinute * 60 * multiplier)}/min`,
			},
			isPositive(planLimits.realTimeMessageDeliveryBytesPerMinute) && {
				label: 'Real-Time Message Bandwidth',
				value: `${humanFileSize(planLimits.realTimeMessageDeliveryBytesPerMinute * 60 * multiplier)}/min`,
			},
			isPositive(planLimits.tlsHandshakes) && {
				label: 'TLS Handshakes',
				value: `${humanNumber(planLimits.tlsHandshakes * 60 * multiplier)}`,
			},
			isPositive(planLimits.applicationComputeHours) && {
				label: 'Application Compute Hours',
				value: `${humanNumber(planLimits.applicationComputeHours * multiplier)}`,
			},
			!!resourcesPerInstance && isPositive(resourcesPerInstance.storageGb) && {
				label: 'Storage',
				value: `${humanFileSize(resourcesPerInstance.storageGb * 1000_000_000)}`,
			},
			!!resourcesPerInstance && isPositive(resourcesPerInstance.cpuCores) && {
				label: 'Maximum CPU Cores',
				value: `${humanNumber(resourcesPerInstance.cpuCores)}`,
			},
			!!resourcesPerInstance && isPositive(resourcesPerInstance.memoryMb) && {
				label: 'Memory',
				value: `${resourcesPerInstance.memoryMb / 1024} GB`,
			},
			!!cloudInstanceType && {
				label: 'Cloud Instance Type',
				value: cloudInstanceType,
			},
			!!expirationMonths && {
				label: 'Expiration',
				value: pluralize(expirationMonths, 'month', 'months'),
			},
			!!selectedRegion?.id && {
				label: 'Region ID',
				value: selectedRegion.id,
			},
			!!selectedPlan?.id && {
				label: 'Plan ID',
				value: selectedPlan.id,
			},
		] satisfies Array<boolean | { label: string; value: string }>).filter(excludeFalsy);
	}, [expirationMonths, selectedRegion, selectedPlan, multiplier]);

	if (!planLimits) {
		// The user hasn't selected a plan yet. so let's not show anything for the ResourcesPerInstance space yet.
		return '';
	}

	if (!isPositive(planLimits.totalReadCount)) {
		return 'This plan has no usage limits.';
	}

	const pricingSubjectToTerms = isEnterprise
		? ' Pricing subject to contracted rate.'
		: ' Beta pricing subject to change.';

	const maybeReadsPerMinute = isPositive(planLimits.readsPerMinuteCount)
		? `${humanNumber(planLimits.readsPerMinuteCount * multiplier)} reads/min & `
		: '';
	const maybeWritesPerMinute = isPositive(planLimits.writesPerMinuteCount)
		? ` ${humanNumber(planLimits.writesPerMinuteCount)} writes/min & `
		: ' ';
	const inRegionOrPerServer = isPositive(planLimits.readsPerMinuteCount)
		? `in ${selectedRegion?.region ?? ''} region`
		: 'per server';
	const forMonths = expirationMonths ? `, for ${pluralize(expirationMonths, 'month', 'months')}` : '';
	const forThePriceAbove = isEnterprise
		? 'for the contracted rate'
		: 'for the price listed above';
	const expiresInMonths = expirationMonths ? ` in ${pluralize(expirationMonths, 'month', 'months')} or` : '';

	return (
		<FormItem className="basis-full">
			<FormLabel onClick={onUsageLimitsClick}>
				Purchasing usage block for {maybeReadsPerMinute}
				{humanNumber(planLimits.totalReadCount * multiplier)} total reads,
				{maybeWritesPerMinute}
				{humanNumber(planLimits.totalWriteCount)} total writes {inRegionOrPerServer}
				{forMonths}. <Badge variant="warning" className="mx-1 align-middle">{pricingSubjectToTerms.trim()}</Badge>
				<br className="block sm:hidden" />
				<Button
					type="button"
					variant="link"
					className="text-foreground"
				>
					Learn More {toggled ? <ArrowDownIcon /> : <ArrowRightIcon />}
				</Button>
			</FormLabel>
			<FormControl>
				<dl
					className={cn(
						'divide-y divide-border rounded-md overflow-hidden transition-[max-height] duration-200 ease-in',
						toggled ? 'max-h-fit border border-border' : 'max-h-0',
					)}
				>
					<div className="text-sm mb-4 px-4 pt-4 leading-relaxed text-muted-foreground">
						This plan licenses Harper for the usage limits below, {forThePriceAbove}. The usage license expires
						{expiresInMonths}{' '}
						when any usage limit is reached. New usage blocks are automatically purchased/billed as blocks are consumed.
					</div>
					{rows.map((row, index) => (
						<div
							key={row.label}
							className={cn(
								'px-4 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-3',
								index % 2 === 0 && 'bg-muted dark:bg-grey-700',
							)}
						>
							<dt className="text-sm/6 font-medium text-foreground">{row.label}</dt>
							<dd className="mt-1 text-sm/6 text-muted-foreground sm:col-span-2 sm:mt-0">{row.value}</dd>
						</div>
					))}
				</dl>
			</FormControl>
			<FormMessage />
		</FormItem>
	);
}
