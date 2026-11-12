import { describe, expect, it, vi } from "vitest";
const { dbMock }=vi.hoisted(()=>({dbMock:{subscription:{findMany:vi.fn(),update:vi.fn()},businessProfile:{update:vi.fn()},$transaction:vi.fn()}}));
vi.mock("@actorconsole/db",()=>({db:dbMock}));
import { reconcileExpiredSubscriptions } from "./subscription-expiry-fixture.js";
describe("untouched baseline terminal subscription expiry",()=>{
 it.each([["stripe","canceled"],["stripe","unpaid"],["stripe","incomplete_expired"],["stripe","paused"],["dodo","failed"],["dodo","expired"],["dodo","cancelled"]])("audit fixture: removes expired %s %s entitlement",async(provider,status)=>{
  let plan="PRO";
  const row={id:"sub_1",businessProfileId:"workspace_1",provider,status,currentPeriodEnd:new Date(0)};
  dbMock.subscription.findMany.mockImplementation(async({where})=> {
   const matches=row.currentPeriodEnd < where.currentPeriodEnd.lt && where.OR.some((condition:any)=>
     condition.provider ? condition.provider===row.provider && condition.status===row.status : condition.status.in.includes(row.status));
   return matches ? [row] : [];
  });
  dbMock.subscription.update.mockResolvedValue({});
  dbMock.businessProfile.update.mockImplementation(async({data})=>{plan=data.plan;return{};});
  dbMock.$transaction.mockImplementation(async(promises)=>Promise.all(promises));
  await reconcileExpiredSubscriptions();
  expect(plan).toBe("FREE");
 });
});
