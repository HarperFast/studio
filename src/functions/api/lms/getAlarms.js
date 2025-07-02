import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';
import generateInstanceAlarmDetails from '../../instances/generateInstanceAlarmDetails';

export default async ({ auth, customer_id, signal, currentAlarmsLength }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'getAlarms',
			method: 'POST',
			payload: { customer_id },
			signal,
			auth,
		});

		if (response.error && currentAlarmsLength) {
			return appState.update((s) => {
				s.alarmsError = true;
			});
		}

		if (!Array.isArray(response) || response.error) {
			return appState.update((s) => {
				s.alarms = [];
				s.alarmsError = true;
			});
		}

		const alarmsArray = [...response].sort((a, b) => b.date - a.date);

		const alarms = Object.assign(
			{},
			...alarmsArray.map((i) => {
				const instanceAlarms = response?.filter((a) => a.compute_stack_id === i.compute_stack_id);
				return {
					[i.compute_stack_id]: {
						alarms: instanceAlarms,
						alarmCounts: generateInstanceAlarmDetails({
							alarms: instanceAlarms.filter((a) => a.date + config.alarm_badge_threshold * 1000 > Date.now()),
						}),
					},
				};
			})
		);

		return appState.update((s) => {
			s.alarms = alarms;
			s.alarmsError = false;
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getAlarms',
			request: { customer_id },
			error: { catch: e.toString() },
			customer_id,
		});
	}
};
