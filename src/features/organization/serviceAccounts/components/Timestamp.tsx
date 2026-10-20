import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
	formatCompactDate,
	formatFullTimestamp,
	formatRelativeTime,
} from '@/features/organization/serviceAccounts/lib/timeText';
import { cn } from '@/lib/cn';

export function Timestamp(
	{ value, format, className }: { value: string; format: 'date' | 'relative'; className?: string },
) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<time
					dateTime={value}
					tabIndex={0}
					className={cn('rounded-sm focus-visible:outline-2 focus-visible:outline-ring', className)}
				>
					{format === 'date' ? formatCompactDate(value) : formatRelativeTime(value)}
				</time>
			</TooltipTrigger>
			<TooltipContent>{formatFullTimestamp(value)}</TooltipContent>
		</Tooltip>
	);
}
