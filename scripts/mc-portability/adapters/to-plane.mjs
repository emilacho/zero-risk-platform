/**
 * Adapter: MC → Plane.so (Linear open-source, self-hostable)
 * Convierte tasks + projects MC en Issues de Plane.
 *
 * Requiere: PLANE_API_KEY, PLANE_BASE_URL, PLANE_WORKSPACE_SLUG en .env.local
 *           PLANE_PROJECT_ID (obtener de Plane Settings)
 * Docs: https://developers.plane.so/
 */

export const META = {
  name: 'plane',
  description: 'Crea Issues en Plane.so (open-source, self-hostable, gratis)',
  docs: 'https://developers.plane.so/api-reference',
}

const PRIORITY_MAP = {
  'important+urgent':     'urgent',
  'important+not-urgent': 'high',
  'not-important+urgent': 'medium',
  'not-important+not-urgent': 'low',
}

async function planePost(base, apiKey, path, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Plane ${path}: HTTP ${res.status} — ${await res.text()}`)
  return res.json()
}

export async function run(snapshot, { dryRun = true, projectId } = {}) {
  const apiKey = process.env.PLANE_API_KEY
  const baseUrl = (process.env.PLANE_BASE_URL || 'https://app.plane.so').replace(/\/$/, '')
  const workspaceSlug = process.env.PLANE_WORKSPACE_SLUG
  const resolvedProjectId = projectId || process.env.PLANE_PROJECT_ID

  if (!apiKey) throw new Error('Falta PLANE_API_KEY en .env.local')
  if (!workspaceSlug) throw new Error('Falta PLANE_WORKSPACE_SLUG en .env.local')
  if (!resolvedProjectId) throw new Error('Falta PLANE_PROJECT_ID — pasa --project-id o ponlo en .env.local')

  const tasks = snapshot.tasks || []
  const created = []

  for (const task of tasks) {
    const quadrant = `${task.importance || 'not-important'}+${task.urgency || 'not-urgent'}`
    const issueBody = {
      name: task.title,
      description_html: `<p>${task.description || ''}</p>${task.notes ? `<hr><p><small>${task.notes}</small></p>` : ''}`,
      priority: PRIORITY_MAP[quadrant] || 'medium',
      state: task.kanban === 'done' ? 'done' : task.kanban === 'in-progress' ? 'started' : 'backlog',
    }

    if (!dryRun) {
      try {
        const result = await planePost(baseUrl, apiKey, `/workspaces/${workspaceSlug}/projects/${resolvedProjectId}/issues/`, issueBody)
        created.push({ id: result.id, name: result.name })
      } catch (e) {
        console.warn(`   ⚠️  Skipped "${task.title}": ${e.message}`)
      }
    } else {
      created.push({ name: task.title, priority: issueBody.priority, state: issueBody.state })
    }
  }

  return { tasks: created.length, created }
}
