// ============================================================
// ZERO RISK V3 — Edge Function: generate-embedding
// Pilar 2: Client Brain con RAG Semántico
//
// Generates vector embeddings via OpenAI text-embedding-3-small
// Returns vector(1536) for storage in pgvector columns
//
// Usage modes:
//   1. Generate embedding only (return vector)
//   2. Generate + store in a specific table/row
//   3. Batch: generate embeddings for multiple texts
//
// Requires env var: OPENAI_API_KEY
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;

// Tables that have embedding columns in the Client Brain schema
const EMBEDDABLE_TABLES = [
  "client_brand_books",
  "client_icp_documents",
  "client_voc_library",
  "client_competitive_landscape",
  "client_historical_outputs",
] as const;

type EmbeddableTable = (typeof EMBEDDABLE_TABLES)[number];

// ─── Request types ───────────────────────────────────────────

interface GenerateOnlyRequest {
  mode: "generate";
  text: string;
}

interface GenerateAndStoreRequest {
  mode: "store";
  text: string;
  table: EmbeddableTable;
  row_id: string; // UUID of the row to update
  update_content_text?: boolean; // also set content_text = text (default true)
}

interface BatchGenerateRequest {
  mode: "batch";
  items: Array<{
    text: string;
    table?: EmbeddableTable;
    row_id?: string;
    update_content_text?: boolean;
  }>;
}

type RequestBody = GenerateOnlyRequest | GenerateAndStoreRequest | BatchGenerateRequest;

// ─── OpenAI API call ─────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 tokens (~32000 chars) to stay within model limits
  const truncated = text.slice(0, 32000);

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  // OpenAI supports batch embeddings natively
  const truncated = texts.map((t) => t.slice(0, 32000));

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  // Sort by index to maintain order
  const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

// ─── Store embedding in Supabase ─────────────────────────────

async function storeEmbedding(
  supabase: ReturnType<typeof createClient>,
  table: EmbeddableTable,
  rowId: string,
  embedding: number[],
  text: string,
  updateContentText: boolean,
): Promise<void> {
  if (!EMBEDDABLE_TABLES.includes(table)) {
    throw new Error(`Table '${table}' is not an embeddable Client Brain table`);
  }

  // Build update object
  const update: Record<string, unknown> = {
    embedding: JSON.stringify(embedding), // pgvector accepts JSON array
  };

  if (updateContentText) {
    update.content_text = text;
  }

  const { error } = await supabase
    .from(table)
    .update(update)
    .eq("id", rowId);

  if (error) {
    throw new Error(`Supabase update error on ${table}/${rowId}: ${error.message}`);
  }
}

// ─── Main handler ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate OpenAI key exists
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured. Set it in Supabase Dashboard → Edge Functions → Secrets.");
    }

    const body: RequestBody = await req.json();

    // Create Supabase client with service role for writes
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── Mode: generate only ──────────────────────────────
    if (body.mode === "generate") {
      if (!body.text || body.text.trim().length === 0) {
        throw new Error("'text' is required and cannot be empty");
      }

      const embedding = await getEmbedding(body.text);

      return new Response(
        JSON.stringify({
          success: true,
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          embedding,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ─── Mode: generate + store ───────────────────────────
    if (body.mode === "store") {
      if (!body.text || body.text.trim().length === 0) {
        throw new Error("'text' is required and cannot be empty");
      }
      if (!body.table || !body.row_id) {
        throw new Error("'table' and 'row_id' are required for store mode");
      }

      const embedding = await getEmbedding(body.text);
      const updateContentText = body.update_content_text !== false; // default true

      await storeEmbedding(supabase, body.table, body.row_id, embedding, body.text, updateContentText);

      return new Response(
        JSON.stringify({
          success: true,
          model: EMBEDDING_MODEL,
          table: body.table,
          row_id: body.row_id,
          dimensions: EMBEDDING_DIMENSIONS,
          stored: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ─── Mode: batch ──────────────────────────────────────
    if (body.mode === "batch") {
      if (!body.items || body.items.length === 0) {
        throw new Error("'items' array is required and cannot be empty");
      }
      if (body.items.length > 100) {
        throw new Error("Batch size cannot exceed 100 items");
      }

      // Extract all texts for batch embedding call
      const texts = body.items.map((item) => {
        if (!item.text || item.text.trim().length === 0) {
          throw new Error("Each item must have a non-empty 'text' field");
        }
        return item.text;
      });

      const embeddings = await getBatchEmbeddings(texts);

      // Store embeddings where table + row_id are provided
      const results = await Promise.allSettled(
        body.items.map(async (item, index) => {
          if (item.table && item.row_id) {
            const updateContentText = item.update_content_text !== false;
            await storeEmbedding(
              supabase,
              item.table,
              item.row_id,
              embeddings[index],
              item.text,
              updateContentText,
            );
            return { index, stored: true, table: item.table, row_id: item.row_id };
          }
          return { index, stored: false };
        }),
      );

      // Separate successes and failures
      const processed = results.map((r, i) => {
        if (r.status === "fulfilled") {
          return { ...r.value, success: true };
        }
        return { index: i, success: false, error: (r.reason as Error).message };
      });

      return new Response(
        JSON.stringify({
          success: true,
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          count: embeddings.length,
          results: processed,
          // Only include embeddings for items that weren't stored
          embeddings: body.items.map((item, i) =>
            !item.table || !item.row_id ? embeddings[i] : null
          ),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Invalid mode: '${(body as { mode: string }).mode}'. Use 'generate', 'store', or 'batch'.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("generate-embedding error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
