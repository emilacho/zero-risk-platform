/**
 * Adapter: MC → GitHub Projects (v2)
 * Crea draft issues en un GitHub Project usando GraphQL API.
 *
 * Requiere: GITHUB_TOKEN (con scope project:write), GITHUB_PROJECT_ID en .env.local
 *           GITHUB_PROJECT_ID: obtener de GitHub Projects → Settings → ver URL
 * Docs: https://docs.github.com/en/graphql/reference/mutations#addprojectv2draftissue
 */

export const META = {
  name: 'github-projects',
  description: 'Crea Draft Issues en GitHub Projects v2 (ideal si el repo ya está en GitHub)',
  docs: 'https://docs.github.com/en/issues/planning-and-tracking-with-projects',
}

async function ghGraphQL(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const data = await res.json()
  if (data.errors) throw new Error(`GitHub GraphQL: ${data.errors.map(e => e.message).join('; ')}`)
  return data.data
}

export async function run(snapshot, { dryRun = true } = {}) {
  const token = process.env.GITHUB_TOKEN
  const projectId = process.env.GITHUB_PROJECT_ID
  if (!token) throw new Error('Falta GITHUB_TOKEN en .env.local (scope: project:write)')
  if (!projectId) throw new Error('Falta GITHUB_PROJECT_ID en .env.local')

  const tasks = snapshot.tasks || []
  const created = []

  for (const task of tasks) {
    const quadrant = task.importance === 'important' && task.urgency === 'urgent' ? 'DO'
      : task.importance === 'important' ? 'SCHEDULE'
      : task.urgency === 'urgent' ? 'DELEGATE' : 'ELIMINATE'

    const title = `[${quadrant}] ${task.title}`
    const body = [
      task.description || '',
      task.notes ? `---\n${task.notes}` : '',
      `*Importado desde Mission Control*`,
    ].filter(Boolean).join('\n\n')

    if (!dryRun) {
      try {
        const result = await ghGraphQL(token, `
          mutation AddDraftIssue($projectId: ID!, $title: String!, $body: String) {
            addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
              projectItem { id }
            }
          }
        `, { projectId, title, body })
        created.push({ id: result.addProjectV2DraftIssue.projectItem.id, title })
      } catch (e) {
        console.warn(`   ⚠️  Skipped "${task.title}": ${e.message}`)
      }
    } else {
      created.push({ title, quadrant })
    }
  }

  return { tasks: created.length, created }
}
