import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { and, eq, or } from 'drizzle-orm';
import { db, albumsTable, tracksTable } from '@workspace/db';
import { requestLfsUpload, finalizeLfsUpload } from '../lib/githubLfs';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/octet-stream',
  'audio/aac',
  'audio/flac',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-aac',
  'audio/x-m4a',
  'audio/x-wav',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

function hasAuthenticatedSession(
  req: Request,
): req is Request & { isAuthenticated: () => boolean } {
  if (
    !('isAuthenticated' in req) ||
    typeof req.isAuthenticated !== 'function'
  ) {
    return false;
  }

  return req.isAuthenticated();
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!hasAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType, oid } = parsed.data;
      if (name.length > 255) { res.status(400).json({ error: 'Invalid file name' }); return; }
      const upload = await requestLfsUpload({ userId: req.user.id, name, size, contentType, oid });
      res.json(RequestUploadUrlResponse.parse({ uploadURL: upload.uploadURL, objectPath: upload.objectPath, uploadHeaders: upload.uploadHeaders }));
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

router.post('/storage/uploads/finalize', async (req: Request, res: Response) => {
  if (!hasAuthenticatedSession(req) || !req.user) return void res.status(401).json({ error: 'Unauthorized' });
  const { objectPath, oid, size } = req.body || {};
  if (typeof objectPath !== 'string' || typeof oid !== 'string' || !Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) return void res.status(400).json({ error: 'Invalid upload metadata' });
  try {
    const publicUrl = await finalizeLfsUpload(req.user.id, objectPath, oid, size);
    res.json({ objectPath: publicUrl });
  } catch (error) {
    req.log.warn({ err: error }, 'Could not finalize Git LFS upload');
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not finalize upload' });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    if (!hasAuthenticatedSession(req) || !req.user) {
      res.status(401).json({ error: 'Sign in to access private files' });
      return;
    }
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const [ownedTrack] = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(and(
        eq(tracksTable.ownerId, req.user.id),
        or(eq(tracksTable.audioPath, objectPath), eq(tracksTable.coverArtPath, objectPath)),
      ));
    const [ownedAlbum] = await db
      .select({ id: albumsTable.id })
      .from(albumsTable)
      .where(and(eq(albumsTable.ownerId, req.user.id), eq(albumsTable.coverArtPath, objectPath)));
    if (!ownedTrack && !ownedAlbum) {
      res.status(403).json({ error: 'You do not have access to this file' });
      return;
    }
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
