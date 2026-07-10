import { cn } from '@/lib/cn';
import { DatabaseIcon, PlusIcon, Table2Icon } from 'lucide-react';
import type { TreeItem } from 'react-complex-tree';
import type { DbTreeData } from './buildItems';

const iconClassName = 'mr-1.5 h-4 w-4 shrink-0 pointer-events-none';

export function ItemTitle({ title, item }: {
	title: string;
	item: TreeItem<DbTreeData>;
}) {
	const kind = item.data.kind;
	return (
		<>
			{
				/* Palette matches the applications sidebar: green "+" (New Application), orange containers
			    (folders/databases), and a neutral leaf icon that inherits the row's text color -- so the
			    two trees read as one system and stay high-contrast in both light and dark mode. */
			}
			{kind === 'createTable'
				? <PlusIcon className={cn(iconClassName, 'text-green-500')} />
				: kind === 'database'
				? <DatabaseIcon className={cn(iconClassName, 'text-orange-400')} />
				: <Table2Icon className={iconClassName} />}
			<span className="text-nowrap pointer-events-none">{title}</span>
		</>
	);
}
