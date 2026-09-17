import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '../../auth';

// El tiempo definitivo se almacena en Azure DevOps (Completed Work) al pausar
// o detener. Así la aplicación no depende de Cloudflare D1 en Netlify.
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  const { workItemId, action } = await request.json() as {
    workItemId?: number;
    action?: 'play' | 'pause' | 'stop';
  };

  if (!workItemId || !action) {
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, workItemId, action });
}

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  return NextResponse.json({ entries: [] });
}
