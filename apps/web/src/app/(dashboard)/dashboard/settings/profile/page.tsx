"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Loader2, CheckCircle2 } from "lucide-react";

const API_BASE = API_BASE_URL;

interface Profile {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  image: string | null;
  bio: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/account/profile`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) {
          setProfile(j.data);
          setName(j.data.name ?? "");
          setUsername(j.data.username ?? "");
          setBio(j.data.bio ?? "");
          setImage(j.data.image ?? "");
        }
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  function handleSave() {
    startSave(async () => {
      try {
        const res = await fetch(`${API_BASE}/account/profile`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            username: username || null,
            bio: bio || null,
            image: image.trim() || null,
          }),
        });
        if (!res.ok) {
          const result = await res.json().catch(() => null);
          throw new Error(result?.error?.message ?? `HTTP ${res.status}`);
        }
        const result = await res.json().catch(() => null);
        if (result?.data) setProfile(result.data);
        toast.success("Profile updated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Account / Identity"
        title="Profile"
        description="Manage the name, photo, and details shown for your ActorConsole account."
        breadcrumbs={[{ label: "Account" }, { label: "Profile" }]}
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Personal info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              {image ? (
                <AvatarImage src={image} alt={`${profile?.name ?? "Your"} profile photo`} />
              ) : null}
              <AvatarFallback className="bg-signal-orange text-ink text-xl font-bold">
                {profile?.name?.charAt(0) ?? profile?.email?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{profile?.name ?? "You"}</p>
              {profile?.username ? (
                <p className="text-muted-foreground text-sm">@{profile.username}</p>
              ) : null}
              <p className="text-muted-foreground text-sm">{profile?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-image">Profile photo URL</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="profile-image"
                type="url"
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="min-w-56 flex-1"
              />
              {image ? (
                <Button type="button" variant="outline" onClick={() => setImage("")}>
                  Remove photo
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Paste a public image URL to preview it above. Save changes to update your profile.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoComplete="username"
            />
            <p className="text-muted-foreground text-xs">3–30 letters, numbers, or underscores.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBio(e.target.value)}
              placeholder="A short bio..."
              rows={3}
            />
            <p className="text-muted-foreground text-xs">{bio.length}/500 characters</p>
          </div>

          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <CheckCircle2 className="text-signal-green h-3.5 w-3.5" />
            ActorConsole account authentication is active
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
