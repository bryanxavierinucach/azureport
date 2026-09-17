export type AzureConfig = { org: string; token: string };

function unwrap(value: string | undefined) {
  const trimmed = value?.trim() ?? '';
  const match = trimmed.match(/^(['"])(.*)\1$/);
  return match?.[2] ?? trimmed;
}

function organizationName(value: string | undefined) {
  const configured = unwrap(value).replace(/\/+$/, '');
  if (!configured) return '';

  try {
    if (/^https?:\/\//i.test(configured)) {
      const url = new URL(configured);
      const hostname = url.hostname.toLocaleLowerCase();
      if (hostname.endsWith('.visualstudio.com')) {
        return hostname.slice(0, -'.visualstudio.com'.length);
      }
      if (hostname === 'dev.azure.com' || hostname === 'vssps.dev.azure.com') {
        return url.pathname.split('/').filter(Boolean)[0] ?? '';
      }
    }
  } catch {
    return '';
  }

  return configured
    .replace(/^(?:vssps\.)?dev\.azure\.com\//i, '')
    .split('/')[0];
}

export function azureConfig(): AzureConfig | null {
  const org = organizationName(process.env.AZURE_DEVOPS_ORG);
  const token = unwrap(process.env.AZURE_DEVOPS_PAT);
  return org && token ? { org, token } : null;
}
