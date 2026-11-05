import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatFullTimestamp, formatRelativeTime } from '@/features/organization/serviceAccounts/lib/timeText';

/** A relative time for the middle of a sentence ("1 minute ago"), with the full time on hover. */
export function SentenceTime({ value }: { value: string }) {
	const text = formatRelativeTime(value);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<time dateTime={value} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
					{text.charAt(0).toLowerCase() + text.slice(1)}
				</time>
			</TooltipTrigger>
			<TooltipContent>{formatFullTimestamp(value)}</TooltipContent>
		</Tooltip>
	);
}
