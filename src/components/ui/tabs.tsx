import { cn } from '@/lib/cn';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				'text-muted-foreground inline-flex w-fit items-center justify-center rounded-full bg-black-dark p-1',
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				// 'data-[state=inactive]:border-b-4 data-[state=inactive]:border-b-grey-700 ' +
				'data-[state=active]:text-white data-[state=active]:bg-gray-600 ' +
				'dark:data-[state=active]:text-foreground ' +
				'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring ' +
				'focus-visible:ring-[3px] focus-visible:outline-1 ' +
				'text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 ' +
				'border rounded-full border-transparent ' +
				'px-2 py-1 ' +
				'font-medium whitespace-nowrap ' +
				'transition-[color,box-shadow] ' +
				'disabled:pointer-events-none disabled:opacity-50 ' +
				'[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
