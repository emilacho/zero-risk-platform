// Shared CORS headers for all Edge Functions
// Allows calls from the Next.js app, Mission Control dashboard, and n8n
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
