import { Button } from '@/components/ui/button';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useReadMeUrlTransformer } from '@/features/instance/applications/lib/readMeUrlTransform';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { isProtectedEnvFile } from '@/lib/env/envFile';
import { isBinaryFile } from '@/lib/string/binaryFileType';
import { getMarkupImageType } from '@/lib/string/markupImageType';
import { getMediaFileType, MediaFileType } from '@/lib/string/mediaFileType';
import { CopyIcon, FileArchive } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { newApplication } from './ApplicationsSidebar/specialItems';
import { DirectoryPlaceholder } from './DirectoryPlaceholder';
import { EnvEditorView } from './EnvEditorView';
import { MarkupImageView } from './MarkupImageView';
import { NewApplication } from './NewApplication';
import { TextEditorView } from './TextEditorView';
import './directoryReadMe.css';

export function ContentViewer() {
	const { openedEntry, openedEntryContents } = useEditorView();
	const urlTransform = useReadMeUrlTransformer(openedEntry?.project);

	if (openedEntry?.path === newApplication) {
		return <NewApplication />;
	}

	if (isDirectory(openedEntry)) {
		// No README to show — fill the space with a quiet hint about the folder
		// rather than rendering an empty page. Keyed off overviewEntry (not the
		// loaded contents) so a folder that has a README doesn't flash the hint
		// while its contents are still loading.
		if (!openedEntry.overviewEntry) {
			return <DirectoryPlaceholder name={openedEntry.name} />;
		}
		return (
			<div className="directoryReadMe max-w-3xl">
				<Markdown
					urlTransform={urlTransform}
					remarkPlugins={[remarkGfm]}
					components={{ code: MarkdownCode }}
				>
					{openedEntryContents}
				</Markdown>
			</div>
		);
	}

	const mediaType = getMediaFileType(openedEntry?.name);
	if (mediaType) {
		return <MediaPreview name={openedEntry?.name} base64={openedEntryContents} media={mediaType} />;
	}

	// SVGs are images too, but their source is text (XML). Default to the rendered
	// preview, with an "edit as text" escape hatch to the code editor — the same
	// pattern the `.env` editor uses. Raster/binary images (above) stay preview-only.
	// Keyed by path so the preview/source toggle resets when switching files.
	const markupImageType = getMarkupImageType(openedEntry?.name);
	if (markupImageType) {
		return <MarkupImageView key={openedEntry?.path} media={markupImageType} />;
	}

	// Archives and other binary files would otherwise be decoded as UTF-8 and
	// dumped into the text editor as garbage (and a large archive can lock Monaco
	// up entirely). Show a placeholder instead — its contents are never fetched.
	if (isBinaryFile(openedEntry?.name)) {
		return <BinaryFilePreview name={openedEntry?.name} />;
	}

	// Secret-bearing `.env` files get a managed secrets panel instead of the raw
	// text editor, so values aren't flashed on screen or clobbered by accident.
	// Template files (`.env.example` etc.) hold placeholders, not secrets, and
	// fall through to the text editor. Keyed by path so per-file state (selection,
	// raw-editor toggle) resets when switching files.
	if (isProtectedEnvFile(openedEntry?.name)) {
		return <EnvEditorView key={openedEntry?.path} />;
	}

	return <TextEditorView />;
}

/** Placeholder shown for binary files that can't be edited or previewed as text. */
function BinaryFilePreview({ name }: { name: string | undefined }) {
	return (
		<div className="absolute inset-0 mt-9 flex items-center justify-center p-8 text-center text-muted-foreground">
			<div className="max-w-md">
				<FileArchive className="mx-auto mb-4 h-10 w-10 opacity-60" />
				<p className="font-medium text-foreground">{name ?? 'This file'} can&rsquo;t be previewed</p>
				<p className="mt-1 text-sm">
					It&rsquo;s a binary file. You can still rename or delete it from the file tree.
				</p>
			</div>
		</div>
	);
}

/**
 * Previews a binary media file (image or video) loaded as base64. The base64 is
 * handed straight to a `data:` URL so the browser's (forgiving) decoder reads it
 * — `atob` is stricter and rejects some payloads the browser accepts.
 */
function MediaPreview({
	name,
	base64,
	media,
}: {
	name: string | undefined;
	base64: string | undefined;
	media: MediaFileType;
}) {
	if (!base64) {
		return null;
	}

	const src = `data:${media.mime};base64,${base64}`;
	return (
		<div className="mt-9 absolute top-0 right-0 bottom-0 left-0">
			{media.kind === 'video'
				? <video className="w-full h-full object-contain p-20" src={src} controls />
				: <img className="w-full h-full object-contain p-20" alt={name} src={src} />}
		</div>
	);
}

function MermaidDiagram({ chart }: { chart: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [svg, setSvg] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
		let cancelled = false;

		import('mermaid').then(({ default: mermaid }) => {
			if (cancelled) { return; }
			mermaid.initialize({ startOnLoad: false, theme: 'default' });
			mermaid
				.render(id, chart)
				.then(({ svg }) => {
					if (!cancelled) {
						setSvg(svg);
						setError(null);
					}
				})
				.catch((err) => {
					if (!cancelled) {
						console.error('Mermaid render error:', err);
						setError(String(err));
					}
				});
		});

		return () => {
			cancelled = true;
		};
	}, [chart]);

	if (error) {
		return (
			<pre className="text-red-500 bg-red-50 p-3 rounded text-sm overflow-auto">
				<code>{chart}</code>
			</pre>
		);
	}

	return (
		<div
			ref={containerRef}
			className="my-4 flex justify-center overflow-auto"
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}

function MarkdownCode({
	inline,
	className,
	children,
}: {
	inline?: boolean;
	className?: string;
	children?: unknown;
}) {
	const code = String(children ?? '').replace(/\n$/, '');
	const [copy] = useCopyToClipboard(code);
	const language = className?.replace('language-', '');

	if (inline || !code.includes('\n')) {
		return <code className={className}>{children as any}</code>;
	}

	if (language === 'mermaid') {
		return <MermaidDiagram chart={code} />;
	}

	return (
		<code className="relative">
			<Button
				className="absolute top-2 right-2"
				type="button"
				variant="default"
				size="sm"
				onClick={copy}
			>
				<CopyIcon className="w-4 h-4" />
			</Button>
			{code}
		</code>
	);
}
