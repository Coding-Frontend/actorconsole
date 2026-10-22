"use client";

import dynamic from "next/dynamic";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { Braces, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 h-[30rem] animate-pulse" aria-label="Loading schema editor" />,
});

const actorConsoleEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    fontSize: "13px",
  },
  ".cm-content": { caretColor: "var(--color-signal-orange)", padding: "16px 0" },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted))",
    color: "hsl(var(--muted-foreground))",
    borderRight: "1px solid hsl(var(--border))",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-signal-blue) 9%, transparent)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-signal-blue) 28%, transparent) !important",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "hsl(var(--muted))",
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  },
});

export function SchemaCodeView({ schema, label }: { schema: unknown; label: string }) {
  if (!schema || typeof schema !== "object") return null;
  const value = JSON.stringify(schema, null, 2);

  return (
    <section className="border-border overflow-hidden border" aria-label={`${label} schema`}>
      <div className="border-border bg-muted/35 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Braces className="text-signal-orange h-4 w-4" />
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">
            {label} schema · JSON
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => toast.success("Schema copied"));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy JSON
        </Button>
      </div>
      <CodeMirror
        value={value}
        height="min(38rem, 65vh)"
        theme={actorConsoleEditorTheme}
        readOnly
        editable={false}
        extensions={[json(), EditorView.lineWrapping]}
        basicSetup={{
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: false,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          lineNumbers: true,
          searchKeymap: true,
        }}
        aria-label={`${label} schema JSON`}
      />
    </section>
  );
}
