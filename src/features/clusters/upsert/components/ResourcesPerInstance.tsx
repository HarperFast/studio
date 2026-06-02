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
import {
	ArrowDownIcon,
	ArrowDownToLineIcon,
	ArrowRightIcon,
	ArrowUpFromLineIcon,
	CalendarClockIcon,
	GaugeIcon,
	type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { logarithmicFill, UsageScale } from '../lib/calculateUsageScale';

export function ResourcesPerInstance({ selectedPlan, selectedRegion, usageScale, isEnterprise, cloudProvider }: {
	readonly selectedPlan: SchemaPlan | undefined;
	readonly selectedRegion: SchemaRegion | undefined;
	readonly usageScale: UsageScale;
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

	const forThePriceAbove = isEnterprise
		? 'for the contracted rate'
		: 'for the price listed above';
	const expiresInMonths = expirationMonths ? ` in ${pluralize(expirationMonths, 'month', 'months')} or` : '';

	const readRate = isPositive(planLimits.readsPerMinuteCount) ? planLimits.readsPerMinuteCount * multiplier : 0;
	const writeRate = isPositive(planLimits.writesPerMinuteCount) ? planLimits.writesPerMinuteCount : 0;
	const totalReads = planLimits.totalReadCount * multiplier;
	const totalWrites = isPositive(planLimits.totalWriteCount) ? planLimits.totalWriteCount : 0;

	const usageStats = ([
		readRate > 0 && {
			icon: GaugeIcon,
			label: 'Read Rate',
			value: `${humanNumber(readRate)}/min`,
			fill: logarithmicFill(readRate, usageScale.readRate),
		},
		totalReads > 0 && {
			icon: ArrowUpFromLineIcon,
			label: 'Total Reads',
			value: humanNumber(totalReads),
			fill: logarithmicFill(totalReads, usageScale.totalReads),
		},
		writeRate > 0 && {
			icon: GaugeIcon,
			label: 'Write Rate',
			value: `${humanNumber(writeRate)}/min`,
			fill: logarithmicFill(writeRate, usageScale.writeRate),
		},
		totalWrites > 0 && {
			icon: ArrowDownToLineIcon,
			label: 'Total Writes',
			value: humanNumber(totalWrites),
			fill: logarithmicFill(totalWrites, usageScale.totalWrites),
		},
		!!expirationMonths && {
			icon: CalendarClockIcon,
			label: 'License Term',
			value: pluralize(expirationMonths, 'month', 'months'),
		},
	] satisfies Array<boolean | { icon: LucideIcon; label: string; value: string; fill?: number }>).filter(excludeFalsy);

	return (
		<FormItem className="basis-full">
			<div className="flex flex-wrap items-center justify-between gap-x-2">
				<FormLabel onClick={onUsageLimitsClick} className="cursor-pointer">
					Usage block included with this plan
				</FormLabel>
				<Button
					type="button"
					variant="link"
					className="text-foreground"
					onClick={onUsageLimitsClick}
				>
					Learn More {toggled ? <ArrowDownIcon /> : <ArrowRightIcon />}
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{usageStats.map(stat => (
					<UsageStat
						key={stat.label}
						icon={stat.icon}
						label={stat.label}
						value={stat.value}
						fill={stat.fill}
					/>
				))}
			</div>
			<FormControl>
				<dl
					className={cn(
						'divide-y divide-border rounded-md overflow-hidden transition-[max-height] duration-200 ease-in',
						toggled ? 'max-h-fit border border-border' : 'max-h-0',
					)}
				>
					<div className="text-sm px-4 py-5 leading-relaxed text-muted-foreground">
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

function UsageStat({ icon: Icon, label, value, fill }: {
	readonly icon: LucideIcon;
	readonly label: string;
	readonly value: string;
	readonly fill?: number;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-3">
			<div className="flex items-center gap-1.5 text-muted-foreground">
				<Icon className="size-4 shrink-0" />
				<span className="text-xs font-medium">{label}</span>
			</div>
			<span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
			{fill !== undefined && (
				<div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-500/15">
					<div
						className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
						style={{ width: `${Math.max(Math.min(fill, 1) * 100, 4)}%` }}
					/>
				</div>
			)}
		</div>
	);
}
