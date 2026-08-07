import * as React from "react";

import { Input } from "./input";
import { cn } from "../../lib/utils";

type PhoneInputProps = Omit<
	React.ComponentProps<"input">,
	"onChange" | "type"
> & {
	defaultCountry?: string;
	onChange?: (value: string) => void;
};

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
	({ className, onChange, defaultCountry: _defaultCountry = "US", ...props }, ref) => {
		return (
			<Input
				ref={ref}
				type="tel"
				inputMode="tel"
				autoComplete="tel"
				className={cn("flex", className)}
				onChange={(event) => onChange?.(event.currentTarget.value)}
				{...props}
			/>
		);
	}
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
