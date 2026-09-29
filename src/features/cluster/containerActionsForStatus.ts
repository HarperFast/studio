export interface ContainerActionAvailability {
	start: boolean;
	restart: boolean;
	stop: boolean;
}

const NONE: ContainerActionAvailability = { start: false, restart: false, stop: false };
const RUNNING: ContainerActionAvailability = { start: false, restart: true, stop: true };
const STOPPED: ContainerActionAvailability = { start: true, restart: false, stop: false };
const ALL: ContainerActionAvailability = { start: true, restart: true, stop: true };

/**
 * Mirrors Central Manager's admission rule: container ops are accepted from RUNNING, STOPPED, ERROR
 * and FAILED. An ERROR or FAILED instance may be up or down, so every action is offered there and
 * host-manager settles it: a restart of a stopped container becomes a start, a stop of a stopped
 * container is a no-op, a start of a running container is a no-op that reports RUNNING, and a
 * safe-mode start of a running container recreates it with safe mode on.
 */
export function containerActionsForStatus(status: string | undefined): ContainerActionAvailability {
	switch (status) {
		case 'RUNNING':
			return RUNNING;
		case 'STOPPED':
			return STOPPED;
		case 'ERROR':
		case 'FAILED':
			return ALL;
		default:
			return NONE;
	}
}
