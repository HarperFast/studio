import { useSessionStorage } from '@/hooks/useSessionStorage';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat } from './index';

const BUBBLE_SIZE = 56;
const PADDING = 24;

export function FloatingChat() {
	const [isMobile, setIsMobile] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [isOpen, setIsOpen] = useSessionStorage('ApplicationChatOpen', false);
	const [position, setPosition] = useSessionStorage('ApplicationChatPosition', { x: 0, y: 0 });
	const [width, setWidth] = useSessionStorage('ApplicationChatWidth', 400);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const checkMobile = () => {
			const mobile = window.innerWidth < 768;
			setIsMobile(mobile);
			if (!mobile && width > window.innerWidth) {
				setWidth(window.innerWidth);
			}
		};
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, [width, setWidth]);

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) { return; }

		const handleMouseMove = (e: MouseEvent) => {
			const newWidth = window.innerWidth - e.clientX;
			const clampedWidth = Math.min(Math.max(newWidth, 300), window.innerWidth);
			setWidth(clampedWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isResizing, setWidth]);

	const toggleChat = useCallback(() => {
		if (isDragging) { return; }
		setIsOpen(prev => !prev);
	}, [isDragging]);

	const closeChat = useCallback(() => {
		setIsOpen(false);
	}, []);

	useEffect(() => {
		if (isOpen) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeChat();
				}
			};
			window.addEventListener('keydown', handleEscape);
			return () => window.removeEventListener('keydown', handleEscape);
		}
	}, [isOpen, closeChat]);

	const handleDragStart = () => {
		setIsDragging(false);
	};

	const handleDrag = (_event: any, info: any) => {
		// If the user has moved the pointer more than 5px, consider it a drag
		if (Math.abs(info.offset.x) > 5 || Math.abs(info.offset.y) > 5) {
			setIsDragging(true);
		}
	};

	const handleDragEnd = (_event: any, info: any) => {
		// Small delay to ensure the click handler (which fires after dragEnd)
		// can still see the isDragging = true state.
		setTimeout(() => {
			setIsDragging(false);
		}, 100);

		if (isMobile) { return; }

		const { innerWidth, innerHeight } = window;

		// Calculate new offsets based on where we started and how far we dragged.
		// x and y in position are offsets from the initial bottom-right (PADDING, PADDING)
		const newX = position.x + info.offset.x;
		const newY = position.y + info.offset.y;

		// We still want snapping if it's close to the screen edge.
		// info.point is absolute screen coordinates of the pointer.
		const distLeft = info.point.x;
		const distRight = innerWidth - info.point.x;
		const distTop = info.point.y;
		const distBottom = innerHeight - info.point.y;

		let snapX = newX;
		let snapY = newY;

		const threshold = 100;
		if (distLeft < threshold) {
			// Snap to left: x offset should be -(innerWidth - BUBBLE_SIZE - PADDING * 2)
			snapX = -(innerWidth - BUBBLE_SIZE - PADDING * 2);
		} else if (distRight < threshold) {
			// Snap to right: x offset should be 0
			snapX = 0;
		}

		if (distTop < threshold) {
			// Snap to top: y offset should be -(innerHeight - BUBBLE_SIZE - PADDING * 2)
			snapY = -(innerHeight - BUBBLE_SIZE - PADDING * 2);
		} else if (distBottom < threshold) {
			// Snap to bottom: y offset should be 0
			snapY = 0;
		}

		setPosition({
			x: snapX,
			y: snapY,
		});
	};

	return (
		<div className="fixed inset-0 pointer-events-none z-50" ref={containerRef}>
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
						animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
						exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
						transition={{ type: 'spring', damping: 25, stiffness: 200 }}
						style={!isMobile
							? {
								top: 0,
								bottom: 0,
								right: 0,
								width,
								maxWidth: '100vw',
							}
							: {}}
						className={`
							pointer-events-auto
							fixed bg-[#1a1a1a] shadow-2xl border-l border-[#333] overflow-visible
							${isMobile ? 'inset-0 w-full h-full rounded-none' : 'h-full'}
						`}
					>
						{!isMobile && (
							<div
								onMouseDown={handleResizeStart}
								className={`
									absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize
									hover:bg-[#646cff] transition-colors z-50
									${isResizing ? 'bg-[#646cff]' : ''}
								`}
							/>
						)}
						<Chat autoFocus closeChat={closeChat} />
					</motion.div>
				)}
			</AnimatePresence>

			{!isOpen && (
				<motion.button
					drag
					dragMomentum={false}
					dragConstraints={containerRef}
					onDragStart={handleDragStart}
					onDrag={handleDrag}
					onDragEnd={handleDragEnd}
					initial={{ x: position.x, y: position.y }}
					whileHover={{ scale: 1.1 }}
					whileTap={{ scale: 0.9 }}
					onClick={toggleChat}
					style={{
						bottom: PADDING,
						right: PADDING,
					}}
					className="
						pointer-events-auto
						fixed w-14 h-14 rounded-full bg-[#646cff]
						text-white shadow-lg flex items-center justify-center cursor-pointer
						hover:bg-[#535bf2] transition-colors
					"
				>
					<Bot size={28} />
				</motion.button>
			)}
		</div>
	);
}
