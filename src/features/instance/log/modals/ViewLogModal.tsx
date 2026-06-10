import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { BadgeNodeVariantValues, memoizeNodeNames } from '@/components/ui/utils/badgeNode';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { capitalizeWords } from '@/lib/string/capitalizeWords';

function isJsonString(str: string) {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
			<span className="text-xs font-medium text-muted-foreground w-20 shrink-0 pt-0.5">{label}</span>
			<span className="text-xs">{children}</span>
		</div>
	);
}

export function ViewLogModal({
	setIsModalOpen,
	isModalOpen,
	data,
}: {
	setIsModalOpen: (open: boolean) => void;
	isModalOpen: boolean;
	data: ReadLogItem | undefined;
}) {
	const variant: BadgeNodeVariantValues = data ? memoizeNodeNames(data.node) : 'default';
	const monacoTheme = useMonacoTheme();

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Log Entry</DialogTitle>
				</DialogHeader>
				{data
					? (
						<div className="flex flex-col gap-2 text-popover-foreground">
							<div className="rounded-md border border-border/50 bg-muted/20 px-3 py-1">
								<MetaRow label="Level">
									<Badge variant={renderBadgeLogLevelVariant(data.level)}>
										{capitalizeWords(data.level)}
									</Badge>
								</MetaRow>
								<MetaRow label="Timestamp">
									<span className="tabular-nums">{new Date(data.timestamp).toLocaleString()}</span>
								</MetaRow>
								<MetaRow label="Thread">
									<span className="tabular-nums font-mono">{data.thread}</span>
								</MetaRow>
								{data.node && (
									<MetaRow label="Node">
										<Badge variant={variant}>{data.node}</Badge>
									</MetaRow>
								)}
								{data.tags && data.tags.length > 0 && (
									<MetaRow label="Tags">
										<span className="font-mono">{data.tags}</span>
									</MetaRow>
								)}
							</div>

							<div>
								<p className="text-xs font-medium text-muted-foreground mb-1.5">Message</p>
								<div className="rounded-md overflow-hidden border border-border/50 h-72">
									<Editor
										className="w-full h-full"
										language={isJsonString(data.message) ? 'json' : 'text'}
										theme={monacoTheme}
										value={data.message}
										options={{
											readOnly: true,
											minimap: { enabled: false },
											scrollBeyondLastLine: false,
											fontSize: 12,
											padding: { top: 12, bottom: 12 },
										}}
									/>
								</div>
							</div>
						</div>
					)
					: <Loading />}
			</DialogContent>
		</Dialog>
	);
}
