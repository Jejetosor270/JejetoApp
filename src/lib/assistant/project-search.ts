import "server-only";

import { z } from "zod";
import {
  ASSISTANT_RESULT_LIMIT,
  type AssistantRecord,
  type AssistantSearchResults,
} from "@/domain/assistant/contracts";
import {
  matchProjectNames,
  isProjectPartialMatch,
} from "@/domain/assistant/project-matching";
import { getDatabase } from "@/lib/db";

const querySchema = z.string().trim().min(2).max(100);
const PROJECT_CATALOG_LIMIT = 500;
const projectSelect = {
  id: true,
  name: true,
  code: true,
  client: { select: { displayName: true } },
} as const;
interface ProjectMatch {
  id: string;
  name: string;
  code: string;
  client: { displayName: string } | null;
}

function record(project: ProjectMatch): AssistantRecord {
  return {
    id: project.id,
    type: "Project",
    label: project.name,
    context: `${project.code} · ${project.client?.displayName ?? "Unassigned"}`,
    href: `/projects/${encodeURIComponent(project.id)}`,
  };
}

/** Fallback after no literal exact match. A truncated catalog never establishes uniqueness. */
export async function suggestAssistantProjects(
  query: string,
  partial: ProjectMatch[] = [],
): Promise<AssistantSearchResults> {
  const text = querySchema.parse(query);
  const projects = await getDatabase().project.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: PROJECT_CATALOG_LIMIT + 1,
    select: projectSelect,
  });
  const catalogTruncated = projects.length > PROJECT_CATALOG_LIMIT;
  const matches = matchProjectNames(
    text,
    projects.slice(0, PROJECT_CATALOG_LIMIT),
  );
  const matchedIds = new Set(matches.map((match) => match.project.id));
  for (const project of partial) {
    if (!matchedIds.has(project.id) && isProjectPartialMatch(text, project)) {
      matches.push({ project, requiresConfirmation: true });
      matchedIds.add(project.id);
    }
  }
  return {
    results: matches
      .slice(0, ASSISTANT_RESULT_LIMIT)
      .map(({ project }) => record(project)),
    truncated:
      catalogTruncated ||
      partial.length > ASSISTANT_RESULT_LIMIT ||
      matches.length > ASSISTANT_RESULT_LIMIT,
    ...(matches.some((match) => match.requiresConfirmation)
      ? { requiresConfirmation: true }
      : {}),
  };
}

/** Active-user authentication belongs to the caller; all reads use the Trash-aware client. */
export async function searchAssistantProjects(
  query: string,
  options: { allowSuggestions?: boolean } = {},
): Promise<AssistantSearchResults> {
  const text = querySchema.parse(query);
  const database = getDatabase();
  const find = (exact: boolean, excludedIds: string[]) => {
    const match = exact
      ? { equals: text, mode: "insensitive" as const }
      : { contains: text, mode: "insensitive" as const };
    return database.project.findMany({
      where: {
        id: { notIn: excludedIds },
        OR: [{ name: match }, { code: match }],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: ASSISTANT_RESULT_LIMIT + 1,
      select: projectSelect,
    });
  };
  const exact = await find(true, []);
  if (exact.length)
    return {
      results: exact.slice(0, ASSISTANT_RESULT_LIMIT).map(record),
      truncated: exact.length > ASSISTANT_RESULT_LIMIT,
    };
  const partial = await find(false, []);
  if (options.allowSuggestions !== false)
    return suggestAssistantProjects(text, partial);
  const matches = partial.filter((project) =>
    isProjectPartialMatch(text, project),
  );
  return {
    results: matches.slice(0, ASSISTANT_RESULT_LIMIT).map(record),
    truncated: partial.length > ASSISTANT_RESULT_LIMIT,
    ...(matches.length ? { requiresConfirmation: true } : {}),
  };
}
