import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { ArrowLeft } from "lucide-react";
import { PolicyEditor } from "@/components/admin/policy-editor";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function NewPolicyDraftPage({ searchParams }: Props) {
  const params = await searchParams;
  const preselected = params.slug?.toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/policies">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All policies
          </Link>
        </Button>
      </div>
      <PageHeader
        title="New policy draft"
        description="Create a new version of a legal policy document."
      />
      <Card>
        <CardContent className="p-6">
          <PolicyEditor slug={preselected ?? "TERMS"} versions={[]} />
        </CardContent>
      </Card>
    </div>
  );
}
