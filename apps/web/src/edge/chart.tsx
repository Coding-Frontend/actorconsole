// A readable server fallback; interactive charts are loaded by the static client.
export function InteractiveBarChart({
  points,
  label,
}: {
  points: Array<{ date: string; value: number | null; observed?: boolean }>;
  label: string;
}) {
  return (
    <div className="border-border bg-muted/10 max-h-64 overflow-auto border p-4">
      <table className="w-full text-left text-sm">
        <caption>{label} by UTC day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points
            .filter((point) => point.observed !== false && point.value != null)
            .map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{point.value}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
