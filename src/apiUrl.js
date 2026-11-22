export function getApiUrl(hostname, configuredApiUrl = '') {
  if (hostname.endsWith('.airoapp.ai')) return '/api';
  return configuredApiUrl || '/api';
}
