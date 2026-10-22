export type { Plan } from "../../../../packages/shared/src/types/user";
export { PLAN_MARKETING_FEATURES } from "../../../../packages/shared/src/plans";
export { POLICY_META, policyMetaBySlug } from "../../../../packages/shared/src/policies";
export type { IntegrationCategory } from "../../../../packages/shared/src/integrations-catalog";
export {
  INTEGRATION_CATALOG,
  getIntegrationDef,
} from "../../../../packages/shared/src/integrations-catalog";
// Server logs remain on the API. Do not include backend logger/crypto/email code in the static client.
export function getLogger(_name: string) {
  return { error: () => undefined, info: () => undefined, warn: () => undefined };
}
