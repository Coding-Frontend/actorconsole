# UI states and form fields

Four primitives cover the loading, feedback and form-field patterns that pages
used to hand-roll (a `Loader2` inside a button, a `<p role="alert">` box, a
label wired to an input by a hard-coded id). Reach for these before writing
that markup again.

| Component | File | Use it for |
| --- | --- | --- |
| `Spinner` | [spinner.tsx](spinner.tsx) | An indeterminate wait with no better placeholder |
| `Button` `loading` | [button.tsx](button.tsx) | An action that is in flight |
| `Alert` | [alert.tsx](alert.tsx) | Inline feedback: failure, success, warning, note |
| `Field` | [field.tsx](field.tsx) | A labelled control with hint and validation error |

They layer on the existing kit: `Skeleton*` for content-shaped loading,
`EmptyState` for empty lists, `DashboardAsyncState` for whole-view status in the
dashboard, `ConfirmDialog` / `PromptDialog` for confirm-and-run actions.

## Choosing a loading treatment

1. You know the shape of the content: use a `Skeleton*`.
2. A user started an action: use `<Button loading>`.
3. A whole dashboard view is loading or refreshing: use `DashboardAsyncState`.
4. Anything else short and indeterminate: use `Spinner` with a specific label.

## Spinner

```tsx
import { Spinner } from "@/components/ui/spinner";

<Spinner label="Loading invoices" />          // polite role="status", label for screen readers
<Spinner size="lg" label="Connecting to Apify" />
<Spinner decorative />                        // hidden from AT; nearby text says what is happening
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"` | 12, 14, 16, 24, 32 px |
| `label` | `string` | `"Loading"` | Make it specific when the spinner stands alone |
| `decorative` | `boolean` | `false` | Use inside a busy button or next to visible text |

Under `prefers-reduced-motion` the global stylesheet stops the rotation; the
static glyph and label still convey the state.

## Button `loading`

```tsx
<Button type="submit" loading={saving} loadingText="Saving…">
  <Save /> Save changes
</Button>
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `loading` | `boolean` | `false` | Busy state, see below |
| `loadingText` | `ReactNode` | children | Label while loading. Keep it about the same length to avoid a layout jump |

While `loading`:

- The button **keeps focus**. It is `aria-disabled` and `aria-busy` rather than
  natively `disabled`, so a keyboard user who pressed Enter is not dropped to
  the top of the page.
- Clicks are cancelled, which also cancels implicit form submission, so a
  double click or a second Enter cannot send the form twice.
- A spinner replaces a leading icon (a first child with no children of its
  own, like `<Save />`), so the width stays put. Text, wrapped labels and
  trailing icons (`Continue <ArrowRight />`) stay. With `loadingText`, the
  whole content is replaced.
- With `asChild` the busy attributes and click guard apply, but no spinner is
  injected: `Slot` needs exactly one child.

Keep `loading` and `disabled` separate. `disabled` means "you cannot do this
yet"; `loading` means "this is happening". When both could apply, gate
`disabled` on `!loading` so the busy state wins:

```tsx
<Button loading={saving} disabled={!saving && !dirty}>Save preferences</Button>
```

## Alert

```tsx
import { Alert } from "@/components/ui/alert";

{error ? <Alert tone="danger">{error}</Alert> : null}

<Alert
  tone="danger"
  title="Runs could not be loaded"
  action={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}
>
  The Apify API timed out. Your last snapshot is still shown below.
</Alert>

<Alert tone="warning" title="Quota at 92%" onDismiss={() => setShowQuota(false)}>
  Runs pause when the monthly limit is reached. <Link href="/pricing">See plans</Link>.
</Alert>

<Alert tone="info" live="off">Changes apply to every workspace you own.</Alert>
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `tone` | `"neutral" \| "info" \| "success" \| "warning" \| "danger"` | `"neutral"` | Colours the rule and icon only; text keeps body contrast |
| `title` | `ReactNode` | none | Add one when the body runs past a sentence |
| `children` | `ReactNode` | none | The message |
| `icon` | `ReactNode \| false` | tone icon | `false` removes it |
| `action` | `ReactNode` | none | Wraps under the message on narrow screens |
| `onDismiss` | `() => void` | none | Shows a labelled close button; the parent unmounts the alert |
| `dismissLabel` | `string` | `"Dismiss"` | Accessible name for the close button |
| `live` | `"assertive" \| "polite" \| "off"` | `assertive` for `danger`, else `polite` | `off` for notes present on first paint |

Live regions announce content **inserted** into them. Render alerts
conditionally rather than toggling `hidden`, and use `live="off"` for a
permanent note so screen readers do not announce it on every page load.

## Field

```tsx
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

<Field label="Email" required error={errors.email}>
  <Input type="email" autoComplete="email" value={email} onChange={…} />
</Field>

<Field label="Description" optional hint="Shown on your public Actor page. Markdown allowed.">
  <Textarea rows={4} />
</Field>

<Field label="Search actors" hideLabel>
  <Input type="search" placeholder="Search actors" />
</Field>
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `ReactNode` | required | Placeholders are not labels |
| `children` | one element | required | Any control that accepts `id` and ARIA props |
| `hint` | `ReactNode` | none | Shown above the control so it is read before typing |
| `error` | `ReactNode` | none | Any truthy value sets `aria-invalid` |
| `required` | `boolean` | `false` | Sets `aria-required` and a hidden-from-AT asterisk |
| `optional` | `boolean` | `false` | Adds "(optional)"; use where most fields are required |
| `hideLabel` | `boolean` | `false` | Visually hidden label, still announced |
| `id` | `string` | generated | Otherwise the control's own `id`, otherwise `useId()` |

Field merges rather than overwrites: an `id` or `aria-describedby` already on
the control is kept, with the hint and error ids placed first.

Field does not set native `required` (which triggers browser validation
bubbles) and does not announce errors itself. On a failed submit, focus the
first invalid control; its error is read through `aria-describedby`, and the
user hears one message rather than one per field.

```tsx
function onSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget; // React clears currentTarget after the handler
  const nextErrors = validate(values);
  setErrors(nextErrors);
  if (Object.keys(nextErrors).length > 0) {
    // Wait a frame so the new aria-invalid attributes are in the DOM.
    requestAnimationFrame(() =>
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
    return;
  }
  void save(values);
}
```

## Putting them together

```tsx
<form onSubmit={onSubmit} noValidate className="grid max-w-lg gap-5">
  <Field label="Workspace name" required error={errors.name}>
    <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
  </Field>
  {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
  <Button type="submit" loading={saving} loadingText="Creating workspace…" className="w-full sm:w-auto">
    Create workspace
  </Button>
  {created ? <Alert tone="success">Workspace created.</Alert> : null}
</form>
```

Live usages: [action-dialog.tsx](action-dialog.tsx) and the
[notification preferences page](../../app/(dashboard)/dashboard/settings/notifications/page.tsx).
