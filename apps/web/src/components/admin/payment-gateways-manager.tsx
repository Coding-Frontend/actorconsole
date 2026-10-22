"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentGatewayRow, type PaymentGatewayView } from "./payment-gateway-row";

interface PaymentGatewaysManagerProps {
  gateways: PaymentGatewayView[];
  siteUrl: string;
}

export function PaymentGatewaysManager({ gateways, siteUrl }: PaymentGatewaysManagerProps) {
  const initialGateway = gateways.find((gateway) => gateway.enabled) ?? gateways[0];
  const [selectedGateway, setSelectedGateway] = useState(initialGateway?.key ?? "");
  const webhookBase = API_BASE_URL.startsWith("http")
    ? API_BASE_URL
    : `${siteUrl.replace(/\/+$/, "")}${API_BASE_URL}`;
  if (!initialGateway) return null;

  return (
    <Tabs value={selectedGateway} onValueChange={setSelectedGateway} className="min-w-0">
      <TabsList
        aria-label="Payment providers"
        className="h-auto w-full flex-wrap gap-1 p-1.5 sm:w-auto"
      >
        {gateways.map((gateway) => (
          <TabsTrigger
            key={gateway.key}
            value={gateway.key}
            className="h-11 flex-1 gap-3 px-4 sm:flex-none"
          >
            {gateway.name}
            <Badge
              variant={gateway.enabled ? "success" : "secondary"}
              className="hidden sm:inline-flex"
            >
              {gateway.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {gateways.map((gateway) => (
        <TabsContent
          key={gateway.key}
          value={gateway.key}
          forceMount
          hidden={selectedGateway !== gateway.key}
          className="data-[state=inactive]:hidden"
        >
          <PaymentGatewayRow
            gateway={gateway}
            webhookUrl={`${webhookBase}${gateway.key === "razorpay" ? "/razorpay/webhook" : `/billing/webhooks/${gateway.key}`}`}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
