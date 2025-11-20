import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { BadgeNodeVariantValues, memoizeNodeNames } from '@/components/ui/utils/badgeNode';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import Editor from '@monaco-editor/react';
import { Save, Trash } from 'lucide-react';

function isJsonString(str: string) {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
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
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>Edit Row</DialogTitle>
				</DialogHeader>
				{data ? (
					// <Editor className="w-full h-96" language="json" theme="vs-dark" value={JSON.stringify(data, null, 4)} />
					<div className="flex flex-col gap-3 text-white">
						<div>
							<h3 className="inline-block pr-2">Level:</h3>
							<Badge variant={renderBadgeLogLevelVariant(data.level)}>
								{capitalizeWords(data.level)}
							</Badge>
						</div>
						<div>
							<h3>Timestamp:</h3>
							<p className="text-sm">{data.timestamp}</p>
						</div>
						<div>
							<h3>Thread:</h3>
							<p className="text-sm">{data.thread}</p>
						</div>
						<div>
							<h3>Node:</h3>
							<Badge variant={variant}>{data.node}</Badge>
						</div>

						<div>
							<h3>Tags:</h3>
							<p className="text-sm">{data.tags && data.tags.length > 0 ? <span>{data.tags}</span> : 'N/A'}</p>
						</div>

						<div>
							<h3 className="text-lg font-bold">Message</h3>
							<Editor
								className="w-full h-72"
								language={isJsonString(data.message) ? 'json' : 'text'}
								theme="vs-dark"
								value={data.message}
								options={{
									readOnly: true,
									minimap: {
										enabled: false,
									},
									scrollBeyondLastLine: false,
								}}
							/>
						</div>
					</div>
				) : (
					<Loading />
				)}
				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button type="button" variant="destructive" className="rounded-full">
							<Trash /> Delete Row
						</Button>
						<Button variant="submit" className="rounded-full">
							<Save /> Save Changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
