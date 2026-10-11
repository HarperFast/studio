import { templates } from '@/features/instance/applications/components/NewApplication/templates';
import { addComponent } from '@/integrations/api/instance/applications/addComponent';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { findBy } from '@/lib/arrays/findBy';
import { emitToListeners } from '@/lib/events/listener';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { inputSchema } from '@harperfast/agent-tools/tools/createApp/inputSchema';
import { toast } from 'sonner';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { describeToolError, toastToolFailure } from '../describeToolError';
import { Output } from './output';

export async function execute(
	{ input: { name: rawName, type }, instanceClientParams, baseURL }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	const name = toKebabCase(rawName);
	const template = findBy(templates, 'id', type);
	if (!template) {
		return {
			success: false,
			message: `Error: Invalid template type, ${type}, please choose from: ${templates.map(t => t.id).join(', ')}`,
		};
	}

	// TODO: Make sure it doesn't exist already.
	// TODO: HITL approval right here? During the tool? IDK.

	const toastId = toast.loading(`Creating from template...`, {
		description: 'This may take a bit.',
		duration: 300_000,
	});

	try {
		await addComponent({
			...instanceClientParams,
			project: name,
			template: template.npm || template.githubUrl,
		});
	} catch (err) {
		toastToolFailure(toastId, err);
		return {
			success: false,
			message: `Error: ${describeToolError(err)}`,
		};
	}

	emitToListeners('ReloadApplicationRootEntries', true);

	toast.loading(`Created successfully!`, {
		description: `${name} created! Restarting the HTTP service...`,
		id: toastId,
		duration: 300_000,
	});

	try {
		await restartInstance({
			...instanceClientParams,
			operation: 'restart_service',
			replicated: instanceClientParams.entityType === 'cluster',
		});
	} catch (err) {
		toastToolFailure(toastId, err);
		if (err instanceof RestartUnconfirmedError) {
			// The app exists either way; `success: false` would invite creating it again.
			return {
				success: true,
				message: `App "${name}" created. Harper accepted the restart that loads it, but Studio couldn't confirm `
					+ "the instance came back, so it may still be starting. Don't create the app or restart again until "
					+ 'its status shows it is back.',
				webURL: baseURL,
			};
		}
		return {
			success: false,
			message: `Error: ${describeToolError(err)}`,
		};
	}

	toast.success(`Created successfully!`, {
		description: `${name} created!`,
		id: toastId,
		duration: 5_000,
	});

	return {
		success: true,
		message: `App "${name}" created successfully.`,
		webURL: baseURL,
	};
}
