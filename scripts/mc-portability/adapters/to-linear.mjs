/**
 * Adapter: MC → Linear
 * Convierte tasks MC en Issues de Linear con priority mapping.
 *
 * Requiere: LINEAR_API_KEY en .env.local
 *           LINEAR_TEAM_ID (obtener de Linear Settings → Teams)
 */

export const META = {
  name: 'linear',
  description: 'Crea Issues en Linear (prioridad Eisenhower → Linear priority)',
  docs: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
}

const PRIORITY_MAP = {
  'important+urgent':     1, // Urgent
  'important+not-urgent': 2, // High
  'not-important+urgent': 3, // Medium
  'not-important+not-urgent': 4, // Low
}

const STATUS_MAP = {
  'todo':        'Todo',
  'in-progress': 'In Progress',
  'done':        'Done',
}

async function linearMutation(apiKey, query, variables) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  const data = await res.json()
  if (data.errors) throw new Error(`Linear GraphQL: ${JSON.stringify(data.errors)}`)
  return data.data
}

export async function run(snapshot, { dryRun = true, teamId } = {}) {
  const apiKey = process.env.LINEAR_API_KEY
  const resolvedTeamId = teamId || process.env.LINEAR_TEAM_ID
  if (!apiKey) throw new Error('Falta LINEAR_API_KEY en .env.local')
  if (!resolvedTeamId) throw new Error('Falta LINEAR_TEAM_ID — pasa --team-id o ponlo en .env.local')

  const tasks = snapshot.tasks || []
  const created = []
  const skipped = []

  for (const task of tasks) {
    const quadrant = `${task.importance}+${task.urgency}`
    const priority = PRIORITY_MAP[quadrant] || 3

    const issueInput = {
      teamId: resolvedTeamId,
      title: task.title,
      description: [
        task.description || '',
        task.notes ? `\n---\n${task.notes}` : '',
        `\n*Importado desde Mission Control — ${new Date(task.createdAt || Date.now()).toISOString().slice(0, 10)}*`,
      ].filter(Boolean).join('\n'),
      priority,
    }

    if (!dryRun) {
      try {
        const result = await linearMutation(apiKey, `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) { issue { id identifier title } }
          }
        `, { input: issueInput })
        created.push(result.issueCreate.issue)
      } catch (e) {
        skipped.push({ title: task.title, error: e.message })
      }
    } else {
      created.push({ title: task.title, priority, team: resolvedTeamId })
    }
  }

  return { tasks: created.length, skipped: skipped.length, created, skipped }
}
