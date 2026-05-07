import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { crawlData, hasTitle } from '@/features/instance/status/crawlData';
import { getStatusQueryOptions } from '@/integrations/api/instance/status/getStatus';
import { getSystemInformationQueryOptions } from '@/integrations/api/instance/status/getSystemInformation';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useMemo } from 'react';

interface Props {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	isLocalStudio: boolean;
}

export function OverviewTab({ instanceParams, isLocalStudio }: Props) {
	return (
		<Suspense fallback={<OverviewSkeleton />}>
			{isLocalStudio
				? <LocalOverview instanceParams={instanceParams} />
				: <CloudOverview instanceParams={instanceParams} />}
		</Suspense>
	);
}

function OverviewSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-lg bg-muted/30 animate-pulse" />)}
		</div>
	);
}

function LocalOverview({ instanceParams }: { instanceParams: InstanceClientIdConfig & InstanceTypeConfig }) {
	const { data } = useSuspenseQuery(getSystemInformationQueryOptions(instanceParams));
	return <OverviewBody data={data as Record<string, unknown>} />;
}

function CloudOverview({ instanceParams }: { instanceParams: InstanceClientIdConfig & InstanceTypeConfig }) {
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceParams));
	return <OverviewBody data={data as Record<string, unknown>} />;
}

export interface SectionGroup {
	title: string;
	rows: { name: string; value: string }[];
	subSections: SectionGroup[];
}

function OverviewBody({ data }: { data: Record<string, unknown> }) {
	const sections = useMemo(() => groupSections(data), [data]);

	return (
		<div className="space-y-4">
			{
				/* Default-open the first section only — opening every accordion
			    item produces a wall of text on first paint and defeats the
			    purpose of the collapsible. */
			}
			<Accordion type="multiple" defaultValue={sections.slice(0, 1).map((s) => s.title)}>
				{sections.map((section) => (
					<AccordionItem key={section.title} value={section.title}>
						<AccordionTrigger className="text-base font-semibold">{section.title}</AccordionTrigger>
						<AccordionContent>
							<SectionContent section={section} />
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
			<details className="rounded-lg border border-border bg-card">
				<summary className="cursor-pointer px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
					View raw JSON
				</summary>
				<pre className="px-4 pb-4 text-xs overflow-auto max-h-96">
					{JSON.stringify(data, null, 2)}
				</pre>
			</details>
		</div>
	);
}

function SectionContent({ section }: { section: SectionGroup }) {
	return (
		<div className="space-y-3">
			{section.rows.length > 0 && (
				<Card>
					<CardContent className="pt-4">
						<dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
							{section.rows.map((row) => (
								<div key={row.name} className="flex justify-between gap-4">
									<dt className="text-muted-foreground">{row.name}</dt>
									<dd className="font-mono text-right truncate" title={row.value}>{row.value}</dd>
								</div>
							))}
						</dl>
					</CardContent>
				</Card>
			)}
			{section.subSections.map((sub) => (
				<div key={sub.title} className="pl-3 border-l border-border">
					<div className="text-sm font-semibold mb-2 text-muted-foreground">{sub.title}</div>
					<SectionContent section={sub} />
				</div>
			))}
		</div>
	);
}

export function groupSections(data: Record<string, unknown>): SectionGroup[] {
	const items = crawlData(data);
	type GroupWithDepth = SectionGroup & { _depth: number };
	const top: SectionGroup[] = [];
	const stack: GroupWithDepth[] = [];
	let general: SectionGroup | null = null;

	for (const item of items) {
		if (hasTitle(item)) {
			while (stack.length > 0 && stack[stack.length - 1]._depth >= item.depth) {
				stack.pop();
			}
			const group: GroupWithDepth = {
				title: item.title,
				rows: [],
				subSections: [],
				_depth: item.depth,
			};
			if (stack.length === 0) {
				top.push(group);
			} else {
				stack[stack.length - 1].subSections.push(group);
			}
			stack.push(group);
		} else {
			const target = stack[stack.length - 1];
			if (target) {
				target.rows.push({ name: item.name, value: item.value });
			} else {
				if (!general) {
					general = { title: 'General', rows: [], subSections: [] };
					top.unshift(general);
				}
				general.rows.push({ name: item.name, value: item.value });
			}
		}
	}
	return top;
}
