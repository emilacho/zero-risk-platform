/**
 * Adapter: MC → Asana
 * Crea Tasks en Asana project. Mapea Eisenhower → custom fields si existen.
 *
 * Requiere: ASANA_ACCESS_TOKEN, ASANA_PROJECT_GID en .env.local
 * Docs: https://developers.asana.com/docs
 */

export const META = {
  name: 'asana',
  description: 'Crea Tasks en Asana con tags de Eisenhower como notas',
  docs: 'https://developers.asana.com/reference/createtask',
}

async function asanaPost(token, path, body) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data: body }),
  })
  if (!res.ok) throw new Error(`Asana ${path}: HTTP ${res.status} — ${await res.text()}`)
  return (await res.json()).data
}

function quadrantNote(importance, urgency) {
  if (importance === 'important' && urgency === 'urgent') return '[DO] Importante + Urgente'
  if (importance === 'important') return '[SCHEDULE] Importante + No Urgente'
  if (urgency === 'urgent') return '[DELEGATE] No Importante + Urgente'
  return '[ELIMINATE] No Importante + No Urgente'
}

export async function run(snapshot, { dryRun = true } = {}) {
  const token = process.env.ASANA_ACCESS_TOKEN
  const projectGid = process.env.ASANA_PROJECT_GID
  if (!token) throw new Error('Falta ASANA_ACCESS_TOKEN en .env.local')
  if (!projectGid) throw new Error('Falta ASANA_PROJECT_GID en .env.local')

  const created = []

  for (const task of (snapshot.tasks || [])) {
    const taskBody = {
      name: task.title,
      notes: [
        quadrantNote(task.importance, task.urgency),
        task.description || '',
        task.notes ? `\n${task.notes}` : '',
        `\nImportado desde Mission Control — ${new Date(task.createdAt || Date.now()).toISOString().slice(0, 10)}`,
      ].filter(Boolean).join('\n'),
      projects: [projectGid],
      completed: task.kanban === 'done',
      assignee: null, // Asana necesita GID de usuario — no mapeamos assigned_to
    }

    if (!dryRun) {
      try {
        const result = await asanaPost(token, '/tasks', taskBody)
        created.push({ gid: result.gid, name: result.name })
      } catch (e) {
        console.warn(`   ⚠️  Skipped "${task.title}": ${e.message}`)
      }
    } else {
      created.push({ name: task.title, completed: taskBody.completed })
    }
  }

  return { tasks: created.length, created }
}
