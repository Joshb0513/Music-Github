const API = 'https://api.github.com';

function token(): string {
  const value = process.env.GITHUB_REPOSITORY_TOKEN;
  if (!value) throw new Error('GITHUB_REPOSITORY_TOKEN is not configured on the server.');
  if (value.startsWith('VITE_')) throw new Error('GitHub credentials must not use a VITE_ variable.');
  return value;
}

export async function githubApi(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/repos/Joshb0513/Music-Library-Log/')) throw new Error('GitHub API path is outside the configured repository.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token()}`);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${API}${path}`, { ...init, headers });
}

export function rawRepositoryUrl(path: string): string {
  const safePath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `https://raw.githubusercontent.com/Joshb0513/Music-Library-Log/main/${safePath}`;
}
