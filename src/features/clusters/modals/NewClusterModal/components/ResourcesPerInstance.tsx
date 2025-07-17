import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { SchemaResourcesPerInstance } from '@/lib/api.gen';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { cn } from '@/lib/cn';
import { humanFileSize } from '@/lib/humanFileSize';
import { humanNumber } from '@/lib/humanNumber';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function ResourcesPerInstance({ resourcesPerInstance }: {
	readonly resourcesPerInstance: SchemaResourcesPerInstance
}) {
	const [toggled, setToggled] = useState(false);
	const onUsageLimitsClick = useCallback(() => {
		setToggled(!toggled);
	}, [toggled, setToggled]);

	const rows = useMemo(() => [
		resourcesPerInstance.readIopsLimit && {
			label: 'Reads',
			value: `${humanNumber(resourcesPerInstance.readIopsLimit * 60)}/min`,
		},
		resourcesPerInstance.writeIopsLimit && {
			label: 'Writes',
			value: `${humanNumber(resourcesPerInstance.writeIopsLimit * 60)}/min`,
		},
		resourcesPerInstance.cpuCores && {
			label: 'CPU Cores',
			value: `${humanNumber(resourcesPerInstance.cpuCores)}`,
		},
		resourcesPerInstance.threads && {
			label: 'Threads',
			value: `${humanNumber(resourcesPerInstance.threads)}`,
		},
		resourcesPerInstance.memoryMb && {
			label: 'Memory',
			value: humanFileSize(resourcesPerInstance.memoryMb, 1024 * 1024),
		},
		resourcesPerInstance.storageGb && {
			label: 'Storage',
			value: humanFileSize(resourcesPerInstance.storageGb, 1024 * 1024 * 1024),
		},
	].filter(excludeFalsy), [resourcesPerInstance]);


	return <FormItem className="md:col-span-6">
		<FormLabel className="pb-1 inline-flex">
			<Button
				type="button"
				variant="link"
				className="text-white cursor-pointer"
				onClick={onUsageLimitsClick}
			>
				Usage Limits
				{toggled ? <ArrowDownIcon /> : <ArrowRightIcon />}
			</Button>
		</FormLabel>
		<FormControl>
			<dl className={cn('divide-y divide-black overflow-hidden transition-[max-height] duration-200 ease-in', toggled ? 'max-h-48' : 'max-h-0')}>
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
