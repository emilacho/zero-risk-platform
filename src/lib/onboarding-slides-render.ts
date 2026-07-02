/**
 * Onboarding executive report · Google Slides + Drive render.
 *
 * Takes the 6-slide ReportModel (onboarding-report.ts) and renders a real
 * Google Slides presentation into `Cuentas/[client]/` in Drive, using the
 * service-account access token (google-sa-auth.ts). Uses the Drive v3 +
 * Slides v1 REST APIs directly (fetch) · no googleapis SDK · fully testable
 * by injecting fetchImpl.
 *
 * Postmortem alignment: HTTP is explicit + controllable (not n8n Code fetch) ·
 * the n8n Promote node just POSTs to the endpoint that calls this.
 */
import type { ReportModel, Slide } from './onboarding-report'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const SLIDES = 'https://slides.googleapis.com/v1'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface RenderResult {
  readonly presentationId: string
  readonly url: string
  readonly folderId: string
}

// ── Pure · build the Slides batchUpdate requests for the 6-slide model ────

/** Deterministic per-slide object IDs (title + body textboxes). */
function slideBody(slide: Slide): string {
  return Array.isArray(slide.body) ? slide.body.join('\n') : String(slide.body)
}

/**
 * Build the batchUpdate requests: one BLANK slide per model slide, each with
 * a title + body TEXT_BOX (explicit objectIds) + inserted text. Pure · no I/O.
 */
export function buildSlidesBatchRequests(model: ReportModel): object[] {
  const reqs: object[] = []
  model.slides.forEach((slide, i) => {
    const sid = `slide_${slide.n}`
    const titleId = `s${slide.n}_title`
    const bodyId = `s${slide.n}_body`
    reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: 'BLANK' } } })
    // Title box
    reqs.push({
      createShape: {
        objectId: titleId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: 8000000, unit: 'EMU' }, height: { magnitude: 1000000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 500000, translateY: 400000, unit: 'EMU' },
        },
      },
    })
    const titleText = i === 0 && slide.subtitle ? `${slide.title}\n${slide.subtitle}` : slide.title
    reqs.push({ insertText: { objectId: titleId, text: titleText, insertionIndex: 0 } })
    // Body box
    reqs.push({
      createShape: {
        objectId: bodyId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: 8000000, unit: 'EMU' }, height: { magnitude: 3500000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 500000, translateY: 1600000, unit: 'EMU' },
        },
      },
    })
    reqs.push({ insertText: { objectId: bodyId, text: slideBody(slide), insertionIndex: 0 } })
  })
  return reqs
}

// ── Orchestration · Drive + Slides REST ───────────────────────────────────

interface Deps {
  accessToken: string
  cuentasFolderId: string
  fetchImpl?: typeof fetch
}

async function gfetch(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      `google api ${res.status} ${url}: ${JSON.stringify(json).slice(0, 200)}`,
    )
  return json
}

/** Find an existing subfolder by name under Cuentas, or create it. */
export async function ensureClientFolder(
  clientName: string,
  deps: Deps,
): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const safeName = clientName.replace(/'/g, "\\'")
  const q = encodeURIComponent(
    `name = '${safeName}' and mimeType = '${FOLDER_MIME}' and '${deps.cuentasFolderId}' in parents and trashed = false`,
  )
  const found = (await gfetch(
    fetchImpl,
    `${DRIVE}/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    deps.accessToken,
  )) as { files?: Array<{ id: string }> }
  if (found.files && found.files.length > 0) return found.files[0].id

  const created = (await gfetch(
    fetchImpl,
    `${DRIVE}/files?fields=id&supportsAllDrives=true`,
    deps.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        name: clientName,
        mimeType: FOLDER_MIME,
        parents: [deps.cuentasFolderId],
      }),
    },
  )) as { id: string }
  return created.id
}

/**
 * Full render: ensure folder → create presentation → move into folder →
 * batchUpdate the 6 slides. Returns the presentation URL.
 */
export async function renderOnboardingReport(
  model: ReportModel,
  deps: Deps,
): Promise<RenderResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const folderId = await ensureClientFolder(model.client_name, deps)

  const title = `Reporte Onboarding ${model.client_name} ${model.report_date}`
  const pres = (await gfetch(fetchImpl, `${SLIDES}/presentations`, deps.accessToken, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })) as { presentationId: string }
  const presentationId = pres.presentationId

  // Move the presentation into the client folder (Drive was created in root).
  await gfetch(
    fetchImpl,
    `${DRIVE}/files/${presentationId}?addParents=${folderId}&removeParents=root&fields=id,parents&supportsAllDrives=true`,
    deps.accessToken,
    { method: 'PATCH', body: JSON.stringify({}) },
  )

  await gfetch(
    fetchImpl,
    `${SLIDES}/presentations/${presentationId}:batchUpdate`,
    deps.accessToken,
    { method: 'POST', body: JSON.stringify({ requests: buildSlidesBatchRequests(model) }) },
  )

  return {
    presentationId,
    folderId,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  }
}
