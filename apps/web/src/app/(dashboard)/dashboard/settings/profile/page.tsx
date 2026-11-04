"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, User } from "lucide-react";
import { accountMutation } from "@/lib/account-api";
import { useAccountResource } from "@/lib/use-account-resource";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Profile {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  image: string | null;
  bio: string | null;
}
type Values = { name: string; username: string; image: string; bio: string };
const empty: Values = { name: "", username: "", image: "", bio: "" };
function validProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const item = value as Profile;
  return (
    typeof item.id === "string" &&
    typeof item.email === "string" &&
    ["name", "username", "image", "bio"].every(
      (key) =>
        item[key as keyof Profile] === null || typeof item[key as keyof Profile] === "string",
    )
  );
}
const valuesFor = (profile: Profile): Values => ({
  name: profile.name ?? "",
  username: profile.username ?? "",
  image: profile.image ?? "",
  bio: profile.bio ?? "",
});
const labels: Record<keyof Values, string> = {
  name: "Display name",
  username: "Username",
  image: "Profile photo URL",
  bio: "Bio",
};

export default function ProfilePage() {
  const router = useRouter();
  const resource = useAccountResource("/profile", validProfile);
  const [values, setValues] = useState<Values>(empty);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resource.data) {
      setValues(valuesFor(resource.data));
      setLoadedId(resource.data.id);
    }
  }, [resource.data]);
  useEffect(() => {
    if (Object.values(errors).some(Boolean) || saveError) summary.current?.focus();
  }, [errors, saveError]);
  const dirty =
    resource.data && JSON.stringify(values) !== JSON.stringify(valuesFor(resource.data));
  function change(key: keyof Values, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    setSaveError(null);
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      pending.current ||
      !resource.data ||
      loadedId !== resource.data.id ||
      resource.loading ||
      resource.error
    )
      return;
    const invalid: Partial<Record<keyof Values, string>> = {};
    if (!values.name.trim() || values.name.length > 100)
      invalid.name = "Enter a display name of 1–100 characters.";
    if (values.username && !/^[A-Za-z0-9_]{3,30}$/.test(values.username))
      invalid.username = "Use 3–30 letters, numbers, or underscores.";
    if (values.bio.length > 500) invalid.bio = "Keep your bio to 500 characters or fewer.";
    if (values.image.trim()) {
      try {
        new URL(values.image.trim());
      } catch {
        invalid.image = "Enter a complete public image URL.";
      }
    }
    setErrors(invalid);
    setSaveError(null);
    if (Object.keys(invalid).length) return;
    pending.current = true;
    setSaving(true);
    setSaved(false);
    try {
      const result = await accountMutation<Profile>(
        "/profile",
        {
          name: values.name.trim(),
          username: values.username || null,
          bio: values.bio || null,
          image: values.image.trim() || null,
        },
        "PATCH",
      );
      if (!validProfile(result))
        throw new Error(
          "The saved profile could not be verified. Reload before making another change.",
        );
      resource.setData(result);
      setSaved(true);
      router.refresh();
    } catch (failure) {
      setSaveError(
        failure instanceof Error ? failure.message : "Your changes could not be saved. Try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="max-w-4xl space-y-6">
      <DashboardPageHeader
        context="Account / Identity"
        title="Profile"
        description="Manage the name, photo, and details shown for your ActorConsole account."
        breadcrumbs={[{ label: "Account" }, { label: "Profile" }]}
      />
      {resource.loading ? (
        <DashboardAsyncState status="loading" title="Loading your saved profile" />
      ) : null}
      {resource.error ? (
        <DashboardAsyncState
          status="error"
          title="Your profile could not be loaded"
          description={resource.error}
          onRetry={() => void resource.retry()}
        />
      ) : null}
      {resource.data && loadedId === resource.data.id ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User aria-hidden="true" className="h-4 w-4" /> Personal info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} noValidate className="space-y-5">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar className="h-16 w-16 shrink-0">
                  {values.image ? (
                    <AvatarImage src={values.image} alt="Your profile photo preview" />
                  ) : null}
                  <AvatarFallback>
                    {resource.data.name?.charAt(0) ?? resource.data.email.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 break-words">
                  <p className="font-medium">{resource.data.name ?? "You"}</p>
                  {resource.data.username ? (
                    <p className="text-sm text-muted-foreground">@{resource.data.username}</p>
                  ) : null}
                  <p className="break-all text-sm text-muted-foreground">{resource.data.email}</p>
                </div>
              </div>
              {Object.values(errors).some(Boolean) || saveError ? (
                <div
                  ref={summary}
                  tabIndex={-1}
                  role="alert"
                  className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
                >
                  <p>{saveError ?? "Check the highlighted fields."}</p>
                  <ul>
                    {(Object.entries(errors) as Array<[keyof Values, string | undefined]>)
                      .filter(([, message]) => message)
                      .map(([key, message]) => (
                        <li key={key}>
                          <a className="underline" href={`#profile-${key}`}>
                            {labels[key]}: {message}
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <fieldset
                disabled={saving || resource.loading || Boolean(resource.error)}
                className="min-w-0 space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="profile-image">Profile photo URL</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="profile-image"
                      name="image"
                      type="url"
                      value={values.image}
                      onChange={(event) => change("image", event.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="h-11 min-w-0 flex-1 text-base"
                      aria-invalid={Boolean(errors.image)}
                      aria-describedby={`profile-image-help${errors.image ? " profile-image-error" : ""}`}
                    />
                    {values.image ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => change("image", "")}
                      >
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                  <p id="profile-image-help" className="text-xs text-muted-foreground">
                    Paste a public image URL to preview it. Save changes to update your profile.
                  </p>
                  {errors.image ? (
                    <p id="profile-image-error" className="text-sm text-destructive">
                      {errors.image}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-username">Username</Label>
                  <Input
                    id="profile-username"
                    name="username"
                    autoComplete="username"
                    value={values.username}
                    onChange={(event) => change("username", event.target.value)}
                    maxLength={30}
                    className="h-11 text-base"
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={`profile-username-help${errors.username ? " profile-username-error" : ""}`}
                  />
                  <p id="profile-username-help" className="text-xs text-muted-foreground">
                    3–30 letters, numbers, or underscores. Leave empty to remove it.
                  </p>
                  {errors.username ? (
                    <p id="profile-username-error" className="text-sm text-destructive">
                      {errors.username}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input
                    id="profile-name"
                    name="name"
                    autoComplete="name"
                    value={values.name}
                    onChange={(event) => change("name", event.target.value)}
                    required
                    maxLength={100}
                    className="h-11 text-base"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "profile-name-error" : undefined}
                  />
                  {errors.name ? (
                    <p id="profile-name-error" className="text-sm text-destructive">
                      {errors.name}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-bio">Bio</Label>
                  <Textarea
                    id="profile-bio"
                    name="bio"
                    value={values.bio}
                    onChange={(event) => change("bio", event.target.value)}
                    maxLength={500}
                    rows={4}
                    className="text-base"
                    aria-invalid={Boolean(errors.bio)}
                    aria-describedby={`profile-bio-help${errors.bio ? " profile-bio-error" : ""}`}
                  />
                  <p id="profile-bio-help" className="text-xs text-muted-foreground">
                    {values.bio.length}/500 characters
                  </p>
                  {errors.bio ? (
                    <p id="profile-bio-error" className="text-sm text-destructive">
                      {errors.bio}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={saving || !dirty || Boolean(resource.error)}
                  className="min-h-11 w-full sm:w-auto"
                >
                  {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  {saving ? "Saving changes…" : "Save changes"}
                </Button>
              </fieldset>
              {saved ? (
                <p role="status" className="text-sm text-signal-green">
                  Profile updated.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
