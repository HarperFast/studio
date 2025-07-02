export default ({ title, type, labels, theme }) => {
	const textColor = theme === 'light' ? '#696969' : theme === 'dark' ? '#fff' : '#212121';
	return {
		title: {
			text: title,
			style: {
				color: textColor,
			},
		},
		chart: {
			type,
			animations: { enabled: false },
			fontFamily: 'Arial, Helvetica, Verdana, Sans-Serif',
			toolbar: {
				offsetX: -25,
				tools: { selection: false, pan: false, zoom: false, zoomin: false, zoomout: false, reset: false },
			},
		},
		labels,
		theme: { palette: 'palette10' },
		plotOptions: { pie: { offsetY: 10 } },
		legend: {
			offsetY: 5,
			labels: {
				colors: textColor,
			},
		},
		markers: {
			size: [4],
			strokeColors: theme === 'dark' ? '#212121' : '#fff',
			strokeWidth: 1,
			strokeOpacity: theme === 'dark' ? 0.5 : 1,
			hover: {
				sizeOffset: 0,
			},
		},
		xaxis: {
			labels: {
				rotate: -60,
				maxHeight: 80,
				style: {
					fontSize: '10px',
					colors: textColor,
				},
			},
			tooltip: {
				enabled: false,
			},
		},
		yaxis: {
			labels: {
				style: {
					fontSize: '10px',
					colors: textColor,
				},
			},
		},
	};
};
