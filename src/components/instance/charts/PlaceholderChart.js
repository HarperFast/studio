import Chart from 'react-apexcharts';
import React from 'react';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';
import chartOptions from '../../../functions/charts/chartOptions';

const generateMonths = () => {
	const today = new Date();
	let aMonth = today.getMonth();
	const months = [];

	const month = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];
	for (let i = 0; i < 12; i += 1) {
		months.push(month[aMonth]);
		aMonth -= 1;
		if (aMonth < 0) {
			aMonth = 11;
		}
	}

	return months.reverse();
};

function PlaceholderChart() {
	const theme = useStoreState(appState, (s) => s.theme);
	return (
		<Chart
			options={chartOptions({
				title: 'Harper Satisfaction Over Time (Placeholder Example)',
				type: 'line',
				labels: generateMonths(),
				theme,
			})}
			series={[
				{
					name: 'Harper Core',
					data: [98, 98, 97, 99, 98, 97, 100, 100, 100, 100, 100, 100],
				},
				{
					name: 'Harper Studio',
					data: [95, 97, 99, 97, 98, 96, 98, 100, 99, 98, 100, 99],
				},
				{
					name: 'Harper Documentation',
					data: [90, 92, 94, 92, 94, 92, 95, 97, 99, 95, 97, 98],
				},
			]}
			type="line"
			height={220}
		/>
	);
}

export default PlaceholderChart;
