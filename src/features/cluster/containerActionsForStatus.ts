export interface ContainerActionAvailability {
	start: boolean;
	restart: boolean;
	stop: boolean;
}

const NONE: ContainerActionAvailability = { start: false, restart: false, stop: false };

/**
 * Which container actions the instance menu offers for a status. Mirrors Central Manager's
 * admission rule (ops are accepted from RUNNING, STOPPED, ERROR and FAILED). An ERROR or FAILED
 * instance may be up or down, so every action is offered there: host-manager turns a restart of a
 * stopped container into a start, and a stop of a stopped container is a no-op.
 */
export function containerActionsForStatus(status: string | undefined): ContainerActionAvailability {
	switch (status) {
		case 'RUNNING':
			return { start: false, restart: true, stop: true };
		case 'STOPPED':
			return { start: true, restart: false, stop: false };
		case 'ERROR':
		case 'FAILED':
			return { start: true, restart: true, stop: true };
		default:
			return NONE;
	}
}
