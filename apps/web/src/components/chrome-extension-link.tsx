import { ExternalLink } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { CHROME_EXTENSION_STORE_URL } from "@/lib/chrome-extension";

export function ChromeExtensionLink({
  className,
  variant = "outline",
  size = "sm",
}: Pick<ButtonProps, "className" | "variant" | "size">) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a href={CHROME_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
        Install Chrome extension
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  );
}
