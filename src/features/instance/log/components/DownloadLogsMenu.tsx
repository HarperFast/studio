import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/pluralize';
import { DownloadIcon } from 'lucide-react';
import { downloadLogs } from '../lib/exportLogs';

export function DownloadLogsMenu({ logs, logName, iconOnly, className }: {
	logs: readonly ReadLogItem[];
	logName: string;
	iconOnly?: boolean;
	className?: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="defaultOutline"
					size={iconOnly ? 'icon' : 'default'}
					disabled={logs.length === 0}
					aria-label="Download logs"
					className={cn('shrink-0', className)}
				>
					<DownloadIcon />
					{!iconOnly && 'Download'}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					Saves the {pluralize(logs.length, 'entry', 'entries')} shown
				</DropdownMenuLabel>
				<DropdownMenuItem onSelect={() => downloadLogs(logs, 'txt', logName)}>
					Text (.txt)
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => downloadLogs(logs, 'json', logName)}>
					JSON (.json)
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
