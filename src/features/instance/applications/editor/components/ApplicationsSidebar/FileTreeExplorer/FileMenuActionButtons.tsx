import { Button } from '@/components/ui/button';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

export function FileMenuActionButtons() {
	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
	return (
		<div className="p-2">
			<div>
				<Button
					onClick={() => setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked)}
					disabled={false}
					variant="positiveOutline"
					size="sm"
					className="mr-2"
				>
					<Plus className="w-4 h-4" />
					<span className="ms-1"> File</span>
				</Button>
				<Button
					onClick={() => setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked)}
					disabled={false}
					variant="positiveOutline"
					size="sm"
					className="mr-2"
				>
					<Plus className="w-4 h-4" />
					<span className="ms-1"> Folder</span>
				</Button>
				<Button
					onClick={() => setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked)}
					disabled={false}
					variant="destructiveOutline"
					size="sm"
				>
					<Minus className="w-4 h-4" />
					<span className="ms-1"> Delete</span>
				</Button>
			</div>

			<AddFolderFileModal isModalOpen={isAddFolderOrFileClicked} setIsModalOpen={setIsAddFolderOrFileClicked} />
		</div>
	);
}
