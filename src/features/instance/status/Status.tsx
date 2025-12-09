import { crawlData, hasTitle } from '@/features/instance/status/crawlData';
import { cn } from '@/lib/cn';
import { useMemo } from 'react';

export function Status({ data }: { data: Record<string, unknown> }) {
	const items = useMemo(() => crawlData(data), [data]);
	return (
		<div className="max-w-96 grid mb-12">
			{items.map((item, index) =>
				hasTitle(item)
					? (
						<div
							key={index}
							className={cn('font-semibold text-xl', index !== 0 && 'mt-4')}
							style={{ paddingLeft: item.depth * 12 + 'px' }}
						>
							{item.title}
						</div>
					)
					: (
						<div key={index} style={{ paddingLeft: item.depth * 12 + 'px' }}>
							<span className="text-muted-foreground">{item.name}:</span>
							{item.value}
						</div>
					)
			)}
		</div>
	);
}
