import { inputSchema } from '@harperfast/agent-tools/tools/readHarperSkill/inputSchema';
import { rules } from '@harperfast/skills';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { skill } }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	return {
		success: !!rules[skill],
		message: rules[skill] || `No skill found with the name ${skill}`,
	};
}
