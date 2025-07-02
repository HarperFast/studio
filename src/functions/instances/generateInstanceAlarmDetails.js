const generateInstanceAlarmDetails = ({ alarms }) =>
	Object.values(alarms).reduce(
		(obj, v) => {
			obj[v.type.trim()] = (obj[v.type.trim()] || 0) + 1;
			obj.total += 1;
			return obj;
		},
		{ total: 0 }
	);

export default generateInstanceAlarmDetails;
