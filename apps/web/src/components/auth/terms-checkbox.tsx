"use client";

import Link from "next/link";

interface TermsCheckboxProps {
  termsAccepted: boolean;
  onChange: (v: boolean) => void;
}

export function TermsCheckbox({ termsAccepted, onChange }: TermsCheckboxProps) {
  return (
    <label className="text-muted-foreground flex cursor-pointer items-start gap-2 text-xs">
      <input
        type="checkbox"
        checked={termsAccepted}
        onChange={(e) => onChange(e.target.checked)}
        className="border-input mt-0.5 h-4 w-4 rounded"
      />
      <span>
        I agree to the{" "}
        <Link href="/legal/terms" target="_blank" className="underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" target="_blank" className="underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
