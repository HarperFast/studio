import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { SchemaRegion, SchemaPlanLimits, SchemaResourcesPerInstance } from '@/lib/api.gen';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { cn } from '@/lib/cn';
import { humanFileSize } from '@/lib/humanFileSize';
import { humanNumber } from '@/lib/humanNumber';
import { pluralize } from '@/lib/pluralize';
import { isPositive } from '@/lib/types/isPositive';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function ResourcesPerInstance({ planLimits, resourcesPerInstance, selectedRegion }: {
	readonly planLimits: SchemaPlanLimits | undefined,
	readonly resourcesPerInstance: SchemaResourcesPerInstance | undefined
	readonly selectedRegion: SchemaRegion | undefined
}) {
	const [toggled, setToggled] = useState(false);
	const onUsageLimitsClick = useCallback(() => {
		setToggled(!toggled);
	}, [toggled, setToggled]);

	const expirationMonths = isPositive(planLimits?.expirationMonths) && planLimits.expirationMonths < 1000 && planLimits.expirationMonths;
	const multiplier = selectedRegion?.purchasedBlockMultiplier ?? 1;
	const rows = useMemo(() => {
		if (!planLimits || !resourcesPerInstance) {
			return [];
		}
		return [
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
				value: `${humanNumber(planLimits.applicationComputeHours * 60 * multiplier)}`,
			},
			isPositive(resourcesPerInstance?.storageGb) && {
				label: 'Storage',
				value: `${humanFileSize(resourcesPerInstance.storageGb * 1000_000_000)}`,
			},
			expirationMonths && {
				label: 'Expiration',
				value: pluralize(expirationMonths, 'month', 'months'),
			},
		].filter(excludeFalsy);
	}, [expirationMonths, planLimits, resourcesPerInstance, multiplier]);

	if (!planLimits || !resourcesPerInstance) {
		// The user hasn't selected a plan yet. so let's not show anything for the ResourcesPerInstance space yet.
		return '';
	}

	if (!isPositive(planLimits.totalReadCount)) {
		return 'This plan has no usage limits.';
	}

	return <FormItem className="basis-full">
		<FormLabel>
			Purchasing usage block for {isPositive(planLimits.readsPerMinuteCount) ? `${humanNumber(planLimits.readsPerMinuteCount * multiplier)} reads/min & ` : ''}
			{humanNumber(planLimits.totalReadCount * multiplier)} total reads {isPositive(planLimits.readsPerMinuteCount) ? 'in ' + (selectedRegion?.region ?? '') + ' region' : 'per server'},<br className="hidden sm:block" />
			{isPositive(planLimits.writesPerMinuteCount) ? ` ${humanNumber(planLimits.writesPerMinuteCount)} writes/min & ` : ' '}
			{humanNumber(planLimits.totalWriteCount)} total writes{expirationMonths && `, for ${pluralize(expirationMonths, 'month', 'months')}`}.
			<br className="block sm:hidden" />
			<Button
				type="button"
				variant="link"
				className="text-white"
				onClick={onUsageLimitsClick}
			>
				Learn More {toggled ? <ArrowDownIcon /> : <ArrowRightIcon />}
			</Button>
		</FormLabel>
		<FormControl>
			<dl className={cn('divide-y divide-black overflow-hidden transition-[max-height] duration-200 ease-in', toggled ? 'max-h-fit' : 'max-h-0')}>
				This plan licenses Harper for the usage limits below, for the price listed above. The usage license
				expires {expirationMonths && `in ${pluralize(expirationMonths, 'month', 'months')} or `}when any usage
				limit is reached. Usage blocks can be purchased as they are consumed.
				{rows.map((row, index) =>
					<div key={row.label} className={cn('px-4 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-3', index % 2 === 0 && 'bg-gray-700')}>
						<dt className="text-sm/6 font-medium text-gray-300">{row.label}</dt>
						<dd className="mt-1 text-sm/6 sm:col-span-2 sm:mt-0">{row.value}</dd>
					</div>)}
			</dl>
		</FormControl>
		<FormMessage />
	</FormItem>;
}
