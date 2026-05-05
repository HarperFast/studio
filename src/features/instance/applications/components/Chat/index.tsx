import { useEntityRestURL } from '@/config/useEntityRestURL';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ClearChat } from '@/features/instance/applications/components/Chat/components/ClearChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { unique } from '@/lib/arrays/unique';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import {
	createIdGenerator,
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type ToolCallPart,
} from 'ai';
import { Bot, X } from 'lucide-react';
import { SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ChatInput } from './components/ChatInput';
import { LoadingState } from './components/LoadingState';
import { MessageBubble } from './components/MessageBubble';
import { UsageBar } from './components/UsageBar';
import { getTool } from './tools/clientTools';
import './Chat.css';

export function Chat({ autoFocus, closeChat }: { autoFocus: boolean; closeChat: () => void }) {
	const params = useParams({ strict: false });
	const { organizationId }: { organizationId: string } = params;
	const [input, setInput] = useSessionStorage('ApplicationChat', '');
	const [isLoadingInitial, setIsLoadingInitial] = useState(true);
	const [pendingToolCalls, setPendingToolCalls] = useState<Record<string, ToolCallPart>>({});
	const [approvingToolCallIds, setApprovingToolCallIds] = useState<Set<string>>(new Set());
	const [alwaysApprovedToolsList, setAlwaysApprovedToolsList] = useLocalStorage<string[]>(
		LocalStorageKeys.ChatAlwaysApprovedTools,
		[],
	);
	const alwaysApprovedTools = new Set(alwaysApprovedToolsList);
	const baseURL = useEntityRestURL();
	const instanceClientParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const { messages, sendMessage, status, addToolOutput, setMessages } = useChat({
		transport: new DefaultChatTransport({
			api: '/Chat/Messages/',
			body: { orgId: organizationId },
		}),
		generateId: createIdGenerator(),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		onFinish() {
			void queryClient.invalidateQueries({ queryKey: ['getMyUsage'] });
		},
		async onToolCall({ toolCall }) {
			// Check if it's a dynamic tool first for proper type narrowing
			if (toolCall.dynamic) {
				return;
			}

			const tool = getTool(toolCall.toolName);
			if (tool) {
				if (tool.requiresApproval && !alwaysApprovedTools.has(toolCall.toolName)) {
					const toolCallPart: ToolCallPart = {
						type: 'tool-call',
						toolCallId: toolCall.toolCallId,
						toolName: toolCall.toolName,
						input: toolCall.input,
					};
					setPendingToolCalls(prev => ({ ...prev, [toolCall.toolCallId]: toolCallPart }));
					return;
				}

				const output = await tool.execute({ input: toolCall.input, instanceClientParams, baseURL, params });
				addToolOutput({
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					output,
				});
			}
		},
	});

	const handleApprove = useCallback(
		async (toolCallId: string) => {
			const toolCall = pendingToolCalls[toolCallId];
			if (!toolCall) {
				return;
			}

			setApprovingToolCallIds(prev => {
				const next = new Set(prev);
				next.add(toolCallId);
				return next;
			});

			try {
				const tool = getTool(toolCall.toolName);
				if (tool) {
					const output = await tool.execute({ input: toolCall.input, instanceClientParams, baseURL, params });
					addToolOutput({
						tool: toolCall.toolName,
						toolCallId: toolCall.toolCallId,
						output,
					});
					setPendingToolCalls(prev => {
						const next = { ...prev };
						delete next[toolCallId];
						return next;
					});
				}
			} finally {
				setApprovingToolCallIds(prev => {
					const next = new Set(prev);
					next.delete(toolCallId);
					return next;
				});
			}
		},
		[pendingToolCalls, instanceClientParams, baseURL, addToolOutput, params],
	);

	const handleDeny = useCallback(
		(toolCallId: string) => {
			const toolCall = pendingToolCalls[toolCallId];
			if (!toolCall) {
				return;
			}

			addToolOutput({
				tool: toolCall.toolName,
				toolCallId: toolCall.toolCallId,
				output: { error: 'User denied the tool execution.' },
			});
			setPendingToolCalls(prev => {
				const next = { ...prev };
				delete next[toolCallId];
				return next;
			});
		},
		[pendingToolCalls, addToolOutput],
	);

	const handleAlwaysApprove = useCallback(
		async (toolCallId: string) => {
			const toolCall = pendingToolCalls[toolCallId];
			if (!toolCall) {
				return;
			}

			setAlwaysApprovedToolsList(prev => unique([...prev, toolCall.toolName]));
			await handleApprove(toolCallId);
		},
		[pendingToolCalls, setAlwaysApprovedToolsList, handleApprove],
	);

	useEffect(() => {
		const fetchInitialMessages = async () => {
			try {
				const response = await fetch('/Chat/Messages/');
				if (response.ok) {
					const data = await response.json();
					if (Array.isArray(data)) {
						setMessages(data);
					}
				}
			} catch (error) {
				console.error('Failed to fetch initial messages:', error);
			} finally {
				setIsLoadingInitial(false);
			}
		};

		void fetchInitialMessages();
	}, [setMessages]);

	const isStreaming = status === 'streaming' || status === 'submitted';

	const messagesEndRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	const handleChatSubmit = (e: SubmitEvent) => {
		e.preventDefault();
		if (input.trim() && !isStreaming && !isLoadingInitial) {
			void sendMessage({ text: input });
			setInput('');
		}
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between p-4 border-b border-[#333] bg-[#242424]">
				<div className="flex items-center gap-2">
					<Bot className="text-[#646cff]" size={20} />
					<span className="font-semibold text-white">Harper Agent</span>
				</div>
				<div className="flex items-center gap-1">
					<ClearChat setMessages={setMessages} />
					<button
						onClick={closeChat}
						className="p-1 hover:bg-[#333] rounded-md transition-colors text-gray-400 hover:text-white"
						title="Close chat"
					>
						<X size={20} />
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-hidden">
				<div className="chat-interface h-full w-full">
					<div className="messages-area">
						{isLoadingInitial && <LoadingState />}
						{!isLoadingInitial && messages.length === 0 && (
							<div className="empty-state">
								<Bot size={48} />
								<p>Ask me to create a Harper app!</p>
							</div>
						)}
						{messages.map(m => (
							<MessageBubble
								key={m.id}
								message={m}
								onApprove={handleApprove}
								onDeny={handleDeny}
								onAlwaysApprove={handleAlwaysApprove}
								approvingToolCallIds={approvingToolCallIds}
							/>
						))}
						<div ref={messagesEndRef} />
					</div>

					<ChatInput
						input={input}
						setInput={setInput}
						onSubmit={handleChatSubmit}
						disabled={isLoadingInitial}
						autoFocus={autoFocus}
					/>

					<div className="p-2 border-t border-gray-700 bg-gray-800">
						<UsageBar />
					</div>
				</div>
			</div>
		</div>
	);
}
