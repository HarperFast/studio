import { FormControl } from '@/components/ui/form/FormControl';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { ComponentProps, useState } from 'react';

type AuthInputProps = Omit<ComponentProps<typeof Input>, 'type'> & {
	type?: 'text' | 'email' | 'password';
	passwordLabel?: string;
};

/** Keeps the form's label, error description, and ref attached to the input itself. */
export function AuthInput({ type = 'text', passwordLabel = 'password', ...props }: AuthInputProps) {
	const [visible, setVisible] = useState(false);
	const Icon = type === 'email' ? Mail : type === 'password' ? LockKeyhole : UserRound;
	return (
		<div className="auth-input">
			<FormControl>
				<Input {...props} type={type === 'password' && visible ? 'text' : type} />
			</FormControl>
			<Icon aria-hidden="true" className="auth-input-icon" />
			{type === 'password' && (
				<button
					type="button"
					className="auth-password-toggle"
					aria-label={`${visible ? 'Hide' : 'Show'} ${passwordLabel}`}
					disabled={props.disabled}
					onClick={() => setVisible(value => !value)}
				>
					{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
				</button>
			)}
		</div>
	);
}
