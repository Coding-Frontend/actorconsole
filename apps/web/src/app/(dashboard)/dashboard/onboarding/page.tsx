"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, CreditCard, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PLAN_ACTOR_LIMITS, PLAN_MARKETING_FEATURES } from "@actorconsole/shared/plans";
import type { Plan } from "@actorconsole/shared";
import { API_BASE_URL } from "@/lib/api-base";
import { cn } from "@/lib/utils";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApifyConnect } from "@/components/dashboard/apify-connect";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";

type OnboardingStep = "workspace" | "credentials" | "plan" | "complete";

interface OnboardingData {
  currentStep: OnboardingStep;
  plan: Plan;
  workspace: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    website: string | null;
  } | null;
  credentials: {
    apiKeyConfigured: boolean;
    uiTokenConfigured: boolean;
    cookiesConfigured: boolean;
    apiTokenStatus?: string;
    uiTokenStatus?: string;
    cookiesStatus?: string;
    mode?: "FULL" | "API_ONLY" | "PUBLISHING_ONLY" | "LIMITED";
  };
}

interface ApifyAccountIdentity {
  id: string;
  username: string;
  name: string | null;
  displayName: string;
  url: string;
}

type ApiError = { error?: { message?: string } };

const steps: Array<{
  id: Exclude<OnboardingStep, "complete">;
  number: string;
  title: string;
  description: string;
  icon: typeof Building2;
}> = [
  {
    id: "workspace",
    number: "01",
    title: "Create workspace",
    description: "Name the workspace where your Actors will live.",
    icon: Building2,
  },
  {
    id: "credentials",
    number: "02",
    title: "Connect Apify",
    description: "Choose an Apify account, then add API access when ready.",
    icon: KeyRound,
  },
  {
    id: "plan",
    number: "03",
    title: "Choose a plan",
    description: "Review the available operating limits and finish setup.",
    icon: CreditCard,
  },
];

const planCopy: Record<Plan, { name: string; audience: string; detail: string }> = {
  FREE: {
    name: "Free",
    audience: "Up to 50 actors and 500 monthly users",
    detail: "Use AI, pricing, publishing, and MCP within the Free workspace limits.",
  },
  PRO: {
    name: "Pro",
    audience: "For active independent builders",
    detail:
      "Keep every workflow available as your actor portfolio and audience grow beyond the Free limits.",
  },
};

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

function StepRail({ currentStep, plan }: { currentStep: OnboardingStep; plan: Plan }) {
  const visibleSteps = plan === "PRO" ? steps.filter((step) => step.id !== "plan") : steps;
  const effectiveStep = plan === "PRO" && currentStep === "plan" ? "complete" : currentStep;
  const currentIndex =
    effectiveStep === "complete"
      ? visibleSteps.length
      : visibleSteps.findIndex((step) => step.id === effectiveStep);

  return (
    <ol
      className={cn("grid gap-3", visibleSteps.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3")}
      aria-label="Onboarding progress"
    >
      {visibleSteps.map((step, index) => {
        const Icon = step.icon;
        const complete = index < currentIndex || effectiveStep === "complete";
        const active = step.id === effectiveStep;
        return (
          <li
            key={step.id}
            className={cn(
              "border-border/80 bg-card relative min-w-0 border p-4 transition-colors",
              active && "border-signal-orange/55 bg-signal-orange/[0.04]",
              complete && "border-signal-green/35",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "border-border bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border",
                  active && "border-signal-orange/40 bg-signal-orange/10 text-signal-orange",
                  complete && "border-signal-green/40 bg-signal-green/10 text-signal-green",
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="data-stamp text-muted-foreground block">{step.number}</span>
                <span className="mt-1 block text-sm font-semibold">{step.title}</span>
                <span className="text-muted-foreground mt-1 block text-xs leading-5">
                  {step.description}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [workspaceName, setWorkspaceName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [workspaceApifyToken, setWorkspaceApifyToken] = useState("");
  const [apifyIdentity, setApifyIdentity] = useState<ApifyAccountIdentity | null>(null);

  const loadOnboarding = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/onboarding`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Could not load onboarding state"));
      }
      const body = (await response.json()) as { data?: OnboardingData };
      if (!body.data) throw new Error("The onboarding response was invalid");
      setData(body.data);
      const destination = safeCallbackUrl(
        new URLSearchParams(window.location.search).get("callbackUrl"),
      );
      if (body.data.workspace && destination.split(/[?#]/)[0] === "/dashboard/billing") {
        // Billing needs a workspace; Apify connection remains optional.
        navigateInApp(destination);
      } else if (body.data.currentStep === "complete") router.replace(destination);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load onboarding state");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadOnboarding();
  }, [loadOnboarding]);

  async function completeStep(step: "credentials" | "plan") {
    const response = await fetch(`${API_BASE_URL}/account/onboarding`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step }),
    });
    if (!response.ok) {
      throw new Error(await responseMessage(response, "Could not save onboarding progress"));
    }
    return (await response.json()) as { data?: { currentStep?: OnboardingStep } };
  }

  async function previewApifyAccount(
    rawToken = workspaceApifyToken,
  ): Promise<ApifyAccountIdentity> {
    const token = rawToken.trim();
    const response = await fetch(`${API_BASE_URL}/account/onboarding/apify-preview`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: ApifyAccountIdentity;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.data) {
      throw new Error(body?.error?.message ?? "Could not verify the Apify API key");
    }
    setApifyIdentity(body.data);
    setWorkspaceName((current) => current.trim() || body.data!.displayName);
    return body.data;
  }

  function detectApifyAccount() {
    startTransition(async () => {
      try {
        const identity = await previewApifyAccount();
        toast.success(`Apify account found: ${identity.displayName}`);
      } catch (error) {
        setApifyIdentity(null);
        toast.error(error instanceof Error ? error.message : "Could not verify the Apify API key");
      }
    });
  }

  function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      let workspaceCreated = false;
      try {
        const token = workspaceApifyToken.trim();
        if (token && !apifyIdentity) {
          const identity = await previewApifyAccount(token);
          toast.success(
            `Apify account found: ${identity.displayName}. Review the name and confirm.`,
          );
          return;
        }

        const name = workspaceName.trim();
        if (!name) return;

        const response = await fetch(`${API_BASE_URL}/account/business-profiles`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            ...(industry.trim() ? { industry: industry.trim() } : {}),
            ...(website.trim() ? { website: website.trim() } : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(await responseMessage(response, "Could not create the workspace"));
        }
        workspaceCreated = true;

        let syncWarning: string | null = null;
        if (token) {
          const connectResponse = await fetch(`${API_BASE_URL}/apify/connect`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const connectBody = await connectResponse.json().catch(() => null);
          if (!connectResponse.ok) {
            throw new Error(
              connectBody?.error?.message ??
                "The workspace was created, but the Apify API key could not be saved.",
            );
          }

          const syncResponse = await fetch(`${API_BASE_URL}/actors/sync`, {
            method: "POST",
            credentials: "include",
          });
          const syncBody = await syncResponse.json().catch(() => null);
          if (!syncResponse.ok || !syncBody?.ok) {
            syncWarning =
              syncBody?.error?.message ??
              "Apify connected, but the initial Actor sync needs to be retried.";
          }
        }

        toast.success(
          token ? `${name} workspace created and Apify connected` : `${name} workspace created`,
        );
        if (syncWarning) toast.warning(syncWarning);
        setWorkspaceApifyToken("");
        setApifyIdentity(null);
        await loadOnboarding();
      } catch (error) {
        if (workspaceCreated) await loadOnboarding();
        toast.error(error instanceof Error ? error.message : "Could not create the workspace");
      }
    });
  }

  async function finishCredentialsAfterSave() {
    await completeStep("credentials");
    await loadOnboarding();
  }

  function continueWithoutCredentialChanges() {
    startTransition(async () => {
      try {
        await completeStep("credentials");
        toast.success("Credential setup saved for this workspace");
        await loadOnboarding();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not continue onboarding");
      }
    });
  }

  function finishWithCurrentPlan() {
    startTransition(async () => {
      try {
        await completeStep("plan");
        toast.success("Workspace setup complete");
        // Completing onboarding changes the active workspace and plan state
        // consumed by the dashboard layout. A client-side route transition can
        // briefly retain the pre-onboarding layout ("Set up a workspace")
        // until the user performs another navigation. Reload the dashboard so
        // every server component reads the newly persisted workspace at once.
        navigateInApp(
          safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackUrl")),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not finish onboarding");
      }
    });
  }

  function upgradePlan() {
    startTransition(async () => {
      try {
        await completeStep("plan");
        // Choose a billing interval before starting any subscription.
        navigateInApp("/dashboard/billing");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not start checkout");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="text-signal-orange h-7 w-7 animate-spin" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <DashboardAsyncState
          status="error"
          title="Onboarding is unavailable"
          description={loadError ?? "The onboarding response was invalid"}
          onRetry={() => void loadOnboarding()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 py-2 sm:py-4">
      <DashboardPageHeader
        context="Workspace onboarding"
        title="Set up an operating home for your Actors"
        description="Every workspace keeps its Actors, Apify credentials, schedules, and reporting separate. You can create and switch between workspaces at any time."
        breadcrumbs={[{ label: "Workspace" }, { label: "Onboarding" }]}
        status={
          data.workspace ? (
            <span className="text-muted-foreground font-mono text-[10px] uppercase">
              {data.workspace.name} / {data.plan} plan
            </span>
          ) : undefined
        }
      />

      <StepRail currentStep={data.currentStep} plan={data.plan} />

      {data.currentStep === "workspace" && (
        <Card className="border-border/80 overflow-hidden">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
            <CardHeader className="bg-ink border-border/40 border-b text-white lg:border-b-0 lg:border-r">
              <span className="border-signal-orange/40 bg-signal-orange/10 text-signal-orange flex h-11 w-11 items-center justify-center rounded-sm border">
                <Building2 className="h-5 w-5" />
              </span>
              <CardTitle className="font-display-tight mt-8 text-3xl text-white">
                Create your first workspace
              </CardTitle>
              <CardDescription className="mt-2 max-w-sm text-white/60">
                Start with a workspace name. You can choose an Apify account in the next step.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-7">
              <form onSubmit={createWorkspace} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="e.g. Local data products"
                    maxLength={100}
                    required={!workspaceApifyToken.trim() || Boolean(apifyIdentity)}
                  />
                </div>
                <details className="border-border/80 bg-muted/20 rounded-md border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Have an Apify API key? Use it to suggest a workspace name
                  </summary>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="workspace-apify-token">Apify API key</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="workspace-apify-token"
                        type="password"
                        value={workspaceApifyToken}
                        onChange={(event) => {
                          setWorkspaceApifyToken(event.target.value);
                          setApifyIdentity(null);
                        }}
                        placeholder="apify_api_…"
                        autoComplete="off"
                        spellCheck={false}
                        className="sm:flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={detectApifyAccount}
                        disabled={pending || workspaceApifyToken.trim().length < 20}
                      >
                        {pending && !apifyIdentity ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        Find account name
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs leading-5">
                      Optional. The key is verified on the server and saved only when you confirm
                      the workspace.
                    </p>
                  </div>
                </details>

                {apifyIdentity ? (
                  <div className="border-signal-green/35 bg-signal-green/[0.06] border p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Apify account found</p>
                        <p className="mt-1">
                          {apifyIdentity.displayName}{" "}
                          <span className="text-muted-foreground">@{apifyIdentity.username}</span>
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Account ID: {apifyIdentity.id}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setWorkspaceApifyToken("");
                          setApifyIdentity(null);
                        }}
                        disabled={pending}
                      >
                        Use another key
                      </Button>
                    </div>
                  </div>
                ) : null}

                <details className="border-border/80 rounded-md border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Add optional workspace details
                  </summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-industry">
                        Industry <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="workspace-industry"
                        value={industry}
                        onChange={(event) => setIndustry(event.target.value)}
                        placeholder="Data services"
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workspace-website">
                        Website <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="workspace-website"
                        type="url"
                        value={website}
                        onChange={(event) => setWebsite(event.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                </details>
                <div className="border-border flex justify-end border-t pt-5">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={pending || (!workspaceName.trim() && !workspaceApifyToken.trim())}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    {apifyIdentity
                      ? "Confirm and create workspace"
                      : workspaceApifyToken.trim()
                        ? "Find account name"
                        : "Create workspace"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </div>
        </Card>
      )}

      {data.currentStep === "credentials" && (
        <Card className="border-border/80">
          <CardHeader className="border-border/80 border-b">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <KeyRound className="text-signal-orange h-5 w-5" />
                  Connect this workspace to Apify
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Use the Chrome extension to choose an Apify personal account or organization. Add
                  an API key to sync and run Actors. You can complete either part later.
                </CardDescription>
              </div>
              <Badge variant="outline">Optional step</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-7">
            <ApifyConnect
              initialStatus={{
                connected:
                  data.credentials.apiKeyConfigured ||
                  data.credentials.uiTokenConfigured ||
                  data.credentials.cookiesConfigured,
                apiKeyConfigured: data.credentials.apiKeyConfigured,
                uiTokenConfigured: data.credentials.uiTokenConfigured,
                cookiesConfigured: data.credentials.cookiesConfigured,
                apiTokenStatus: data.credentials.apiTokenStatus,
                uiTokenStatus: data.credentials.uiTokenStatus,
                cookiesStatus: data.credentials.cookiesStatus,
                credentialMode: data.credentials.mode,
              }}
              onConnected={finishCredentialsAfterSave}
              submitLabel="Save and continue"
              showDisconnect={false}
            />

            <div className="border-border flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs leading-5">
                You can explore this workspace now. Actor sync and publishing become available after
                API access is connected.
              </p>
              <Button
                size="lg"
                variant="outline"
                onClick={continueWithoutCredentialChanges}
                disabled={pending}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {data.credentials.apiKeyConfigured ||
                data.credentials.uiTokenConfigured ||
                data.credentials.cookiesConfigured
                  ? "Continue with current setup"
                  : "Continue without credentials"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.currentStep === "plan" && data.plan !== "PRO" && (
        <div className="space-y-5">
          {data.credentials.mode === "LIMITED" ? (
            <div className="border-signal-orange/30 bg-signal-orange/[0.06] border p-4 text-sm leading-6">
              <p className="font-medium">Limited mode is active</p>
              <p className="text-muted-foreground mt-1">
                You can finish onboarding and explore the workspace, but actor sync and publishing
                remain unavailable until credentials are added in Settings.
              </p>
            </div>
          ) : null}
          <div className="border-border/80 bg-card border p-5 sm:p-7">
            <p className="type-kicker text-signal-orange">Final step</p>
            <h2 className="font-display-tight mt-3 text-3xl">Choose how you want to start.</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              Your current plan is {data.plan}. Continue with it now, or start checkout for a paid
              plan. You&apos;ll see the final price and renewal terms before authorization.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {(["FREE", "PRO"] as const).map((plan) => {
              const current = data.plan === plan;
              const isPro = plan === "PRO";
              const actorLimit = PLAN_ACTOR_LIMITS[plan];
              return (
                <Card
                  key={plan}
                  className={cn(
                    "flex h-full flex-col",
                    isPro && "border-signal-orange/50 shadow-card-hover",
                    current && "ring-signal-green/50 ring-1",
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <span className="data-stamp text-muted-foreground">{plan}</span>
                      {current ? (
                        <Badge variant="success">Current</Badge>
                      ) : isPro ? (
                        <Badge variant="warning">Recommended</Badge>
                      ) : null}
                    </div>
                    <CardTitle className="font-display-tight mt-4 text-3xl">
                      {planCopy[plan].name}
                    </CardTitle>
                    <CardDescription>{planCopy[plan].audience}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="text-muted-foreground text-sm leading-6">
                      {planCopy[plan].detail}
                    </p>
                    <p className="mt-5 text-sm font-semibold">
                      {actorLimit === null
                        ? "Unlimited tracked actors"
                        : `Up to ${actorLimit} tracked actors and 500 monthly users`}
                    </p>
                    <ul className="border-border mt-5 flex-1 space-y-2 border-t pt-4">
                      {PLAN_MARKETING_FEATURES[plan].slice(0, 5).map((feature) => (
                        <li
                          key={feature}
                          className="text-muted-foreground flex gap-2 text-xs leading-5"
                        >
                          <Check className="text-signal-orange mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {plan === "FREE" || current ? (
                      <Button
                        className="mt-6 w-full"
                        variant={current ? "default" : "outline"}
                        onClick={finishWithCurrentPlan}
                        disabled={pending}
                      >
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Continue with {current ? "current plan" : "Free"}
                      </Button>
                    ) : (
                      <Button
                        className="mt-6 w-full"
                        variant={isPro ? "default" : "outline"}
                        onClick={() => upgradePlan()}
                        disabled={pending}
                      >
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Upgrade to {planCopy[plan].name}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
