"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionItemProps {
  question: string;
  answer: string;
}

export function AccordionItem({ question, answer }: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerId = `accordion-trigger-${useId()}`;
  const panelId = `accordion-panel-${useId()}`;

  return (
    <div className="border-border/75 border-b py-2 last:border-b-0">
      <button
        id={triggerId}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="text-foreground hover:text-signal-orange focus-visible:ring-ring focus-visible:ring-offset-card flex w-full items-center justify-between gap-4 rounded-sm px-2 py-3 text-left font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <span className="text-sm sm:text-base">{question}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "text-signal-orange rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] pb-3 opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="text-muted-foreground overflow-hidden px-2 text-sm leading-relaxed">
          {answer}
        </div>
      </div>
    </div>
  );
}

export function Accordion({ items }: { items: AccordionItemProps[] }) {
  return (
    <div className="border-border/80 bg-card text-card-foreground shadow-card rounded-md border px-3 py-2 sm:px-5">
      {items.map((item, idx) => (
        <AccordionItem key={idx} question={item.question} answer={item.answer} />
      ))}
    </div>
  );
}
