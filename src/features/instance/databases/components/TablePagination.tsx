'use client';

import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { cn } from '@/lib/cn';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react';
import { ComponentProps, Dispatch, FormEvent, SetStateAction, useState } from 'react';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 250];

interface TablePaginationProps {
	pageIndex: number;
	pageSize: number;
	totalPages?: number;
	totalRecords?: number;
	/** When true the count is an approximation and an exact count can be requested. */
	isEstimatedCount?: boolean;
	/** Server-provided confidence interval [low, high] for an estimated count. */
	estimatedRange?: [number, number];
	isExactCountFetching?: boolean;
	/** The on-demand exact-count fetch failed; surfaced so the user can retry. */
	isExactCountError?: boolean;
	onRequestExactCount?: () => void;
	setPageIndex: Dispatch<SetStateAction<number>>;
	setPageSize: Dispatch<SetStateAction<number>>;
}

export function TablePagination(
	{
		pageIndex,
		pageSize,
		totalPages,
		totalRecords,
		isEstimatedCount,
		estimatedRange,
		isExactCountFetching,
		isExactCountError,
		onRequestExactCount,
		setPageIndex,
		setPageSize,
	}: TablePaginationProps,
) {
	const isLoading = totalPages === undefined || totalRecords === undefined;
	const pageCount = totalPages && totalPages > 0 ? totalPages : 1;
	const currentPage = pageIndex + 1;

	const canPrevious = pageIndex > 0;
	const canNext = !isLoading && currentPage < pageCount;

	const goToPage = (page: number) => {
		setPageIndex(Math.max(0, Math.min(page, pageCount) - 1));
	};

	const changePageSize = (size: number) => {
		setPageSize(size);
		setPageIndex(0);
	};

	const items = getPaginationItems(currentPage, pageCount);

	return (
		<div className="@container border-t border-border">
			<div className="flex items-center gap-3 px-1 py-4">
				{/* Summary — record count is the essential, kept at every width */}
				<div className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
					<span className="hidden @min-[400px]:inline">
						Page {addCommasToNumbers(currentPage)} of {isLoading ? '…' : addCommasToNumbers(pageCount)}
					</span>
					<span aria-hidden className="hidden text-border @min-[400px]:inline">
						•
					</span>
					<span>
						{isLoading
							? <TextLoadingSkeleton />
							: isEstimatedCount
							? (
								<EstimatedRecordCount
									totalRecords={totalRecords}
									estimatedRange={estimatedRange}
									isExactCountFetching={isExactCountFetching}
									isExactCountError={isExactCountError}
									onRequestExactCount={onRequestExactCount}
								/>
							)
							: <>{addCommasToNumbers(totalRecords)} {totalRecords === 1 ? 'record' : 'records'}</>}
					</span>
				</div>

				<div className="grow" />

				{/* Navigation — back/forward is the essential, kept at every width */}
				<nav className="flex items-center divide-x divide-border overflow-hidden rounded-lg border border-border">
					<PaginationButton
						onClick={() => goToPage(currentPage - 1)}
						disabled={!canPrevious}
						aria-label="Previous page"
					>
						<ChevronLeftIcon />
						<span className="hidden @min-[480px]:inline">Previous</span>
					</PaginationButton>

					{/* Numbered pages — first to drop as width shrinks */}
					<div className="hidden divide-x divide-border @min-[620px]:flex">
						{items.map((item, index) =>
							item === 'ellipsis'
								? (
									<span
										key={`ellipsis-${index}`}
										className="flex h-9 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground"
									>
										…
									</span>
								)
								: (
									<PaginationButton
										key={item}
										onClick={() => goToPage(item)}
										isActive={item === currentPage}
										aria-label={`Page ${item}`}
										aria-current={item === currentPage ? 'page' : undefined}
									>
										{addCommasToNumbers(item)}
									</PaginationButton>
								)
						)}
					</div>

					<PaginationButton onClick={() => goToPage(currentPage + 1)} disabled={!canNext} aria-label="Next page">
						<span className="hidden @min-[480px]:inline">Next</span>
						<ChevronRightIcon />
					</PaginationButton>
				</nav>

				{/* Keep the nav centered only while the "Go to" field is shown; otherwise pin it right */}
				<div className="hidden grow @min-[840px]:block" />

				{/* Rows per page — extra control, only shown when there is ample room */}
				<PageSizeSelect pageSize={pageSize} onChange={changePageSize} />

				{/* Go to page — last to appear, first to be dropped */}
				<GoToPage pageCount={pageCount} disabled={isLoading || pageCount <= 1} onGo={goToPage} />
			</div>
		</div>
	);
}

/**
 * Renders an estimated record count as a hoverable "~N records". The tooltip explains the estimate
 * (with the server's confidence interval, when available) and offers a button to compute the exact
 * count on demand -- that triggers the unbounded count scan only when the user actually wants it.
 */
function EstimatedRecordCount(
	{ totalRecords, estimatedRange, isExactCountFetching, isExactCountError, onRequestExactCount }: {
		totalRecords: number;
		estimatedRange?: [number, number];
		isExactCountFetching?: boolean;
		isExactCountError?: boolean;
		onRequestExactCount?: () => void;
	},
) {
	const noun = totalRecords === 1 ? 'record' : 'records';
	const showError = isExactCountError && !isExactCountFetching;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="cursor-help underline decoration-dotted underline-offset-4"
					aria-label={`Approximately ${addCommasToNumbers(totalRecords)} ${noun} (estimated)`}
				>
					~{addCommasToNumbers(totalRecords)} {noun}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" align="start" className="flex max-w-60 flex-col gap-2 p-3 text-left">
				<span>
					Estimated count.{estimatedRange
						? (
							<>
								{' '}Likely between {addCommasToNumbers(estimatedRange[0])} and {addCommasToNumbers(estimatedRange[1])}.
							</>
						)
						: null}
				</span>
				{showError && <span className="font-medium">Couldn’t get the exact count.</span>}
				<button
					type="button"
					onClick={onRequestExactCount}
					disabled={isExactCountFetching}
					className="inline-flex items-center justify-center gap-1.5 self-start rounded border
						border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 font-medium transition-colors
						hover:bg-primary-foreground/20 disabled:pointer-events-none disabled:opacity-60"
				>
					{isExactCountFetching && <Loader2Icon className="size-3 animate-spin" />}
					{isExactCountFetching ? 'Counting…' : showError ? 'Try again' : 'Get exact count'}
				</button>
			</TooltipContent>
		</Tooltip>
	);
}

function PaginationButton({
	isActive,
	className,
	...props
}: ComponentProps<'button'> & { isActive?: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				`flex h-9 min-w-9 items-center justify-center gap-1 px-3 text-sm whitespace-nowrap
				transition-colors hover:bg-accent hover:text-foreground
				disabled:pointer-events-none disabled:opacity-40
				[&_svg]:size-4 [&_svg]:shrink-0`,
				isActive && 'bg-muted font-semibold text-foreground',
				className,
			)}
			{...props}
		/>
	);
}

function GoToPage({ pageCount, disabled, onGo }: {
	pageCount: number;
	disabled?: boolean;
	onGo: (page: number) => void;
}) {
	const [value, setValue] = useState('');

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const page = Number(value);
		if (Number.isFinite(page) && page >= 1) {
			onGo(Math.min(page, pageCount));
		}
		setValue('');
	};

	return (
		<form onSubmit={submit} className="hidden items-center gap-2 @min-[840px]:flex">
			<label htmlFor="pagination-go-to" className="text-sm whitespace-nowrap text-muted-foreground">
				Go to
			</label>
			<input
				id="pagination-go-to"
				type="number"
				min={1}
				max={pageCount}
				inputMode="numeric"
				placeholder="Page"
				disabled={disabled}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				className="h-9 w-20 rounded-md border border-input bg-white px-3 text-sm text-foreground
					placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-purple focus-visible:outline-none
					disabled:pointer-events-none disabled:opacity-50 dark:bg-grey-700 dark:text-white"
			/>
		</form>
	);
}

function PageSizeSelect({ pageSize, onChange }: { pageSize: number; onChange: (size: number) => void }) {
	return (
		<div className="hidden items-center gap-2 @min-[960px]:flex">
			<span className="text-sm whitespace-nowrap text-muted-foreground">Rows</span>
			<Select value={String(pageSize)} onValueChange={(value) => onChange(Number(value))}>
				<SelectTrigger aria-label="Rows per page" className="h-9 w-20">
					<SelectValue />
				</SelectTrigger>
				<SelectContent side="top">
					{PAGE_SIZE_OPTIONS.map((size) => (
						<SelectItem key={size} value={String(size)}>
							{addCommasToNumbers(size)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * Builds the list of page numbers to render, inserting `'ellipsis'` markers where pages are
 * collapsed. Always shows the first and last page plus a window around the current page.
 */
function getPaginationItems(current: number, total: number, sibling = 1): (number | 'ellipsis')[] {
	const totalSlots = sibling * 2 + 5;
	if (total <= totalSlots) {
		return range(1, total);
	}

	const leftSibling = Math.max(current - sibling, 1);
	const rightSibling = Math.min(current + sibling, total);
	const showLeftEllipsis = leftSibling > 2;
	const showRightEllipsis = rightSibling < total - 1;
	const edgeCount = 3 + 2 * sibling;

	if (!showLeftEllipsis && showRightEllipsis) {
		return [...range(1, edgeCount), 'ellipsis', total];
	}
	if (showLeftEllipsis && !showRightEllipsis) {
		return [1, 'ellipsis', ...range(total - edgeCount + 1, total)];
	}
	return [1, 'ellipsis', ...range(leftSibling, rightSibling), 'ellipsis', total];
}

function range(start: number, end: number): number[] {
	return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
