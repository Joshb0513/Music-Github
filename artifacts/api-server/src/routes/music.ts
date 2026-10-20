import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAlbumBody,
  CreateTrackBody,
  GetAlbumParams,
  GetMusicDashboardResponse,
  ListTracksQueryParams,
  UpdateAlbumBody,
  UpdateAlbumParams,
  UpdateTrackBody,
  UpdateTrackParams,
} from "@workspace/api-zod";
import { db, albumsTable, tracksTable } from "@workspace/db";
import { isUserUploadPath, ObjectStorageService } from "../lib/objectStorage";
import { githubApi } from "../lib/githubApi";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const REPO = "Joshb0513/Music-Library-Log";
const BRANCH = "main";
const MAX_PUBLISH_BYTES = 50 * 1024 * 1024;
const AUDIO_TYPES = new Set([
  "application/octet-stream",
  "audio/aac",
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-aac",
  "audio/x-m4a",
  "audio/x-wav",
]);
const IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

async function isValidOwnedAsset(
  path: string,
  ownerId: string,
  type: "audio" | "image",
): Promise<boolean> {
  const publicPrefix = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/uploads/${ownerId.replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
  if (path.startsWith(publicPrefix)) {
    const extension = path.split("?")[0].split(".").pop()?.toLowerCase() || "";
    return type === "audio" ? ["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm", "bin"].includes(extension) : ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
  }
  if (!isUserUploadPath(path, ownerId)) return false;
  try {
    const file = await objectStorage.getObjectEntityFile(path);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    const contentType = String(metadata.contentType || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const allowedTypes = type === "audio" ? AUDIO_TYPES : IMAGE_TYPES;
    return size > 0 && size <= MAX_PUBLISH_BYTES && allowedTypes.has(contentType);
  } catch {
    return false;
  }
}

function userId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Sign in to manage your music" });
    return null;
  }
  return req.user.id;
}

function visibleToUser(_user: string | null, _table: typeof tracksTable | typeof albumsTable) {
  // This library intentionally uses a public repository and the owner selected
  // public draft access: uploaded draft metadata and audio are public by design.
  return sql`true`;
}

async function listTrackRows(user: string | null, extra?: SQL) {
  const conditions: SQL[] = [visibleToUser(user, tracksTable)];
  if (extra) conditions.push(extra);
  const rows = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      artist: tracksTable.artist,
      year: tracksTable.year,
      albumId: tracksTable.albumId,
      albumTitle: albumsTable.title,
      albumPublished: albumsTable.isPublished,
      albumCoverArtPath: albumsTable.coverArtPath,
      albumPublicCoverUrl: albumsTable.publicCoverUrl,
      coverArtPath: tracksTable.coverArtPath,
      publicCoverUrl: tracksTable.publicCoverUrl,
      audioPath: tracksTable.audioPath,
      publicAudioUrl: tracksTable.publicAudioUrl,
      isPublished: tracksTable.isPublished,
      ownerId: tracksTable.ownerId,
      durationSeconds: tracksTable.durationSeconds,
      createdAt: tracksTable.createdAt,
    })
    .from(tracksTable)
    .leftJoin(albumsTable, eq(tracksTable.albumId, albumsTable.id))
    .where(and(...conditions))
    .orderBy(desc(tracksTable.createdAt));

  return rows.map((row) => {
    const canManage = !!user && row.ownerId === user;
    const albumIsVisible = !!row.albumId && (row.albumPublished || canManage);
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      year: row.year,
      albumId: albumIsVisible ? row.albumId : null,
      albumTitle: albumIsVisible ? row.albumTitle : null,
      coverArtPath: row.isPublished
        ? row.publicCoverUrl || row.albumPublicCoverUrl || null
        : row.coverArtPath || row.albumCoverArtPath || null,
      audioPath: row.isPublished ? row.publicAudioUrl || "" : row.audioPath,
      durationSeconds: row.durationSeconds,
      isPublished: row.isPublished,
      canManage,
      createdAt: row.createdAt,
    };
  });
}

async function listAlbumRows(user: string | null) {
  const [albums, tracks] = await Promise.all([
    db.select().from(albumsTable).where(visibleToUser(user, albumsTable)).orderBy(desc(albumsTable.createdAt)),
    listTrackRows(user),
  ]);
  return albums.map((album) => ({
    id: album.id,
    title: album.title,
    artist: album.artist,
    year: album.year,
    coverArtPath: album.isPublished ? album.publicCoverUrl : album.coverArtPath,
    trackCount: tracks.filter((track) => track.albumId === album.id).length,
    isPublished: album.isPublished,
    canManage: !!user && album.ownerId === user,
    createdAt: album.createdAt,
  }));
}

async function getPrivateObject(path: string) {
  if (!path.startsWith("/objects/")) throw new Error("Invalid private object path");
  const file = await objectStorage.getObjectEntityFile(path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  if (size > MAX_PUBLISH_BYTES) {
    throw new Error("GitHub publishing supports files up to 50 MiB. This file is larger.");
  }
  const [buffer] = await file.download();
  if (buffer.byteLength > MAX_PUBLISH_BYTES) {
    throw new Error("GitHub publishing supports files up to 50 MiB. This file is larger.");
  }
  return { buffer, contentType: String(metadata.contentType || "application/octet-stream") };
}

function extensionFor(contentType: string, fallback: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const known: Record<string, string> = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
    "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac",
    "audio/mp4": "m4a", "audio/aac": "aac", "audio/webm": "webm",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif",
  };
  return known[type] || fallback;
}

function githubContentsPath(path: string) {
  return `/repos/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function publishFile(
  objectPath: string,
  repoPath: string,
  message: string,
  asset?: { buffer: Buffer; contentType: string },
) {
  const { buffer } = asset || await getPrivateObject(objectPath);
  const path = githubContentsPath(repoPath);
  const existing = await githubApi(`${path}?ref=${BRANCH}`);
  let sha: string | undefined;
  if (existing.ok) {
    const body = (await existing.json()) as { sha?: string };
    sha = body.sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub could not check the public file (${existing.status})`);
  }
  const response = await githubApi(path, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: buffer.toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`GitHub rejected the public file (${response.status}): ${detail}`);
  }
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${repoPath}`;
}

async function publishedTrackAssets(
  track: typeof tracksTable.$inferSelect,
  albumCoverPath?: string | null,
) {
  const audioUrl = track.audioPath.startsWith(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/uploads/`)
    ? track.audioPath
    : await (async () => { const asset = await getPrivateObject(track.audioPath); return publishFile(track.audioPath, `tracks/${track.id}/audio.${extensionFor(asset.contentType, "bin")}`, `Publish track ${track.id} audio`, asset); })();
  const artworkPath = track.coverArtPath || albumCoverPath;
  let coverUrl: string | null = null;
  if (artworkPath) {
    coverUrl = artworkPath.startsWith(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/uploads/`)
      ? artworkPath
      : await (async () => { const asset = await getPrivateObject(artworkPath); return publishFile(artworkPath, `tracks/${track.id}/cover.${extensionFor(asset.contentType, "img")}`, `Publish track ${track.id} cover art`, asset); })();
  }
  return { audioUrl, coverUrl };
}

function safeDownloadName(title: string, extension: string) {
  return `${title.replace(/[\r\n"\\/]/g, "_").trim() || "track"}.${extension}`;
}

router.get("/music/dashboard", async (req: Request, res: Response) => {
  try {
    const tracks = await listTrackRows(req.isAuthenticated() ? req.user?.id || null : null);
    const albums = await listAlbumRows(req.isAuthenticated() ? req.user?.id || null : null);
    res.json(GetMusicDashboardResponse.parse({
      trackCount: tracks.length,
      albumCount: albums.length,
      totalMinutes: Math.ceil(tracks.reduce((sum, track) => sum + (track.durationSeconds || 0), 0) / 60),
      recentlyAdded: tracks.slice(0, 5),
    }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load music dashboard");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/music/albums", async (req: Request, res: Response) => {
  try {
    res.json(await listAlbumRows(req.isAuthenticated() ? req.user?.id || null : null));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list albums");
    res.status(500).json({ error: "Failed to list albums" });
  }
});

router.post("/music/albums", async (req: Request, res: Response) => {
  const ownerId = userId(req, res);
  if (!ownerId) return;
  const parsed = CreateAlbumBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid album details" });
  if (
    parsed.data.coverArtPath &&
    !(await isValidOwnedAsset(parsed.data.coverArtPath, ownerId, "image"))
  ) {
    return void res.status(400).json({ error: "Choose an image you uploaded to your account" });
  }
  try {
    const [album] = await db.insert(albumsTable).values({ ...parsed.data, ownerId }).returning();
    res.status(201).json({ ...album, trackCount: 0, canManage: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create album");
    res.status(500).json({ error: "Failed to create album" });
  }
});

router.get("/music/albums/:albumId", async (req: Request, res: Response) => {
  const parsed = GetAlbumParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid album id" });
  try {
    const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, parsed.data.albumId));
    const owner = req.isAuthenticated() ? req.user?.id || null : null;
    if (!album || (!album.isPublished && album.ownerId !== owner)) {
      return void res.status(404).json({ error: "Album not found" });
    }
    const tracks = await listTrackRows(owner, eq(tracksTable.albumId, album.id));
    res.json({
      id: album.id, title: album.title, artist: album.artist, year: album.year,
      coverArtPath: album.isPublished ? album.publicCoverUrl : album.coverArtPath,
      trackCount: tracks.length, isPublished: album.isPublished,
      canManage: album.ownerId === owner, createdAt: album.createdAt, tracks,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load album");
    res.status(500).json({ error: "Failed to load album" });
  }
});

router.patch("/music/albums/:albumId", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const params = UpdateAlbumParams.safeParse(req.params);
  const body = UpdateAlbumBody.safeParse(req.body);
  if (!params.success || !body.success) return void res.status(400).json({ error: "Invalid album details" });
  try {
    const [existing] = await db.select().from(albumsTable).where(and(eq(albumsTable.id, params.data.albumId), eq(albumsTable.ownerId, owner)));
    if (!existing) return void res.status(404).json({ error: "Album not found" });
    const coverChanged = body.data.coverArtPath !== undefined && body.data.coverArtPath !== existing.coverArtPath;
    if (
      coverChanged &&
      body.data.coverArtPath &&
      !(await isValidOwnedAsset(body.data.coverArtPath, owner, "image"))
    ) {
      return void res.status(400).json({ error: "Choose an image you uploaded to your account" });
    }
    const [album] = await db.update(albumsTable).set({
      ...body.data,
      ...(coverChanged ? { isPublished: false, publicCoverUrl: null } : {}),
    }).where(eq(albumsTable.id, existing.id)).returning();
    const tracks = await listTrackRows(owner, eq(tracksTable.albumId, album.id));
    res.json({
      id: album.id, title: album.title, artist: album.artist, year: album.year,
      coverArtPath: album.isPublished ? album.publicCoverUrl : album.coverArtPath,
      trackCount: tracks.length, isPublished: album.isPublished, canManage: true,
      createdAt: album.createdAt,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to update album");
    res.status(500).json({ error: "Failed to update album" });
  }
});

router.delete("/music/albums/:albumId", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const parsed = GetAlbumParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid album id" });
  try {
    const deleted = await db.delete(albumsTable).where(and(eq(albumsTable.id, parsed.data.albumId), eq(albumsTable.ownerId, owner))).returning({ id: albumsTable.id });
    if (!deleted.length) return void res.status(404).json({ error: "Album not found" });
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete album");
    res.status(500).json({ error: "Failed to delete album" });
  }
});

router.post("/music/albums/:albumId/publish", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const parsed = GetAlbumParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid album id" });
  try {
    const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.id, parsed.data.albumId), eq(albumsTable.ownerId, owner)));
    if (!album) return void res.status(404).json({ error: "Album not found" });
    const ownedTracks = await db.select().from(tracksTable).where(and(eq(tracksTable.albumId, album.id), eq(tracksTable.ownerId, owner)));
    const coverUrl = album.coverArtPath
      ? await publishFile(album.coverArtPath, `albums/${album.id}/cover.${extensionFor((await getPrivateObject(album.coverArtPath)).contentType, "img")}`, `Publish album ${album.id} cover art`)
      : null;
    const uploaded: Array<{ id: number; audioUrl: string; coverUrl: string | null }> = [];
    for (const track of ownedTracks) {
      const assets = await publishedTrackAssets(track, album.coverArtPath);
      uploaded.push({ id: track.id, audioUrl: assets.audioUrl, coverUrl: track.coverArtPath ? assets.coverUrl : coverUrl });
    }
    await db.transaction(async (tx) => {
      for (const track of uploaded) {
        await tx.update(tracksTable).set({ isPublished: true, publicAudioUrl: track.audioUrl, publicCoverUrl: track.coverUrl }).where(eq(tracksTable.id, track.id));
      }
      await tx.update(albumsTable).set({ isPublished: true, publicCoverUrl: coverUrl }).where(eq(albumsTable.id, album.id));
    });
    res.json({
      id: album.id, title: album.title, artist: album.artist, year: album.year,
      coverArtPath: coverUrl, trackCount: ownedTracks.length, isPublished: true,
      canManage: true, createdAt: album.createdAt,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to publish album");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not publish to GitHub" });
  }
});

router.get("/music/tracks", async (req: Request, res: Response) => {
  const parsed = ListTracksQueryParams.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid track filters" });
  try {
    const filters: SQL[] = [];
    if (parsed.data.albumId !== undefined) filters.push(eq(tracksTable.albumId, parsed.data.albumId));
    if (parsed.data.search) {
      filters.push(or(
        ilike(tracksTable.title, `%${parsed.data.search}%`),
        ilike(tracksTable.artist, `%${parsed.data.search}%`),
        and(
          ilike(albumsTable.title, `%${parsed.data.search}%`),
          visibleToUser(req.isAuthenticated() ? req.user?.id || null : null, albumsTable),
        )!,
      )!);
    }
    res.json(await listTrackRows(req.isAuthenticated() ? req.user?.id || null : null, filters.length ? and(...filters) : undefined));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list tracks");
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

router.post("/music/tracks", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const parsed = CreateTrackBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid track details" });
  const validAudio = await isValidOwnedAsset(parsed.data.audioPath, owner, "audio");
  const validCover = !parsed.data.coverArtPath ||
    await isValidOwnedAsset(parsed.data.coverArtPath, owner, "image");
  if (!validAudio || !validCover) {
    return void res.status(400).json({ error: "Choose files you uploaded to your account" });
  }
  try {
    if (parsed.data.albumId !== null && parsed.data.albumId !== undefined) {
      const [album] = await db.select({ id: albumsTable.id }).from(albumsTable).where(and(eq(albumsTable.id, parsed.data.albumId), eq(albumsTable.ownerId, owner)));
      if (!album) return void res.status(400).json({ error: "Choose an album you own" });
    }
    const [track] = await db.insert(tracksTable).values({ ...parsed.data, ownerId: owner }).returning();
    const [result] = await listTrackRows(owner, eq(tracksTable.id, track.id));
    res.status(201).json(result);
  } catch (error) {
    req.log.error({ err: error }, "Failed to create track");
    res.status(500).json({ error: "Failed to create track" });
  }
});

router.patch("/music/tracks/:trackId", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const params = UpdateTrackParams.safeParse(req.params);
  const body = UpdateTrackBody.safeParse(req.body);
  if (!params.success || !body.success) return void res.status(400).json({ error: "Invalid track details" });
  try {
    const [existing] = await db.select().from(tracksTable).where(and(eq(tracksTable.id, params.data.trackId), eq(tracksTable.ownerId, owner)));
    if (!existing) return void res.status(404).json({ error: "Track not found" });
    const audioChanged =
      body.data.audioPath !== undefined &&
      body.data.audioPath !== existing.audioPath;
    const coverChanged =
      body.data.coverArtPath !== undefined &&
      body.data.coverArtPath !== existing.coverArtPath;
    if (
      audioChanged &&
      body.data.audioPath &&
      !(await isValidOwnedAsset(body.data.audioPath, owner, "audio"))
    ) {
      return void res.status(400).json({ error: "Choose an audio file you uploaded to your account" });
    }
    if (
      coverChanged &&
      body.data.coverArtPath &&
      !(await isValidOwnedAsset(body.data.coverArtPath, owner, "image"))
    ) {
      return void res.status(400).json({ error: "Choose an image you uploaded to your account" });
    }
    if (body.data.albumId !== undefined && body.data.albumId !== null) {
      const [album] = await db.select({ id: albumsTable.id }).from(albumsTable).where(and(eq(albumsTable.id, body.data.albumId), eq(albumsTable.ownerId, owner)));
      if (!album) return void res.status(400).json({ error: "Choose an album you own" });
    }
    const assetChanged = audioChanged || coverChanged;
    const [track] = await db.update(tracksTable).set({
      ...body.data,
      ...(assetChanged ? { isPublished: false, publicAudioUrl: null, publicCoverUrl: null } : {}),
    }).where(eq(tracksTable.id, existing.id)).returning();
    const [result] = await listTrackRows(owner, eq(tracksTable.id, track.id));
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Failed to update track");
    res.status(500).json({ error: "Failed to update track" });
  }
});

router.delete("/music/tracks/:trackId", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const parsed = UpdateTrackParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid track id" });
  try {
    const deleted = await db.delete(tracksTable).where(and(eq(tracksTable.id, parsed.data.trackId), eq(tracksTable.ownerId, owner))).returning({ id: tracksTable.id });
    if (!deleted.length) return void res.status(404).json({ error: "Track not found" });
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete track");
    res.status(500).json({ error: "Failed to delete track" });
  }
});

router.post("/music/tracks/:trackId/publish", async (req: Request, res: Response) => {
  const owner = userId(req, res);
  if (!owner) return;
  const parsed = UpdateTrackParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid track id" });
  try {
    const [track] = await db.select().from(tracksTable).where(and(eq(tracksTable.id, parsed.data.trackId), eq(tracksTable.ownerId, owner)));
    if (!track) return void res.status(404).json({ error: "Track not found" });
    const [album] = track.albumId
      ? await db.select().from(albumsTable).where(eq(albumsTable.id, track.albumId))
      : [undefined];
    const assets = await publishedTrackAssets(track, album?.coverArtPath);
    const [updated] = await db.update(tracksTable).set({
      isPublished: true, publicAudioUrl: assets.audioUrl,
      publicCoverUrl: assets.coverUrl,
    }).where(eq(tracksTable.id, track.id)).returning();
    const [result] = await listTrackRows(owner, eq(tracksTable.id, updated.id));
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Failed to publish track");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not publish to GitHub" });
  }
});

router.get("/music/tracks/:trackId/download", async (req: Request, res: Response) => {
  const parsed = UpdateTrackParams.safeParse(req.params);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid track id" });
  try {
    const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, parsed.data.trackId));
    const owner = req.isAuthenticated() ? req.user?.id || null : null;
    if (!track) return void res.status(404).json({ error: "Track not found" });
    if (track.audioPath.startsWith(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/uploads/`)) {
      res.redirect(302, track.audioPath);
      return;
    }
    if (track.isPublished && track.publicAudioUrl) {
      const remote = await fetch(track.publicAudioUrl);
      if (!remote.ok || !remote.body) return void res.status(502).json({ error: "Published audio is temporarily unavailable" });
      const ext = new URL(track.publicAudioUrl).pathname.split(".").pop() || "audio";
      const filename = safeDownloadName(track.title, ext);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", remote.headers.get("content-type") || "application/octet-stream");
      Readable.fromWeb(remote.body as ReadableStream<Uint8Array>).pipe(res);
      return;
    }
    const file = await objectStorage.getObjectEntityFile(track.audioPath);
    const [metadata] = await file.getMetadata();
    const filename = safeDownloadName(track.title, extensionFor(String(metadata.contentType || ""), "audio"));
    const response = await objectStorage.downloadObject(file, 0);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    req.log.error({ err: error }, "Failed to download track");
    res.status(500).json({ error: "Could not download track" });
  }
});

export default router;
