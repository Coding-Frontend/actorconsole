import React from "react";
import { createRoot } from "react-dom/client";
import { MarketingHeader } from "@/components/marketing/header";
import { NewsletterSubscribe } from "@/components/marketing/newsletter-subscribe";
import { ContactForm } from "@/components/marketing/contact-form";
import { CommandPalette, useCommandPalette } from "@/components/dashboard/command-palette";
import { DocsShell } from "@/components/docs/docs-shell";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { AdminSidebarProvider } from "@/components/admin/sidebar-provider";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { TicketReplyBox } from "@/components/dashboard/ticket-reply-box";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import "@/app/globals.css";

function Harness() {
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const view = new URLSearchParams(location.search).get("view");
  if (view === "admin") return <AdminSidebarProvider><div className="admin-shell flex"><AdminSidebar /><div className="min-w-0 flex-1"><AdminTopbar /><main><button type="button">Background action</button></main></div></div></AdminSidebarProvider>;
  if (view === "docs") return <DocsShell><h1>Local guide</h1></DocsShell>;
  if (view === "auth") return <main className="mx-auto max-w-md p-5"><EmailPasswordForm mode="login" /></main>;
  if (view === "ticket") return <main className="mx-auto max-w-lg p-5"><TicketReplyBox ticketId="disposable-ticket" /></main>;
  if (view === "notifications") return <main className="p-5"><NotificationCenter /></main>;
  return <>
    <MarketingHeader />
    <main className="p-5">
      <h1>Disposable presentation audit</h1>
      <button type="button" onClick={() => setPaletteOpen(true)}>Open command palette</button>
      <div contentEditable role="textbox" aria-label="Editable audit note" suppressContentEditableWarning>Local editable note</div>
      <section className="my-8 max-w-lg"><h2>Newsletter</h2><NewsletterSubscribe /></section>
      <section className="my-8 max-w-lg"><h2>Contact</h2><ContactForm /></section>
      <a href="#end">Background link</a><div style={{ height: 1400 }} /><p id="end">End of page</p>
    </main>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
  </>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
