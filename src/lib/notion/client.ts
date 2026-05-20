/**
 * Notion client wrapper · Sprint 4 D5 · Reporting Track.
 *
 * Lazy-init singleton that only constructs the `@notionhq/client` Client
 * when `NOTION_TOKEN` is present. Helper functions return either the live
 * Notion response OR a structured 503-ish object that the API route can
 * surface to callers cleanly · NO throws on env absence.
 */
import { Client } from "@notionhq/client"

let _client: Client | null = null

export function getNotionClient(): Client | null {
  if (!process.env.NOTION_TOKEN) return null
  if (_client) return _client
  _client = new Client({ auth: process.env.NOTION_TOKEN })
  return _client
}

export function __resetNotionClientForTests(): void {
  _client = null
}

export interface NotionResult<T> {
  ok: boolean
  data?: T
  code?: "NotConfigured" | "InvalidInput" | "UpstreamError"
  detail?: string
}

interface NotionPageResponse {
  id: string
  url?: string
}

interface NotionQueryResponse {
  results: Array<{ id: string; properties?: Record<string, unknown> }>
  has_more: boolean
}

function notConfigured<T>(): NotionResult<T> {
  return {
    ok: false,
    code: "NotConfigured",
    detail: "NOTION_TOKEN env missing · skipping Notion sync",
  }
}

function upstreamError<T>(err: unknown): NotionResult<T> {
  const detail = err instanceof Error ? err.message : String(err)
  return {
    ok: false,
    code: "UpstreamError",
    detail: detail.slice(0, 400),
  }
}

export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<NotionResult<NotionPageResponse>> {
  if (!databaseId) {
    return {
      ok: false,
      code: "InvalidInput",
      detail: "databaseId is required",
    }
  }
  const client = getNotionClient()
  if (!client) return notConfigured<NotionPageResponse>()
  try {
    const res = await client.pages.create({
      parent: { database_id: databaseId },
      properties: properties as Parameters<typeof client.pages.create>[0]["properties"],
    })
    return {
      ok: true,
      data: { id: res.id, url: "url" in res ? res.url : undefined },
    }
  } catch (err) {
    return upstreamError<NotionPageResponse>(err)
  }
}

export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
): Promise<NotionResult<NotionQueryResponse>> {
  if (!databaseId) {
    return {
      ok: false,
      code: "InvalidInput",
      detail: "databaseId is required",
    }
  }
  const client = getNotionClient()
  if (!client) return notConfigured<NotionQueryResponse>()
  try {
    const res = await client.databases.query({
      database_id: databaseId,
      filter: filter as Parameters<typeof client.databases.query>[0]["filter"],
    })
    return {
      ok: true,
      data: {
        results: res.results.map((r) => ({
          id: r.id,
          properties: "properties" in r ? (r.properties as Record<string, unknown>) : undefined,
        })),
        has_more: res.has_more ?? false,
      },
    }
  } catch (err) {
    return upstreamError<NotionQueryResponse>(err)
  }
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<NotionResult<NotionPageResponse>> {
  if (!pageId) {
    return {
      ok: false,
      code: "InvalidInput",
      detail: "pageId is required",
    }
  }
  const client = getNotionClient()
  if (!client) return notConfigured<NotionPageResponse>()
  try {
    const res = await client.pages.update({
      page_id: pageId,
      properties: properties as Parameters<typeof client.pages.update>[0]["properties"],
    })
    return {
      ok: true,
      data: { id: res.id, url: "url" in res ? res.url : undefined },
    }
  } catch (err) {
    return upstreamError<NotionPageResponse>(err)
  }
}

/**
 * Canonical database IDs for the 3 reporting destinations. Populated
 * from env when the Notion workspace databases are created. Each is
 * optional · the route returns NotConfigured if the requested type is
 * missing its env var.
 */
export function getReportDatabaseId(
  type: "campaign" | "client" | "weekly",
): string | null {
  switch (type) {
    case "campaign":
      return process.env.NOTION_DATABASE_CAMPAIGNS || null
    case "client":
      return process.env.NOTION_DATABASE_CLIENTS || null
    case "weekly":
      return process.env.NOTION_DATABASE_WEEKLY || null
  }
}
