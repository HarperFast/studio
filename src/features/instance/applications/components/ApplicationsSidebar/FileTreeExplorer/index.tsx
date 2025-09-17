import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';
import { Folder } from './Folder';
import './filetree.css';

export function FileTreeExplorer({ files }: { readonly files: GetComponentsResponse }) {
	return (
		<div>
			<div>
				<ul className="text-gray-400">
					<Folder directoryEntry={files} depth={0} />
				</ul>
			</div>
		</div>
	);
}
