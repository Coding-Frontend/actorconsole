"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** ARIA props Field writes onto its control. */
interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
}

export interface FieldProps {
  /** Visible label. Required: placeholders are not labels. */
  label: React.ReactNode;
  /**
   * A single form control (`Input`, `Textarea`, a native `select`, …). Field
   * gives it an id and wires `aria-describedby`, `aria-invalid` and
   * `aria-required`. An `id` already on the control is kept.
   */
  children: React.ReactElement<FieldControlProps>;
  /** Guidance shown under the label, linked to the control. */
  hint?: React.ReactNode;
  /** Validation message. Any truthy value marks the control invalid. */
  error?: React.ReactNode;
  /** Marks the control required for assistive tech and shows an asterisk. */
  required?: boolean;
  /** Shows "(optional)" after the label. Use in forms where most fields are required. */
  optional?: boolean;
  /** Keep the label for screen readers only, e.g. a search box with a visible icon. */
  hideLabel?: boolean;
  /** Overrides the generated control id. */
  id?: string;
  className?: string;
}

function joinIds(...ids: Array<string | false | null | undefined>) {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

/**
 * Label + control + hint + error, with the accessibility wiring done once.
 *
 * Field does not announce errors itself: when a submit fails, move focus to
 * the first invalid control and its error is read through `aria-describedby`.
 * That avoids a burst of announcements when several fields fail together.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  optional = false,
  hideLabel = false,
  id,
  className,
}: FieldProps) {
  const generatedId = React.useId();

  if (!React.isValidElement<FieldControlProps>(children)) {
    throw new Error("Field expects a single form control element as its child.");
  }

  const controlId = id ?? children.props.id ?? `field-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const invalid = Boolean(error);

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": joinIds(
      hint ? hintId : null,
      invalid ? errorId : null,
      children.props["aria-describedby"],
    ),
    "aria-invalid": invalid || children.props["aria-invalid"] || undefined,
    "aria-required": required || children.props["aria-required"] || undefined,
  });

  return (
    <div className={cn("grid min-w-0 gap-1.5", className)} data-invalid={invalid || undefined}>
      <Label htmlFor={controlId} className={cn("text-foreground", hideLabel && "sr-only")}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive ml-0.5">
            *
          </span>
        ) : null}
        {optional && !required ? (
          <span className="text-muted-foreground ml-1.5 font-normal">(optional)</span>
        ) : null}
      </Label>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs leading-5">
          {hint}
        </p>
      ) : null}

      {control}

      {invalid ? (
        <p id={errorId} className="text-destructive flex items-start gap-1.5 text-xs leading-5">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </p>
      ) : null}
    </div>
  );
}
