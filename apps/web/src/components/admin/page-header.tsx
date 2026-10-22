import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string | React.ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="border-border/80 flex flex-col items-start justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0 max-w-3xl">
        <p className="type-kicker text-signal-orange mb-2">Control room / live dataset</p>
        <h1 className="font-display-tight text-[28px] leading-none sm:text-[32px]">{title}</h1>
        {description ? (
          <div className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
