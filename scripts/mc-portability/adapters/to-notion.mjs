/**
 * Adapter: MC → Notion
 * Crea pages en una Notion Database para tasks + inbox.
 *
 * Requiere: NOTION_API_KEY, NOTION_TASKS_DB_ID en .env.local
 *           (Opcional) NOTION_INBOX_DB_ID para importar el inbox también
 * Docs: https://developers.notion.com/
 */

export const META = {
  name: 'notion',
  description: 'Crea páginas en Notion Database (Eisenhower properties incluidas)',
  docs: 'https://developers.notion.com/reference/create-a-page',
}

async function notionPost(apiKey, path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Notion ${path}: HTTP ${res.status} — ${await res.text()}`)
  return res.json()
}

function quadrantLabel(importance, urgency) {
  if (importance === 'important' && urgency === 'urgent') return 'DO'
  if (importance === 'important') return 'SCHEDULE'
  if (urgency === 'urgent') return 'DELEGATE'
  return 'ELIMINATE'
}

export async function run(snapshot, { dryRun = true } = {}) {
  const apiKey = process.env.NOTION_API_KEY
  const tasksDbId = process.env.NOTION_TASKS_DB_ID
  const inboxDbId = process.env.NOTION_INBOX_DB_ID

  if (!apiKey) throw new Error('Falta NOTION_API_KEY en .env.local')
  if (!tasksDbId) throw new Error('Falta NOTION_TASKS_DB_ID en .env.local')

  const results = { tasks: 0, inbox: 0 }

  // Import tasks
  for (const task of (snapshot.tasks || [])) {
    const pageBody = {
      parent: { database_id: tasksDbId },
      properties: {
        Name: { title: [{ text: { content: task.title || 'Sin título' } }] },
        Status: { select: { name: task.kanban === 'done' ? 'Done' : task.kanban === 'in-progress' ? 'In Progress' : 'Todo' } },
        Quadrant: { select: { name: quadrantLabel(task.importance, task.urgency) } },
        Importance: { select: { name: task.importance === 'important' ? 'Important' : 'Not Important' } },
        Urgency: { select: { name: task.urgency === 'urgent' ? 'Urgent' : 'Not Urgent' } },
        ...(task.assigned_to ? { 'Assigned To': { rich_text: [{ text: { content: task.assigned_to } }] } } : {}),
        Tags: { multi_select: (task.tags || []).map(t => ({ name: String(t) })) },
      },
      children: task.description || task.notes ? [{
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: `${task.description || ''}${task.notes ? `\n\n${task.notes}` : ''}` } }] },
      }] : [],
    }

    if (!dryRun) {
      try { await notionPost(apiKey, '/pages', pageBody); results.tasks++ }
      catch (e) { console.warn(`   ⚠️  Skipped "${task.title}": ${e.message}`) }
    } else {
      results.tasks++
    }
  }

  // Import inbox (if DB provided)
  if (inboxDbId) {
    for (const msg of (snapshot.inbox || [])) {
      const pageBody = {
        parent: { database_id: inboxDbId },
        properties: {
          Name: { title: [{ text: { content: msg.subject || '(sin asunto)' } }] },
          Type: { select: { name: msg.type || 'report' } },
          From: { rich_text: [{ text: { content: msg.from || '' } }] },
          Status: { select: { name: msg.status === 'read' ? 'Read' : 'Unread' } },
        },
        children: msg.body ? [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: msg.body.slice(0, 2000) } }] },
        }] : [],
      }
      if (!dryRun) {
        try { await notionPost(apiKey, '/pages', pageBody); results.inbox++ }
        catch (e) { console.warn(`   ⚠️  Skipped inbox "${msg.subject}": ${e.message}`) }
      } else {
        results.inbox++
      }
    }
  }

  return results
}
