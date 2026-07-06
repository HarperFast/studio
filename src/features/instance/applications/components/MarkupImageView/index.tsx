/**
 * Preview-with-source-editing view for markup-based images — in practice, SVGs.
 *
 * A raster image is binary and can only be looked at, so it gets the read-only
 * media preview (see ContentViewer). An SVG, though, *is* text (XML): it's just
 * as useful to tweak the markup as to look at the picture. So — mirroring the
 * `.env` editor's "edit as text" escape hatch — we default to the rendered image
 * but let the user drop down into the Monaco editor to edit the source, then
 * flip back to the preview.
 *
 * The file is loaded as text (see getComponentFile), so the preview is built
 * from that text via a `data:` URL rendered in an `<img>`. Rendering through
 * `<img>` (rather than inlining the markup) sandboxes it: scripts and remote
 * fetches inside the SVG don't execute. Unsaved edits from the source editor are
 * reflected live, since both read the same buffer.
 */
import { Button } from '@/components/ui/button';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { MarkupImageType } from '@/lib/string/markupImageType';
import { CodeIcon, ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { TextEditorView } from '../TextEditorView';

export function MarkupImageView({ media }: { media: MarkupImageType }) {
	const { openedEntry, openedEntryContents } = useEditorView();
	// The source editor writes unsaved edits here (keyed exactly as TextEditorView
	// does), so the preview can reflect them without a save round-trip.
	const { content: updatedFileContent } = useEditorFileContent(
		!!openedEntry && !openedEntry.package && openedEntry.path,
	);
	const [showSource, setShowSource] = useState(false);
	// Track the exact markup that failed to render (not a sticky boolean) so that
	// editing it — e.g. fixing malformed XML — is retried automatically: once
	// `source` changes it no longer matches, and the <img> gets another attempt.
	const [failedSource, setFailedSource] = useState<string | undefined>(undefined);

	if (showSource) {
		return (
			<>
				<TextEditorView />
				<Button
					type="button"
					variant="defaultOutline"
					size="sm"
					className="absolute top-11 right-4 z-10"
					onClick={() => setShowSource(false)}
				>
					<ImageIcon /> Preview
				</Button>
			</>
		);
	}

	const source = updatedFileContent ?? openedEntryContents;
	const renderFailed = source !== undefined && source === failedSource;

	return (
		<>
			<div className="mt-9 absolute top-0 right-0 bottom-0 left-0">
				{source && !renderFailed
					? (
						<img
							className="w-full h-full object-contain p-20"
							alt={openedEntry?.name}
							src={`data:${media.mime};charset=utf-8,${encodeURIComponent(source)}`}
							onError={() => setFailedSource(source)}
						/>
					)
					: source
					? (
						<div className="w-full h-full flex items-center justify-center p-8 text-center text-muted-foreground">
							<p className="max-w-md text-sm">
								This {openedEntry?.name ?? 'image'}{' '}
								couldn&rsquo;t be rendered. Edit it as text to inspect or fix the markup.
							</p>
						</div>
					)
					: null}
			</div>
			<Button
				type="button"
				variant="defaultOutline"
				size="sm"
				className="absolute top-11 right-4 z-10"
				onClick={() => setShowSource(true)}
			>
				<CodeIcon /> Edit as text
			</Button>
		</>
	);
}
