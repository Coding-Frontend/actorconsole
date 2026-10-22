import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { BlogEditor } from "@/components/admin/blog-editor";

export default function NewBlogPostPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New post" description="Compose, save as draft, or publish immediately." />
      <Card>
        <CardContent className="p-6">
          <BlogEditor />
        </CardContent>
      </Card>
    </div>
  );
}
