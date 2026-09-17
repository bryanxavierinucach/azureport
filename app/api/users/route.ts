import { NextResponse } from 'next/server';

type GraphUser = {
  descriptor?: string;
  displayName?: string;
  principalName?: string;
  mailAddress?: string;
  isDeletedInOrigin?: boolean;
};

function config() {
  const org = process.env.AZURE_DEVOPS_ORG;
  const token = process.env.AZURE_DEVOPS_PAT;
  return org && token ? { org, token } : null;
}

function headers(token: string) {
  return { Authorization: `Basic ${btoa(`:${token}`)}` };
}

export async function GET() {
  const azure = config();
  if (!azure) return NextResponse.json({ configured: false, users: [] });

  const users: GraphUser[] = [];
  let continuationToken = '';
  do {
    const query = new URLSearchParams({ 'api-version': '7.1-preview.1' });
    if (continuationToken) query.set('continuationToken', continuationToken);
    const response = await fetch(
      `https://vssps.dev.azure.com/${encodeURIComponent(azure.org)}/_apis/graph/users?${query}`,
      { headers: headers(azure.token), cache: 'no-store' },
    );
    if (!response.ok) {
      const body = await response.text();
      let azureMessage = '';
      try {
        azureMessage = (JSON.parse(body) as { message?: string }).message?.trim() ?? '';
      } catch {
        // Azure can return an empty or non-JSON response.
      }
      return NextResponse.json(
        {
          error: azureMessage
            ? `No se pudieron listar los usuarios (${response.status}): ${azureMessage}`
            : `No se pudieron listar los usuarios (${response.status}). Revisa la organización y el PAT configurados.`,
        },
        { status: response.status },
      );
    }
    const page = await response.json() as { value?: GraphUser[] };
    users.push(...(page.value ?? []));
    continuationToken = response.headers.get('x-ms-continuationtoken') ?? '';
  } while (continuationToken && users.length < 10000);

  const normalized = users
    .filter(user => !user.isDeletedInOrigin && Boolean(user.mailAddress || user.principalName))
    .map(user => ({
      id: user.descriptor ?? user.mailAddress ?? user.principalName ?? '',
      displayName: user.displayName ?? user.mailAddress ?? user.principalName ?? 'Usuario',
      identity: user.mailAddress ?? user.principalName ?? '',
    }));
  const unique = Array.from(new Map(normalized.map(user => [user.identity.toLocaleLowerCase(), user])).values())
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ configured: true, users: unique });
}
