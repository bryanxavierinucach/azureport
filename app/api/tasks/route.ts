import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '../../auth';
import { azureConfig } from '../azure-config';

function headers(token: string, contentType = 'application/json') {
  return { Authorization: `Basic ${btoa(`:${token}`)}`, 'Content-Type': contentType };
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  const azure = azureConfig();
  if (!azure) return NextResponse.json({ configured: false, tasks: [] });
  const assignedTo = request.nextUrl.searchParams.get('assignedTo')?.trim();
  if (!assignedTo || assignedTo.length > 320) {
    return NextResponse.json({ error: 'Selecciona el usuario cuyas tareas quieres consultar.' }, { status: 400 });
  }
  const assignedToWiql = assignedTo.replaceAll("'", "''");
  const base = `https://dev.azure.com/${encodeURIComponent(azure.org)}`;
  const wiql = { query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = '${assignedToWiql}' AND [System.State] NOT IN ('Closed', 'Cerrado', 'Removed') ORDER BY [System.ChangedDate] DESC` };
  const hierarchyWiql = { query: `SELECT [System.Id] FROM WorkItemLinks WHERE ([Source].[System.AssignedTo] = '${assignedToWiql}') AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward') MODE (Recursive)` };
  const fields = ['System.Id','System.Title','System.WorkItemType','System.State','System.AssignedTo','System.TeamProject','System.CreatedDate','System.ChangedDate','Microsoft.VSTS.Scheduling.Effort','Microsoft.VSTS.Scheduling.OriginalEstimate','Microsoft.VSTS.Scheduling.CompletedWork'];
  const projectsResponse = await fetch(`${base}/_apis/projects?$top=1000&stateFilter=wellFormed&api-version=7.1`, { headers: headers(azure.token), cache: 'no-store' });
  if (!projectsResponse.ok) return NextResponse.json({ error: `No se pudieron listar los proyectos de Azure DevOps (${projectsResponse.status}). Revisa el token y sus permisos.` }, { status: projectsResponse.status });
  const projects = ((await projectsResponse.json()) as { value?: { name: string }[] }).value ?? [];
  const results = await Promise.allSettled(projects.map(async ({ name }) => {
    const projectBase = `${base}/${encodeURIComponent(name)}`;
    const [query,hierarchyQuery] = await Promise.all([
      fetch(`${projectBase}/_apis/wit/wiql?api-version=7.1`, { method: 'POST', headers: headers(azure.token), body: JSON.stringify(wiql), cache: 'no-store' }),
      fetch(`${projectBase}/_apis/wit/wiql?api-version=7.1`, { method: 'POST', headers: headers(azure.token), body: JSON.stringify(hierarchyWiql), cache: 'no-store' }),
    ]);
    if (!query.ok) throw new Error(`WIQL ${name}: ${query.status}`);
    const directIds = ((await query.json()) as { workItems?: { id: number }[] }).workItems?.map(item => item.id) ?? [];
    const hierarchyIds = hierarchyQuery.ok ? ((await hierarchyQuery.json()) as { workItemRelations?: { source?: { id: number }; target?: { id: number } }[] }).workItemRelations?.flatMap(relation=>[relation.source?.id,relation.target?.id].filter((id):id is number=>typeof id==='number')) ?? [] : [];
    const ids = Array.from(new Set([...directIds,...hierarchyIds]));
    if (!ids.length) return [];
    const batches = Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) => ids.slice(index * 200, index * 200 + 200));
    const details = await Promise.all(batches.map(async batch => {
      const detail = await fetch(`${projectBase}/_apis/wit/workitems?ids=${batch.join(',')}&fields=${fields.join(',')}&api-version=7.1`, { headers: headers(azure.token), cache: 'no-store' });
      if (!detail.ok) throw new Error(`Detalles ${name}: ${detail.status}`);
      return ((await detail.json()) as { value: { id: number; fields: Record<string, unknown> }[] }).value;
    }));
    return details.flat();
  }));
  const itemsWithDuplicates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const items = Array.from(new Map(itemsWithDuplicates.map(item => [item.id, item])).values());
  const failedProjects = results.filter(result => result.status === 'rejected').length;
  return NextResponse.json({ configured: true, selectedUser: assignedTo, projectCount: projects.length, failedProjects, tasks: items.map(item => ({
    id: item.id,
    type: item.fields['System.WorkItemType'] ?? 'Task',
    title: item.fields['System.Title'] ?? `Tarea ${item.id}`,
    project: item.fields['System.TeamProject'] ?? 'Sin proyecto',
    state: item.fields['System.State'] ?? 'New',
    assignedTo: (item.fields['System.AssignedTo'] as { displayName?: string } | undefined)?.displayName ?? String(item.fields['System.AssignedTo'] ?? ''),
    createdDate: String(item.fields['System.CreatedDate'] ?? ''),
    changedDate: String(item.fields['System.ChangedDate'] ?? ''),
    effortHours: Number(item.fields['Microsoft.VSTS.Scheduling.Effort'] ?? 0),
    originalEstimate: Number(item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? 0),
    completedHours: Number(item.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0),
    elapsed: 0, today: 0,
  })) });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  const azure = azureConfig();
  if (!azure) return NextResponse.json({ error: 'Configura Azure DevOps antes de editar tareas.' }, { status: 503 });
  const body = await request.json() as { id?: number; project?: string; state?: string; assignedTo?: string; originalEstimate?: number; completedHours?: number };
  const hasOriginalEstimate = typeof body.originalEstimate === 'number' && Number.isFinite(body.originalEstimate);
  const hasCompletedHours = typeof body.completedHours === 'number' && Number.isFinite(body.completedHours);
  if (!body.id || (!body.state && !body.assignedTo && !hasOriginalEstimate && !hasCompletedHours)) return NextResponse.json({ error: 'Cambio inválido.' }, { status: 400 });
  const patch = [
    body.state && { op: 'add', path: '/fields/System.State', value: body.state },
    body.assignedTo && { op: 'add', path: '/fields/System.AssignedTo', value: body.assignedTo },
    hasOriginalEstimate && { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.OriginalEstimate', value: body.originalEstimate },
    hasCompletedHours && { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: body.completedHours },
  ].filter(Boolean);
  if (!body.project) return NextResponse.json({ error: 'No se identificó el proyecto de la tarea.' }, { status: 400 });
  const url = `https://dev.azure.com/${encodeURIComponent(azure.org)}/${encodeURIComponent(body.project)}/_apis/wit/workitems/${body.id}?api-version=7.1`;
  const response = await fetch(url, { method: 'PATCH', headers: headers(azure.token, 'application/json-patch+json'), body: JSON.stringify(patch) });
  if (!response.ok) return NextResponse.json({ error: 'Azure DevOps no aceptó la actualización del elemento.' }, { status: response.status });
  return NextResponse.json({ ok: true });
}
