/**
 * Notion DB row writers · Sprint 8C dual-mode refactor.
 *
 * Companion to `notion-client.ts` (page-based writers · existing canonical).
 * This helper adds row creation in the 3 canonical sub-databases (Clientes ·
 * Campañas · Reportes) created Sprint 8A Item #2 by CC#3.
 *
 * Dual-mode pattern · existing page writers stay unchanged (backward compat ·
 * cliente recibe link al page · downstream workflows consume pages) · these
 * row writers run alongside · graceful failure · NO block page on row error.
 *
 * Env required (all populated locally · Vercel pending Emilio post-merge) ·
 *   NOTION_API_KEY                        · canonical
 *   NOTION_CLIENTS_DATA_SOURCE_ID         · dac8d61b-...
 *   NOTION_CAMPAIGNS_DATA_SOURCE_ID       · 38322e08-...
 *   NOTION_REPORTS_DATA_SOURCE_ID         · 7ec5c20f-...
 *
 * Schemas per Sprint 8A Item #2 vault doc · canonical column names exact match.
 */
import { getNotionClient } from "./notion-client";

export interface ClienteRowInput {
  client_id: string; // Cliente UUID (required · canonical)
  client_name: string; // title field
  slug?: string;
  estado?: "active" | "onboarding" | "paused" | "churned";
  industria?: string;
  email?: string;
  sitio_web?: string;
  onboarded_at?: string; // ISO date
  brand_book_url?: string;
  notion_workspace_page?: string; // link back a subpage
}

export interface ReporteRowInput {
  report_id: string; // Report UUID (required)
  titulo: string; // title field
  tipo: "weekly" | "qbr" | "monthly" | "incident" | "ad-hoc" | "success-plan";
  client_id: string;
  cliente_slug?: string;
  campaign_related_name?: string;
  periodo_start?: string; // ISO date
  periodo_end?: string;
  generated_at?: string;
  status?: "draft" | "delivered" | "archived";
  notion_page_url?: string; // link a Notion subpage
}

export interface CampanaRowInput {
  campaign_id: string;
  nombre: string;
  client_id: string;
  cliente_slug?: string;
  nexus_phase?:
    | "DISCOVER"
    | "STRATEGIZE"
    | "SCAFFOLD"
    | "BUILD"
    | "HARDEN"
    | "LAUNCH"
    | "OPERATE"
    | "COMPLETED";
  status?: "active" | "paused" | "completed";
  budget_usd?: number;
  goal?: string;
  started_at?: string;
  completed_at?: string;
  request_id?: string;
}

export interface CreatedDbRow {
  row_id: string;
  row_url: string;
  data_source_id: string;
}

function buildRichText(text: string) {
  return [{ type: "text" as const, text: { content: text.slice(0, 2000) } }];
}

function buildTitle(text: string) {
  return [{ type: "text" as const, text: { content: text.slice(0, 200) } }];
}

export async function createClienteRow(
  input: ClienteRowInput,
): Promise<CreatedDbRow> {
  const dataSourceId = process.env.NOTION_CLIENTS_DATA_SOURCE_ID;
  if (!dataSourceId) {
    throw new Error(
      "NOTION_CLIENTS_DATA_SOURCE_ID env missing · canonical Sprint 8A Item #2",
    );
  }
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {
    Nombre: { title: buildTitle(input.client_name) },
    "Cliente UUID": { rich_text: buildRichText(input.client_id) },
  };
  if (input.slug) properties["Slug"] = { rich_text: buildRichText(input.slug) };
  if (input.estado) properties["Estado"] = { select: { name: input.estado } };
  if (input.industria)
    properties["Industria"] = { rich_text: buildRichText(input.industria) };
  if (input.email) properties["Email"] = { email: input.email };
  if (input.sitio_web) properties["Sitio Web"] = { url: input.sitio_web };
  if (input.onboarded_at)
    properties["Onboarded At"] = { date: { start: input.onboarded_at } };
  if (input.brand_book_url)
    properties["Brand Book URL"] = { url: input.brand_book_url };
  if (input.notion_workspace_page)
    properties["Notion Workspace Page"] = { url: input.notion_workspace_page };

  const res = (await notion.pages.create({
    parent: { data_source_id: dataSourceId } as never,
    properties: properties as never,
  } as never)) as unknown as { id: string; url: string };

  return {
    row_id: res.id,
    row_url: res.url,
    data_source_id: dataSourceId,
  };
}

export async function createReporteRow(
  input: ReporteRowInput,
): Promise<CreatedDbRow> {
  const dataSourceId = process.env.NOTION_REPORTS_DATA_SOURCE_ID;
  if (!dataSourceId) {
    throw new Error(
      "NOTION_REPORTS_DATA_SOURCE_ID env missing · canonical Sprint 8A Item #2",
    );
  }
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {
    Título: { title: buildTitle(input.titulo) },
    Tipo: { select: { name: input.tipo } },
    "Cliente UUID": { rich_text: buildRichText(input.client_id) },
    "Report UUID": { rich_text: buildRichText(input.report_id) },
  };
  if (input.cliente_slug)
    properties["Cliente"] = { rich_text: buildRichText(input.cliente_slug) };
  if (input.campaign_related_name)
    properties["Campaña Relacionada"] = {
      rich_text: buildRichText(input.campaign_related_name),
    };
  if (input.periodo_start)
    properties["Período Start"] = { date: { start: input.periodo_start } };
  if (input.periodo_end)
    properties["Período End"] = { date: { start: input.periodo_end } };
  if (input.generated_at)
    properties["Generated At"] = { date: { start: input.generated_at } };
  if (input.status) properties["Status"] = { select: { name: input.status } };
  if (input.notion_page_url)
    properties["Notion Page URL"] = { url: input.notion_page_url };

  const res = (await notion.pages.create({
    parent: { data_source_id: dataSourceId } as never,
    properties: properties as never,
  } as never)) as unknown as { id: string; url: string };

  return {
    row_id: res.id,
    row_url: res.url,
    data_source_id: dataSourceId,
  };
}

export async function createCampanaRow(
  input: CampanaRowInput,
): Promise<CreatedDbRow> {
  const dataSourceId = process.env.NOTION_CAMPAIGNS_DATA_SOURCE_ID;
  if (!dataSourceId) {
    throw new Error(
      "NOTION_CAMPAIGNS_DATA_SOURCE_ID env missing · canonical Sprint 8A Item #2",
    );
  }
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {
    Nombre: { title: buildTitle(input.nombre) },
    "Cliente UUID": { rich_text: buildRichText(input.client_id) },
    "Campaign UUID": { rich_text: buildRichText(input.campaign_id) },
  };
  if (input.cliente_slug)
    properties["Cliente"] = { rich_text: buildRichText(input.cliente_slug) };
  if (input.nexus_phase)
    properties["NEXUS Phase"] = { select: { name: input.nexus_phase } };
  if (input.status) properties["Status"] = { select: { name: input.status } };
  if (typeof input.budget_usd === "number")
    properties["Budget USD"] = { number: input.budget_usd };
  if (input.goal) properties["Goal"] = { rich_text: buildRichText(input.goal) };
  if (input.started_at)
    properties["Started At"] = { date: { start: input.started_at } };
  if (input.completed_at)
    properties["Completed At"] = { date: { start: input.completed_at } };
  if (input.request_id)
    properties["Request ID"] = { rich_text: buildRichText(input.request_id) };

  const res = (await notion.pages.create({
    parent: { data_source_id: dataSourceId } as never,
    properties: properties as never,
  } as never)) as unknown as { id: string; url: string };

  return {
    row_id: res.id,
    row_url: res.url,
    data_source_id: dataSourceId,
  };
}

/**
 * Graceful dual-mode wrapper · catches any DB row errors · NEVER throws ·
 * caller continues con page creation as primary canonical path.
 *
 * Returns null si DB row creation failed (env missing OR Notion API error)
 * · caller logs advisory + continues.
 */
export async function tryCreateDbRow<T>(
  creator: () => Promise<T>,
  context: string,
): Promise<T | null> {
  try {
    return await creator();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[notion-db-row] ${context} · failed · ${msg.slice(0, 300)}`);
    return null;
  }
}
