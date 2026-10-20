import crypto from 'node:crypto';
import { githubApi, rawRepositoryUrl } from './githubApi';
const OWNER = 'Joshb0513';
const REPO = 'Music-Library-Log';
const BRANCH = 'main';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const allowedTypes = new Set(['audio/aac','audio/flac','audio/mp3','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/x-aac','audio/x-m4a','audio/x-wav','image/gif','image/jpeg','image/jpg','image/png','image/webp','application/octet-stream']);

function repoToken() {
  const value = process.env.GITHUB_REPOSITORY_TOKEN;
  if (!value) throw new Error('GITHUB_REPOSITORY_TOKEN is missing.');
  return value;
}
function cleanName(name: string) { return name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(-120) || 'upload.bin'; }
function ownerSegment(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function lfsUrl() { return `https://github.com/${OWNER}/${REPO}.git/info/lfs/objects/batch`; }

export async function requestLfsUpload(input: { userId: string; name: string; size: number; contentType: string; oid: string }) {
  const type = input.contentType.split(';')[0].trim().toLowerCase();
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_FILE_SIZE) throw new Error('Files must be between 1 byte and 50 MiB.');
  if (!allowedTypes.has(type)) throw new Error('Unsupported audio or image file type.');
  if (!/^[a-f0-9]{64}$/.test(input.oid)) throw new Error('Invalid SHA-256 checksum.');
  const path = `uploads/${ownerSegment(input.userId)}/${crypto.randomUUID()}-${cleanName(input.name)}`;
  const authorization = Buffer.from(`x-access-token:${repoToken()}`).toString('base64');
  const response = await fetch(lfsUrl(), { method: 'POST', headers: { Authorization: `Basic ${authorization}`, Accept: 'application/vnd.git-lfs+json', 'Content-Type': 'application/vnd.git-lfs+json' }, body: JSON.stringify({ operation: 'upload', transfers: ['basic'], ref: { name: `refs/heads/${BRANCH}` }, objects: [{ oid: input.oid, size: input.size }] }) });
  if (!response.ok) throw new Error(`Git LFS upload authorization failed (${response.status}).`);
  const data = await response.json() as { objects?: Array<{ oid: string; size: number; error?: { code?: number; message?: string }; actions?: { upload?: { href: string; header?: Record<string,string> } } }> };
  const obj = data.objects?.[0];
  if (!obj || obj.oid !== input.oid || obj.size !== input.size || obj.error || !obj.actions?.upload?.href) throw new Error(obj?.error?.message || 'GitHub did not provide an upload URL. Ensure Git LFS is enabled for the repository.');
  const u = new URL(obj.actions.upload.href);
  if (u.protocol !== 'https:') throw new Error('Git LFS returned an unsafe upload URL.');
  return { uploadURL: u.href, uploadHeaders: obj.actions.upload.header || {}, objectPath: `lfs://${path}?oid=${input.oid}&size=${input.size}&type=${encodeURIComponent(type)}`, repoPath: path };
}

export async function finalizeLfsUpload(userId: string, objectPath: string, oid: string, size: number) {
  const match = /^lfs:\/\/([^?]+)\?oid=([a-f0-9]{64})&size=(\d+)&type=([^&]+)$/.exec(objectPath);
  if (!match || match[2] !== oid || Number(match[3]) !== size || !match[1].startsWith(`uploads/${ownerSegment(userId)}/`)) throw new Error('Upload does not belong to this account or its metadata is invalid.');
  // Confirm GitHub has the LFS object before committing a pointer into the public tree.
  const authorization = Buffer.from(`x-access-token:${repoToken()}`).toString('base64');
  const verification = await fetch(lfsUrl(), { method: 'POST', headers: { Authorization: `Basic ${authorization}`, Accept: 'application/vnd.git-lfs+json', 'Content-Type': 'application/vnd.git-lfs+json' }, body: JSON.stringify({ operation: 'download', transfers: ['basic'], ref: { name: `refs/heads/${BRANCH}` }, objects: [{ oid, size }] }) });
  if (!verification.ok) throw new Error(`Git LFS verification failed (${verification.status}).`);
  type LfsVerification = { objects?: Array<{ oid: string; size: number; error?: { message?: string }; actions?: { download?: { href: string } } }> };
  const verified = await verification.json() as LfsVerification;
  const verifiedObject = verified.objects?.[0];
  if (!verifiedObject || verifiedObject.oid !== oid || verifiedObject.size !== size || verifiedObject.error || !verifiedObject.actions?.download?.href) throw new Error(verifiedObject?.error?.message || 'GitHub could not verify that the uploaded audio exists.');
  const path = match[1];
  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;
  const response = await githubApi(`/repos/${OWNER}/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: JSON.stringify({ message: `Add public upload ${path.split('/').pop()}`, content: Buffer.from(pointer).toString('base64'), branch: BRANCH }) });
  if (!response.ok) throw new Error(`Could not commit Git LFS pointer (${response.status}).`);
  return rawRepositoryUrl(path);
}
