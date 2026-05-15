/**
 * Notion API client + block builders.
 *
 * Shared helper for the four `/api/notion/*` handlers. Each handler builds
 * a domain-specific set of blocks (QBR vs weekly report vs success plan vs
 * client workspace) and hands them off to `createSubpage()`. Design notes
 * captured in PR `feat/notion-real-wireup`:
 *
 *   - **Single parent page model.** `NOTION_PARENT_PAGE_ID` is the default
 *     parent for any page created without an explicit `parent_page_id` in
 *     the body. The integration must be shared on that parent (Notion's
 *     access model is share-explicit · the integration can NOT see a page
 *     until a human shares it). Per-request override is supported so the
 *     workflow can nest a QBR / weekly / success page inside a specific
 *     client workspace instead of the root.
 *
 *   - **Client workspace = page (NOT database row).** Notion databases are
 *     a more rigid model; the rich-content sections we want per client
 *     (brand snapshot · contacts · quick links · attached files) read more
 *     naturally as a page with sub-blocks. A follow-up PR can promote the
 *     client roster to a database with the workspace page as a row property
 *     once we know what columns to standardize on.
 *
 *   - **Brand book == sections in the workspace page.** Same reasoning ·
 *     sections (heading_2 + paragraph) carry the brand voice / forbidden
 *     words / hex codes more legibly than a flat properties pane.
 *
 *   - **`NOTION_API_KEY` is required.** A missing key returns 500 with an
 *     explicit error · the previous stub layer returned 200 with
 *     `fallback_mode: true`, which silently let workflow runs proceed
 *     against fake data. The Cowork directive on this sprint inverted that:
 *     we WANT to know when the integration is broken.
 */
import { Client } from "@notionhq/client";

export class NotionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionConfigError";
  }
}

let cached: Client | null = null;

export function getNotionClient(): Client {
  if (cached) return cached;
  const auth = process.env.NOTION_API_KEY;
  if (!auth) {
    throw new NotionConfigError(
      "NOTION_API_KEY is not configured on this Vercel deployment. Set it via `vercel env add NOTION_API_KEY production preview` and redeploy.",
    );
  }
  cached = new Client({ auth });
  return cached;
}

export function __resetNotionClientForTests(): void {
  cached = null;
}

export function __setNotionClientForTests(client: Client | null): void {
  cached = client;
}

export function resolveParentPageId(bodyOverride?: string | null): string {
  if (bodyOverride) return bodyOverride;
  const env = process.env.NOTION_PARENT_PAGE_ID;
  if (!env) {
    throw new NotionConfigError(
      "No parent page · supply `parent_page_id` in the request body OR set NOTION_PARENT_PAGE_ID env var (the integration must be explicitly shared on that page).",
    );
  }
  return env;
}

type Block = unknown;

export function paragraph(text: string): Block {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }],
    },
  };
}

export function heading2(text: string): Block {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 200) } }],
    },
  };
}

export function heading3(text: string): Block {
  return {
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 200) } }],
    },
  };
}

export function bullet(text: string): Block {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }],
    },
  };
}

export function divider(): Block {
  return { object: "block", type: "divider", divider: {} };
}

export function bulletList(items: string[] | null | undefined): Block[] {
  if (!items?.length) return [paragraph("(none)")];
  return items.map((s) => bullet(s));
}

export interface CreatePageInput {
  parentPageId: string;
  title: string;
  blocks: Block[];
}

export interface CreatedPage {
  page_id: string;
  page_url: string;
  created_time: string;
}

export async function createSubpage(input: CreatePageInput): Promise<CreatedPage> {
  const client = getNotionClient();
  const response = (await client.pages.create({
    parent: { page_id: input.parentPageId } as never,
    properties: {
      title: {
        title: [{ type: "text", text: { content: input.title.slice(0, 200) } }],
      } as never,
    },
    children: input.blocks as never,
  } as never)) as unknown as {
    id: string;
    url: string;
    created_time: string;
  };

  return {
    page_id: response.id,
    page_url: response.url,
    created_time: response.created_time,
  };
}
