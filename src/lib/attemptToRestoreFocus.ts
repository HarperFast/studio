import { sleep } from '@/lib/sleep';

interface IFocusable {
	focus?: () => void;
}

interface ITargetFocusable {
	target?: IFocusable;
}

export function attemptToRestoreFocus(trigger?: unknown) {
	const focusableTrigger = trigger as IFocusable;
	if (focusableTrigger?.focus) {
		focusElement(focusableTrigger);
	} else {
		const triggerTargetFocusable = trigger as ITargetFocusable;
		if (triggerTargetFocusable?.target?.focus) {
			focusElement(triggerTargetFocusable.target);
		}
	}
}

function focusElement(element: IFocusable) {
	sleep(1).then(() => {
		element.focus?.();
	});
}
