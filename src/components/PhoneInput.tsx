import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { cn } from "@/lib/utils";

export interface PhoneInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value?: string;
  onChange?: (value: string) => void;
  /** Full E.164 number e.g. +919876543210 */
}

/**
 * Parses a full phone number (E.164 or legacy) into country code and local number.
 * Handles: +919876543210, 919876543210, 9876543210 (assumes India +91)
 */
function parsePhone(value: string | undefined): { code: string; number: string } {
  if (!value || !value.trim()) return { code: "+91", number: "" };
  const cleaned = value.replace(/\s/g, "");
  if (cleaned.startsWith("+")) {
    // Try to match longest country code first
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      const dial = c.code.replace("+", "");
      if (cleaned.startsWith("+" + dial)) {
        return { code: c.code, number: cleaned.slice(1 + dial.length).replace(/\D/g, "") };
      }
    }
  }
  // Legacy: digits only - assume India
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 10) {
    if (digits.startsWith("91") && digits.length > 10) {
      return { code: "+91", number: digits.slice(2) };
    }
    return { code: "+91", number: digits.length > 10 ? digits : digits };
  }
  return { code: "+91", number: digits };
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, className, ...inputProps }, ref) => {
    const parsed = parsePhone(value);
    const [code, setCode] = React.useState(parsed.code);
    const [number, setNumber] = React.useState(parsed.number);

    React.useEffect(() => {
      const p = parsePhone(value);
      setCode(p.code);
      setNumber(p.number);
    }, [value]);

    const handleCodeChange = (newCode: string) => {
      setCode(newCode);
      const digits = number.replace(/\D/g, "");
      if (digits) {
        onChange?.(newCode + digits);
      } else {
        onChange?.("");
      }
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "");
      setNumber(raw);
      if (raw) {
        onChange?.(code + raw);
      } else {
        onChange?.("");
      }
    };

    return (
      <div className={cn("flex gap-2", className)}>
        <Select value={code} onValueChange={handleCodeChange}>
          <SelectTrigger className="w-[120px] shrink-0">
            <SelectValue placeholder="Code" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_CODES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} {c.country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="Phone number"
          value={number}
          onChange={handleNumberChange}
          {...inputProps}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";
