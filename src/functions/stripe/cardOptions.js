export default ({ theme }) => ({
	style: {
		base: {
			'iconColor': '#403b8a',
			'color': theme === 'dark' ? '#ffffff' : '#212121',
			'fontWeight': 100,
			'fontFamily': '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans", Arial, Helvetica, Verdana, Sans-Serif',
			'fontSize': '14px',
			'fontSmoothing': 'antialiased',
			'::placeholder': {
				color: '#bcbcbc',
			},
		},
		invalid: {
			iconColor: '#ea4c89',
			color: '#ea4c89',
		},
	},
});
