import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { SchemaPlanLimits, SchemaResourcesPerInstance } from '@/lib/api.gen';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { cn } from '@/lib/cn';
import { humanFileSize } from '@/lib/humanFileSize';
import { humanNumber } from '@/lib/humanNumber';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function ResourcesPerInstance({ planLimits, resourcesPerInstance }: {
	readonly planLimits: SchemaPlanLimits,
	readonly resourcesPerInstance: SchemaResourcesPerInstance
}) {
	const [toggled, setToggled] = useState(false);
	const onUsageLimitsClick = useCallback(() => {
		setToggled(!toggled);
	}, [toggled, setToggled]);

	const rows = useMemo(() => [
		planLimits.totalReadCount > 0 && {
			label: 'Total Reads',
			value: `${humanNumber(planLimits.totalReadCount)} reads`,
		},
		planLimits.totalReadsBytes > 0 && {
			label: 'Total Read Transfer',
			value: `${humanFileSize(planLimits.totalReadsBytes)}`,
		},
		planLimits.readsPerMinuteCount! > 0 && {
			label: 'Read Rate',
			value: `${humanNumber(planLimits.readsPerMinuteCount! * 60)}/min`,
		},
		planLimits.readsPerMinuteBytes! > 0 && {
			label: 'Read Bandwidth',
			value: `${humanFileSize(planLimits.readsPerMinuteBytes! * 60)}/min`,
		},
		planLimits.totalWriteCount > 0 && {
			label: 'Total Writes',
			value: `${humanNumber(planLimits.totalWriteCount)} reads`,
		},
		planLimits.totalWritesBytes > 0 && {
			label: 'Total Write Transfer',
			value: `${humanFileSize(planLimits.totalWritesBytes)}`,
		},
		planLimits.writesPerMinuteCount! > 0 && {
			label: 'Write Rate',
			value: `${humanNumber(planLimits.writesPerMinuteCount! * 60)}/min`,
		},
		planLimits.writesPerMinuteBytes! > 0 && {
			label: 'Write Bandwidth',
			value: `${humanFileSize(planLimits.writesPerMinuteBytes! * 60)}/min`,
		},
		planLimits.totalRealTimeMessageDeliveries > 0 && {
			label: 'Total Real-Time Messages',
			value: `${humanNumber(planLimits.totalRealTimeMessageDeliveries)} messages`,
		},
		planLimits.totalRealTimeMessageDeliveryBytes > 0 && {
			label: 'Total Real-Time Message Transfer',
			value: `${humanFileSize(planLimits.totalRealTimeMessageDeliveryBytes)}`,
		},
		planLimits.realTimeMessageDeliveriesPerMinute! > 0 && {
			label: 'Real-Time Message Rate',
			value: `${humanNumber(planLimits.realTimeMessageDeliveriesPerMinute! * 60)}/min`,
		},
		planLimits.realTimeMessageDeliveryBytesPerMinute! > 0 && {
			label: 'Real-Time Message Bandwidth',
			value: `${humanFileSize(planLimits.realTimeMessageDeliveryBytesPerMinute! * 60)}/min`,
		},
		planLimits.tlsHandshakes! > 0 && {
			label: 'TLS Handshakes',
			value: `${humanNumber(planLimits.tlsHandshakes! * 60)}`,
		},
		planLimits.applicationComputeHours! > 0 && {
			label: 'Application Compute Hours',
			value: `${humanNumber(planLimits.applicationComputeHours! * 60)}`,
		},
		resourcesPerInstance?.storageGb! > 0 && {
			label: 'Storage',
			value: `${humanFileSize(resourcesPerInstance.storageGb! * 1000_000_000)}`,
		},
		planLimits.expirationMonths > 0 && planLimits.expirationMonths < 1000 && {
			label: 'Expiration',
			value: `${planLimits.expirationMonths} months`,
		},
	].filter(excludeFalsy), [planLimits, resourcesPerInstance]);

	return <FormItem className="col-span-3 md:col-span-6">
		<FormLabel>
			Purchasing usage block for {planLimits.readsPerMinuteCount! > 0 ? humanNumber(planLimits.readsPerMinuteCount!) + ' reads/min & ' : ''}
			{humanNumber(planLimits.totalReadCount)} total reads per {planLimits.readsPerMinuteCount! > 0 ? 'region' : 'server'},<br/>
			{planLimits.writesPerMinuteCount! > 0 ? humanNumber(planLimits.writesPerMinuteCount!) + ' writes/min & ' : ''} {humanNumber(planLimits.totalWriteCount!)} total writes, for 3 months.
			<Button
				type="button"
				variant="link"
				className="text-white cursor-pointer"
				onClick={onUsageLimitsClick}
			>
				Learn More {toggled ? <ArrowDownIcon /> : <ArrowRightIcon />}
			</Button>
		</FormLabel>
		<FormControl>
			<dl className={cn('divide-y divide-black overflow-hidden transition-[max-height] duration-200 ease-in', toggled ? 'max-h-fit' : 'max-h-0')}>
				This plan licenses Harper for the usage limits below, for the price listed above. The usage license expires in three months or when any usage
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
