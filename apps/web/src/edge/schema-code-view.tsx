export function SchemaCodeView({ schema, label }: { schema: unknown; label: string }) {
  return schema ? (
    <pre aria-label={`${label} schema`}>{JSON.stringify(schema, null, 2)}</pre>
  ) : null;
}
