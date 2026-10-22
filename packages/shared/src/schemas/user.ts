import { z } from "zod";

export const emailSchema = z.string().email();
export const planSchema = z.enum(["FREE", "PRO"]);
