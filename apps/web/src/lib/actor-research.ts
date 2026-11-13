import type { ResearchActor, ResearchFilters } from "@actorconsole/shared/actor-research";
import { backendData } from "./backend-data";

export function getResearchCategories(): Promise<string[]> { return backendData("research-categories"); }
export function getActorResearch(filters: ResearchFilters): Promise<{ actors: ResearchActor[]; total: number; page: number; pageSize: number }> { return backendData("research", [filters]); }
