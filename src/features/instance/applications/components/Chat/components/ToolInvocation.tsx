import { Button } from '@/components/ui/button';
import type { ToolNames } from '@harperfast/agent-tools/types/toolNames';
import { type DynamicToolUIPart, getToolName, type ToolUIPart } from 'ai';
import { Check, ChevronDown, ChevronUp, Info, Loader2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getTool } from '../tools/clientTools';

interface ToolInvocationProps {
	part: ToolUIPart | DynamicToolUIPart;
	onApprove?: (toolCallId: string) => void;
	onDeny?: (toolCallId: string) => void;
	onAlwaysApprove?: (toolCallId: string) => void;
	isApproving?: boolean;
}

export function ToolInvocation({ part, onApprove, onDeny, onAlwaysApprove, isApproving }: ToolInvocationProps) {
	const [isInputExpanded, setIsInputExpanded] = useState(false);
	const [isOutputExpanded, setIsOutputExpanded] = useState(false);
	const toolName = getToolName(part) as ToolNames;
	const tool = getTool(toolName);
	const Icon = tool?.icon || Info;
	const requiresApproval = tool?.requiresApproval;
	const isInputEmpty = useMemo(() => {
		if (!part.input) { return true; }
		if (typeof part.input !== 'object') { return false; }
		return Object.keys(part.input).length === 0;
	}, [part.input]);
	const input = useMemo(() => {
		const json = JSON.stringify(part.input, null, '\t');
		return { json, lines: json ? json.split('\n').length : 0 };
	}, [part.input]);
	const output = useMemo(() => {
		const json = JSON.stringify(part.output, null, '\t');
		return { json, lines: json ? json.split('\n').length : 0 };
	}, [part.output]);

	return (
		<div className={`tool-invocation ${part.state}`}>
			<div className="tool-info">
				<div className="tool-name">
					<Icon size={14} />
					<span>{toolName}</span>
				</div>
				<div className="tool-status">
					{part.state === 'input-streaming' && <span>Thinking...</span>}
					{part.state === 'input-available'
						&& (
							<span>{isApproving ? 'Executing...' : (requiresApproval ? 'Awaiting Approval...' : 'Executing...')}</span>
						)}
					{part.state === 'output-available'
						&& ((part.output as any)?.error ? <XCircle size={14} className="text-destructive" /> : <Check size={14} />)}
				</div>
			</div>

			{part.state !== 'input-streaming' && (
				<div className="tool-io">
					{!isInputEmpty && (
						<div className="tool-args">
							<div className="flex items-center justify-between gap-2 mb-1">
								<strong>Input:</strong>
								{input.lines > 3 && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-6 px-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
										onClick={() => setIsInputExpanded(!isInputExpanded)}
									>
										{isInputExpanded
											? (
												<>
													<ChevronUp size={12} />
													Hide
												</>
											)
											: (
												<>
													<ChevronDown size={12} />
													Show
												</>
											)}
									</Button>
								)}
							</div>
							<div
								className={isInputExpanded ? 'whitespace-pre-wrap' : 'line-clamp-3 overflow-hidden whitespace-pre-wrap'}
							>
								{input.json}
							</div>
						</div>
					)}

					{part.state === 'input-available' && requiresApproval && (
						<div className="flex gap-2 mt-3 pt-3 border-t">
							<Button
								size="sm"
								className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
								onClick={() => onApprove?.(part.toolCallId)}
								disabled={isApproving}
							>
								{isApproving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
								Approve
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-8 text-xs"
								onClick={() => onAlwaysApprove?.(part.toolCallId)}
								disabled={isApproving}
							>
								Always Approve
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-8 text-xs"
								onClick={() => onDeny?.(part.toolCallId)}
								disabled={isApproving}
							>
								Deny
							</Button>
						</div>
					)}

					{part.state === 'output-available' && (
						<>
							{tool?.render
								? (
									tool.render(part as any)
								)
								: (
									<div className="tool-result">
										<div className="flex items-center justify-between gap-2 mb-1">
											<strong>Result:</strong>
											{output.lines > 3 && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-6 px-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
													onClick={() => setIsOutputExpanded(!isOutputExpanded)}
												>
													{isOutputExpanded
														? (
															<>
																<ChevronUp size={12} />
																Hide
															</>
														)
														: (
															<>
																<ChevronDown size={12} />
																Show
															</>
														)}
												</Button>
											)}
										</div>
										<div
											className={isOutputExpanded
												? 'whitespace-pre-wrap'
												: 'line-clamp-3 overflow-hidden whitespace-pre-wrap'}
										>
											{output.json}
										</div>
									</div>
								)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
