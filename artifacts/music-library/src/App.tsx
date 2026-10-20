import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ChevronRight, Disc3, Edit3, FileAudio, FolderOpen, Headphones,
  Library, ListMusic, Music2, Pause, Pencil, Play, Plus,
  Download, Search, Share2, Trash2, Upload, Volume2, X, Image as ImageIcon, Mail,
  MessageSquareText,
} from 'lucide-react';
import {
  type Album, type AlbumDetail, type Track,
  getGetAlbumQueryKey, getGetMusicDashboardQueryKey, getGetStoredObjectQueryKey,
  getListAlbumsQueryKey, getListTracksQueryKey, useCreateAlbum, useCreateTrack,
  useDeleteAlbum, useDeleteTrack, useGetAlbum, useGetMusicDashboard,
  usePublishAlbum, usePublishTrack,
  useGetStoredObject, useListAlbums, useListTracks, useRequestUploadUrl,
  useUpdateAlbum, useUpdateTrack,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useAuth } from '@workspace/replit-auth-web';

const queryClient = new QueryClient();

function objectUrl(path: string | null | undefined) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `/api/storage${path}`;
}

function StoredImage({ path, alt, className, fallback = 'ML' }: {
  path?: string | null; alt: string; className?: string; fallback?: string;
}) {
  const [url, setUrl] = useState('');
  const isRemote = !!path && /^https?:\/\//i.test(path);
  const storedPath = path?.replace(/^\/objects\//, '') || '';
  const stored = useGetStoredObject(storedPath, {
    query: { enabled: !!path && !isRemote, queryKey: getGetStoredObjectQueryKey(storedPath) },
  });
  useEffect(() => {
    if (isRemote) { setUrl(path || ''); return; }
    if (!stored.data) { setUrl(''); return; }
    const next = URL.createObjectURL(stored.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [isRemote, path, stored.data]);
  return url ? <img data-testid={`img-${alt}`} src={url} alt={alt} className={className} /> :
    <div data-testid={`img-placeholder-${alt}`} aria-label={alt} className={`${className || ''} flex items-center justify-center bg-[#263f3b] text-[#f6d77a] font-display text-2xl`}>{fallback}</div>;
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
}

type PlayerState = { track: Track | null; playing: boolean };
type PlayerControls = PlayerState & { play: (track: Track) => void };
const PlayerContext = createContext<PlayerControls | null>(null);
function usePlayerLocal(): PlayerControls {
  const [state, setState] = useState<PlayerState>({ track: null, playing: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = (track: Track) => {
    if (state.track?.id === track.id) {
      if (audioRef.current?.paused) { void audioRef.current.play(); setState({ track, playing: true }); }
      else { audioRef.current?.pause(); setState({ track, playing: false }); }
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(objectUrl(track.audioPath));
    audio.onended = () => setState((current) => ({ ...current, playing: false }));
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
    setState({ track, playing: true });
  };
  return { ...state, play };
}
function usePlayer() {
  const context = useContext(PlayerContext);
  return context || usePlayerLocal();
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const player = usePlayerLocal();
  const auth = useAuth();
  const displayName = auth.user?.firstName || auth.user?.email || 'Guest';
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <div className="grain min-h-[100dvh] bg-[#eee8d9] text-[#2b263b]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[246px] flex-col bg-[#263f3b] px-6 py-7 text-[#f7efe0] md:flex">
        <Link href="/" data-testid="link-home" className="mb-14 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e3c65b] text-[#e3c65b]"><Disc3 size={21} /></span>
          <span className="font-display text-[27px] leading-none tracking-tight">music<br /><i>library</i></span>
        </Link>
        <p className="mb-3 font-mono-custom text-[10px] uppercase tracking-[.22em] text-[#b7c5b4]">Your room</p>
        <nav className="space-y-1">
          <Link href="/" data-testid="link-library" className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${location === '/' ? 'bg-[#d85c3c] text-[#fff5e8]' : 'text-[#c2d0c4] hover:bg-[#34534c]'}`}><Library size={17} /> Library</Link>
          <button data-testid="button-collections" onClick={() => document.getElementById('albums')?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-[#c2d0c4] transition-colors hover:bg-[#34534c]"><FolderOpen size={17} /> Collections</button>
        </nav>
        <div className="mt-auto border-t border-[#496059] pt-5">
          <p className="font-mono-custom text-[10px] uppercase tracking-[.18em] text-[#91a9a1]">Listening room</p>
          <p className="mt-2 font-display text-lg text-[#e3c65b]">Keep the good stuff close.</p>
        </div>
      </aside>
      <PlayerContext.Provider value={player}><div className="md:pl-[246px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#d8cfbe] bg-[#eee8d9]/95 px-5 backdrop-blur-md md:px-10">
          <div className="flex items-center gap-3 md:hidden"><Disc3 size={21} className="text-[#d85c3c]" /><span className="font-display text-2xl">music library</span></div>
          <div className="hidden font-mono-custom text-[11px] uppercase tracking-[.2em] text-[#807768] md:block">Public listening room <span className="mx-2 text-[#d85c3c]">/</span> 01</div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[#807768] sm:block">{auth.isAuthenticated ? displayName : 'Browse published music'}</span>
            {auth.isAuthenticated ? <button onClick={auth.logout} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e3c65b] font-mono-custom text-xs text-[#2b263b]" aria-label="Log out">{initials}</button> : <button onClick={auth.login} className="rounded-full border border-[#cdbfa9] px-3 py-2 text-[11px] font-semibold text-[#2b263b] hover:bg-[#e4dac8]">Log in</button>}
          </div>
        </header>
        <main className="px-5 pb-32 pt-9 md:px-10 lg:px-14">{children}</main>
      </div></PlayerContext.Provider>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#b85840] bg-[#d85c3c] text-[#fff5e8] shadow-[0_-8px_30px_rgba(55,36,22,.13)] md:left-[246px]">
        <div className="mx-auto flex h-[76px] max-w-[1300px] items-center gap-4 px-5 md:px-10">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[#263f3b]">
            <StoredImage path={player.track?.coverArtPath} alt="current cover" className="h-full w-full object-cover" fallback="ML" />
          </div>
          <div className="min-w-0 flex-1">
            <p data-testid="text-current-track" className="truncate text-sm font-semibold">{player.track?.title || 'Nothing playing yet'}</p>
            <p className="truncate text-xs text-[#f5c8b7]">{player.track?.artist || 'Choose a track from your library'}</p>
          </div>
          {player.track && <span className="hidden font-mono-custom text-[10px] text-[#f5c8b7] sm:block">{formatDuration(player.track.durationSeconds)}</span>}
          <button data-testid="button-player-play" onClick={() => player.track && player.play(player.track)} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7efe0] text-[#d85c3c] transition-transform hover:scale-105 disabled:opacity-50" disabled={!player.track}>{player.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
          <Volume2 size={17} className="hidden text-[#f5c8b7] sm:block" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="mb-5 flex items-end justify-between"><div><p className="font-mono-custom text-[10px] uppercase tracking-[.2em] text-[#d85c3c]">{eyebrow}</p><h2 className="mt-1 font-display text-[34px] leading-none tracking-tight text-[#2b263b]">{title}</h2></div>{action}</div>;
}

function Stat({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return <div className="border-l border-[#d2c8b7] pl-4"><p data-testid={`text-stat-${label}`} className={`font-display text-[39px] leading-none ${accent || 'text-[#2b263b]'}`}>{value}</p><p className="mt-2 font-mono-custom text-[10px] uppercase tracking-[.15em] text-[#807768]">{label}</p></div>;
}

function SkeletonRows() {
  return <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[66px] animate-pulse rounded-lg bg-[#e2dacb]" />)}</div>;
}

function TrackRow({ track, onPlay, active, onEdit, onDelete, onPublish, onShare }: { track: Track; onPlay: () => void; active?: boolean; onEdit?: () => void; onDelete?: () => void; onPublish?: () => void; onShare?: () => void }) {
  return <div data-testid={`row-track-${track.id}`} className={`group grid grid-cols-[30px_42px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors ${active ? 'bg-[#f6d77a]/35' : 'hover:bg-[#e3dac9]'}`}>
    <button data-testid={`button-play-track-${track.id}`} onClick={onPlay} className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? 'bg-[#d85c3c] text-[#fff5e8]' : 'text-[#d85c3c] opacity-60 group-hover:opacity-100'}`}>{active ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
    <StoredImage path={track.coverArtPath} alt={`${track.title} artwork`} className="h-10 w-10 rounded object-cover" fallback="ML" />
    <div className="min-w-0"><p data-testid={`text-track-title-${track.id}`} className="truncate text-sm font-semibold">{track.title}</p><p className="truncate text-xs text-[#807768]">{track.artist}{track.albumTitle ? ` · ${track.albumTitle}` : ''}</p></div>
    <span className="hidden font-mono-custom text-[10px] text-[#807768] sm:block">{formatDuration(track.durationSeconds)}</span>
    <div className="flex items-center gap-0.5 text-[#807768] sm:opacity-70 sm:group-hover:opacity-100">
      {(track.isPublished || track.canManage) && <a data-testid={`link-download-track-${track.id}`} href={`/api/music/tracks/${track.id}/download`} aria-label={`Download ${track.title}`} className="rounded p-2 hover:bg-[#d7cdbb] hover:text-[#2b263b]"><Download size={14} /></a>}
      {onShare && <button data-testid={`button-share-track-${track.id}`} onClick={onShare} aria-label={`Share ${track.title}`} className="rounded p-2 hover:bg-[#d7cdbb] hover:text-[#2b263b]"><Share2 size={14} /></button>}
      {track.canManage && !track.isPublished && onPublish && <button data-testid={`button-publish-track-${track.id}`} onClick={onPublish} aria-label={`Publish ${track.title}`} className="rounded p-2 text-[#367064] hover:bg-[#d7cdbb]"><Upload size={14} /></button>}
      {track.canManage && onEdit && <button data-testid={`button-edit-track-${track.id}`} onClick={onEdit} aria-label={`Edit ${track.title}`} className="rounded p-2 hover:bg-[#d7cdbb] hover:text-[#2b263b]"><Pencil size={14} /></button>}
      {track.canManage && onDelete && <button data-testid={`button-delete-track-${track.id}`} onClick={onDelete} aria-label={`Delete ${track.title}`} className="rounded p-2 hover:bg-[#f3c4b5] hover:text-[#a33c28]"><Trash2 size={14} /></button>}
    </div>
  </div>;
}

function AlbumCard({ album }: { album: Album }) {
  return <Link href={`/album/${album.id}`} data-testid={`link-album-${album.id}`} className="group block">
    <div className="relative aspect-square overflow-hidden rounded-xl bg-[#263f3b] shadow-warm"><StoredImage path={album.coverArtPath} alt={`${album.title} cover`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" fallback="ML" /><div className="absolute inset-0 bg-gradient-to-t from-[#182b28]/75 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" /><span className="absolute bottom-3 right-3 translate-y-2 rounded-full bg-[#f7efe0] px-2 py-1 font-mono-custom text-[9px] text-[#2b263b] opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">{album.trackCount} tracks</span></div>
    <div className="mt-3 flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{album.title}</p><p className="text-xs text-[#807768]">{album.artist} · {album.year}</p></div><ChevronRight size={16} className="mt-1 text-[#b5a995] transition-transform group-hover:translate-x-1" /></div>
  </Link>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#2b263b]/40 p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="max-h-[92dvh] w-full max-w-[540px] overflow-auto rounded-t-2xl bg-[#f7efe0] p-6 shadow-2xl sm:rounded-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="font-mono-custom text-[10px] uppercase tracking-[.18em] text-[#d85c3c]">Make it yours</p><h2 className="mt-1 font-display text-3xl">{title}</h2></div><button data-testid="button-close-modal" onClick={onClose} className="rounded-full p-2 text-[#807768] hover:bg-[#e9dfcf]"><X size={18} /></button></div>{children}</div></div>;
}

function ShareModal({ title, text, url, onClose }: { title: string; text: string; url: string; onClose: () => void }) {
  const [recipient, setRecipient] = useState('');
  const [notice, setNotice] = useState('');
  const canNativeShare = 'share' in navigator;
  const body = `${text}\n\n${url}`;
  const shareTo = (channel: 'sms' | 'email') => {
    const target = channel === 'email'
      ? `mailto:${recipient}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
      : `sms:${recipient}?body=${encodeURIComponent(body)}`;
    window.location.href = target;
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(url);
    setNotice('Link copied.');
  };
  const nativeShare = async () => {
    if (!navigator.share) return;
    await navigator.share({ title, text, url });
  };
  return <Modal title="Send it on" onClose={onClose}>
    <p className="mb-5 text-sm leading-6 text-[#6f675b]">Choose how you want to send this listening room to a friend.</p>
    <Field label="Phone number or email (optional)" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="friend@example.com or +1 555 000 0000" data-testid="input-share-recipient" />
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <button onClick={() => shareTo('sms')} className="flex items-center justify-center gap-2 rounded-lg bg-[#263f3b] py-3 text-sm font-semibold text-[#f7efe0] hover:bg-[#34534c]"><MessageSquareText size={16} /> Text a friend</button>
      <button onClick={() => shareTo('email')} className="flex items-center justify-center gap-2 rounded-lg bg-[#d85c3c] py-3 text-sm font-semibold text-[#fff5e8] hover:bg-[#bc4c32]"><Mail size={16} /> Email a friend</button>
    </div>
    <div className="mt-3 flex gap-3">
      <button onClick={copy} className="flex-1 rounded-lg border border-[#cdbfa9] py-2.5 text-xs font-semibold hover:bg-[#e9dfcf]">Copy link</button>
      {canNativeShare && <button onClick={nativeShare} className="flex-1 rounded-lg border border-[#cdbfa9] py-2.5 text-xs font-semibold hover:bg-[#e9dfcf]">More ways to share</button>}
    </div>
    {notice && <p className="mt-4 text-center text-xs font-semibold text-[#367064]">{notice}</p>}
  </Modal>;
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block"><span className="mb-1.5 block font-mono-custom text-[10px] uppercase tracking-[.16em] text-[#807768]">{label}</span><input {...props} className="w-full rounded-lg border border-[#d1c5b2] bg-[#eee8d9] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[#ad9e8c] focus:border-[#d85c3c] focus:ring-2 focus:ring-[#d85c3c]/15" /></label>;
}

async function uploadFile(file: File, request: ReturnType<typeof useRequestUploadUrl>) {
  // Hash locally so the browser can upload directly to Git LFS without sending
  // the audio bytes through Vercel's request-size-limited Function.
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const oid = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const response = await request.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || 'application/octet-stream', oid } });
  const uploaded = await fetch(response.uploadURL, { method: 'PUT', headers: response.uploadHeaders, body: file });
  if (!uploaded.ok) throw new Error('The file upload did not complete. Check that Git LFS is enabled for the repository.');
  const finalized = await fetch('/api/storage/uploads/finalize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectPath: response.objectPath, oid, size: file.size }) });
  if (!finalized.ok) throw new Error('The upload completed but GitHub could not register it in the repository.');
  const data = await finalized.json() as { objectPath: string };
  return data.objectPath;
}

function AlbumForm({ album, onClose }: { album?: Album; onClose: () => void }) {
  const request = useRequestUploadUrl();
  const create = useCreateAlbum();
  const update = useUpdateAlbum();
  const qc = useQueryClient();
  const auth = useAuth();
  const [title, setTitle] = useState(album?.title || '');
  const [artist, setArtist] = useState(album?.artist || '');
  const [year, setYear] = useState(String(album?.year || new Date().getFullYear()));
  const [cover, setCover] = useState<File | null>(null);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!title.trim() || !artist.trim()) { setError('Title and artist are required.'); return; }
    try {
      const coverArtPath = cover ? await uploadFile(cover, request) : undefined;
      if (album) await update.mutateAsync({ albumId: album.id, data: { title, artist, year: Number(year), ...(coverArtPath ? { coverArtPath } : {}) } });
      else await create.mutateAsync({ data: { title, artist, year: Number(year), coverArtPath: coverArtPath || null } });
      await qc.invalidateQueries({ queryKey: getListAlbumsQueryKey() }); await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }); onClose();
    } catch { setError('Could not save this album. Try again.'); }
  };
  if (!auth.isAuthenticated) return <Modal title="Sign in to organize albums" onClose={onClose}><p className="mb-5 text-sm leading-6 text-[#6f675b]">Anyone can browse published music. Sign in to create albums and manage your collection.</p><button onClick={auth.login} className="w-full rounded-lg bg-[#d85c3c] py-3 text-sm font-semibold text-[#fff5e8]">Sign in</button></Modal>;
  return <Modal title={album ? 'Edit album' : 'New album'} onClose={onClose}><form onSubmit={save} className="space-y-4"><Field label="Album title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The record name" data-testid="input-album-title" /><Field label="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Who made it" data-testid="input-album-artist" /><Field label="Year" type="number" min="0" value={year} onChange={(e) => setYear(e.target.value)} data-testid="input-album-year" /><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cdbfa9] p-3 text-sm hover:bg-[#eee8d9]"><ImageIcon size={18} className="text-[#d85c3c]" /><span className="flex-1">{cover?.name || 'Choose cover artwork'}</span><input data-testid="input-album-cover" type="file" accept="image/*" className="hidden" onChange={(e) => setCover(e.target.files?.[0] || null)} /><span className="font-mono-custom text-[10px] uppercase text-[#d85c3c]">Browse</span></label>{error && <p data-testid="status-album-error" className="text-sm text-[#b34430]">{error}</p>}<button data-testid="button-save-album" disabled={create.isPending || update.isPending} className="w-full rounded-lg bg-[#d85c3c] py-3 text-sm font-semibold text-[#fff5e8] transition-transform hover:-translate-y-0.5 disabled:opacity-50">{create.isPending || update.isPending ? 'Saving...' : 'Save album'}</button></form></Modal>;
}

function TrackForm({ track, albumId, albums, onClose }: { track?: Track; albumId?: number | null; albums: Album[]; onClose: () => void }) {
  const request = useRequestUploadUrl(); const create = useCreateTrack(); const update = useUpdateTrack(); const qc = useQueryClient(); const auth = useAuth();
  const [title, setTitle] = useState(track?.title || ''); const [artist, setArtist] = useState(track?.artist || ''); const [year, setYear] = useState(String(track?.year || new Date().getFullYear())); const [selectedAlbum, setSelectedAlbum] = useState(String(track?.albumId || albumId || '')); const [audio, setAudio] = useState<File | null>(null); const [cover, setCover] = useState<File | null>(null); const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => { event.preventDefault(); setError(''); if (!title.trim() || !artist.trim() || (!track && !audio)) { setError('Title, artist, and an audio file are required.'); return; } try { const metadata = { title, artist, year: Number(year), albumId: selectedAlbum ? Number(selectedAlbum) : null }; if (track) { const audioPath = audio ? await uploadFile(audio, request) : undefined; const coverArtPath = cover ? await uploadFile(cover, request) : undefined; await update.mutateAsync({ trackId: track.id, data: { ...metadata, ...(audioPath ? { audioPath } : {}), ...(coverArtPath ? { coverArtPath } : {}) } }); } else { const audioPath = await uploadFile(audio!, request); const coverArtPath = cover ? await uploadFile(cover, request) : null; await create.mutateAsync({ data: { ...metadata, audioPath, coverArtPath, durationSeconds: null } }); } await qc.invalidateQueries({ queryKey: getListTracksQueryKey() }); await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }); if (albumId) await qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) }); onClose(); } catch { setError('Could not save this track. Try again.'); } };
  if (!auth.isAuthenticated) return <Modal title="Sign in to add music" onClose={onClose}><p className="mb-5 text-sm leading-6 text-[#6f675b]">Anyone can listen to published songs. Sign in to upload tracks and manage your own music.</p><button onClick={auth.login} className="w-full rounded-lg bg-[#d85c3c] py-3 text-sm font-semibold text-[#fff5e8]">Sign in</button></Modal>;
  return <Modal title={track ? 'Edit track' : 'Add a track'} onClose={onClose}><form onSubmit={save} className="space-y-4"><Field label="Track title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this moment" data-testid="input-track-title" /><Field label="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Who made it" data-testid="input-track-artist" /><div className="grid grid-cols-2 gap-3"><Field label="Year" type="number" min="0" value={year} onChange={(e) => setYear(e.target.value)} data-testid="input-track-year" /><label className="block"><span className="mb-1.5 block font-mono-custom text-[10px] uppercase tracking-[.16em] text-[#807768]">Album</span><select data-testid="select-track-album" value={selectedAlbum} onChange={(e) => setSelectedAlbum(e.target.value)} className="w-full rounded-lg border border-[#d1c5b2] bg-[#eee8d9] px-3 py-2.5 text-sm outline-none focus:border-[#d85c3c]"><option value="">Single / none</option>{albums.filter((item) => item.canManage).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cdbfa9] p-3 text-sm hover:bg-[#eee8d9]"><ImageIcon size={18} className="text-[#d85c3c]" /><span className="flex-1 truncate">{cover?.name || (track?.coverArtPath ? 'Replace cover artwork (optional)' : 'Choose cover artwork')}</span><input data-testid="input-track-cover" type="file" accept="image/*" className="hidden" onChange={(e) => setCover(e.target.files?.[0] || null)} /><span className="font-mono-custom text-[10px] uppercase text-[#d85c3c]">Browse</span></label><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cdbfa9] p-3 text-sm hover:bg-[#eee8d9]"><FileAudio size={18} className="text-[#d85c3c]" /><span className="flex-1 truncate">{audio?.name || (track ? 'Replace audio file (optional)' : 'Choose an audio file')}</span><input data-testid="input-track-audio" type="file" accept="audio/*" className="hidden" onChange={(e) => setAudio(e.target.files?.[0] || null)} /><span className="font-mono-custom text-[10px] uppercase text-[#d85c3c]">Browse</span></label>{error && <p data-testid="status-track-error" className="text-sm text-[#b34430]">{error}</p>}<button data-testid="button-save-track" disabled={create.isPending || update.isPending || request.isPending} className="w-full rounded-lg bg-[#d85c3c] py-3 text-sm font-semibold text-[#fff5e8] transition-transform hover:-translate-y-0.5 disabled:opacity-50">{create.isPending || update.isPending || request.isPending ? 'Uploading...' : 'Save track'}</button></form></Modal>;
}

function HomePage() {
  const dashboard = useGetMusicDashboard(); const albumsQuery = useListAlbums(); const [search, setSearch] = useState(''); const tracksQuery = useListTracks({ search: search || undefined }); const [modal, setModal] = useState<'album' | 'track' | null>(null); const [editingTrack, setEditingTrack] = useState<Track>(); const player = usePlayer(); const [notice, setNotice] = useState(''); const [shareOpen, setShareOpen] = useState(false); const [sharedTrack, setSharedTrack] = useState<Track | null>(null); const [sharedUrl, setSharedUrl] = useState(''); const auth = useAuth();
  const tracks = tracksQuery.data || []; const albums = albumsQuery.data || [];
  const filteredRecent = dashboard.data?.recentlyAdded || [];
  const deleteTrack = useDeleteTrack(); const publishTrack = usePublishTrack(); const qc = useQueryClient();
  const removeTrack = async (id: number) => { if (!window.confirm('Remove this track from your library?')) return; await deleteTrack.mutateAsync({ trackId: id }); await qc.invalidateQueries({ queryKey: getListTracksQueryKey() }); await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }); };
  const openTrackForm = () => auth.isAuthenticated ? setModal('track') : auth.login();
  const openAlbumForm = () => auth.isAuthenticated ? setModal('album') : auth.login();
  const publishOne = async (track: Track) => {
    if (!window.confirm('Publishing makes this song and its cover public and downloadable. Copies may remain even if you later remove it. Continue?')) return;
    try {
      await publishTrack.mutateAsync({ trackId: track.id });
      await qc.invalidateQueries({ queryKey: getListTracksQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() });
      if (track.albumId) await qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(track.albumId) });
      setNotice(`“${track.title}” is now public and downloadable.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not publish this song.');
    }
  };
  const shareOne = async (track: Track) => {
    let published = track;
    if (!track.isPublished) {
      if (!track.canManage) return;
      if (!window.confirm('Sharing this song will publish it and make the audio and cover public and downloadable. Copies may remain if it is later removed. Continue?')) return;
      try {
        published = await publishTrack.mutateAsync({ trackId: track.id });
        await qc.invalidateQueries({ queryKey: getListTracksQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() });
        if (track.albumId) await qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(track.albumId) });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not publish this song.');
        return;
      }
    }
    setSharedTrack(published);
    setSharedUrl(published.audioPath);
    setShareOpen(true);
  };
  const share = () => { setSharedTrack(null); setShareOpen(true); };
  return <Shell><div className="mx-auto max-w-[1320px]">
    <div className="mb-11 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div className="animate-rise"><p className="mb-4 font-mono-custom text-[10px] uppercase tracking-[.24em] text-[#d85c3c]">An open listening room</p><h1 className="max-w-[620px] font-display text-[58px] leading-[.88] tracking-[-.035em] text-[#2b263b] sm:text-[78px]">The songs<br /><i>we keep.</i></h1><p className="mt-6 max-w-[430px] text-sm leading-6 text-[#6f675b]">Browse published music, discover albums, and share songs with friends. Your uploads stay private until you publish them.</p></div><div className="flex gap-2"><button data-testid="button-share-library" onClick={share} className="flex items-center gap-2 rounded-lg border border-[#cdbfa9] bg-[#f7efe0] px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-[#e7ddcc]"><Share2 size={15} /> Share library</button><button data-testid="button-add-track" onClick={openTrackForm} className="flex items-center gap-2 rounded-lg bg-[#d85c3c] px-4 py-2.5 text-xs font-semibold text-[#fff5e8] transition-transform hover:-translate-y-0.5"><Plus size={15} /> Add track</button></div></div>
    {notice && <div data-testid="status-library-notice" className="mb-5 rounded-lg bg-[#f6d77a] px-4 py-3 text-sm">{notice}</div>}
    <div className="mb-12 grid grid-cols-2 gap-7 border-y border-[#d2c8b7] py-6 sm:grid-cols-4"><Stat value={dashboard.data?.trackCount ?? '—'} label="Tracks" accent="text-[#d85c3c]" /><Stat value={dashboard.data?.albumCount ?? '—'} label="Albums" /><Stat value={dashboard.data ? `${dashboard.data.totalMinutes}m` : '—'} label="Listening time" accent="text-[#367064]" /><Stat value={dashboard.data?.recentlyAdded?.length ?? '—'} label="Recent additions" /></div>
    <div className="mb-14 grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
      <section className="animate-rise" style={{ animationDelay: '.08s' }}><SectionHeading eyebrow="Community library" title="All tracks" action={<button data-testid="button-upload-track" onClick={openTrackForm} className="flex items-center gap-2 rounded-lg border border-[#cdbfa9] bg-[#f7efe0] px-3 py-2 text-xs font-semibold hover:bg-[#e4dac8]"><Upload size={14} /> Upload</button>} /><div className="mb-4 flex items-center gap-3 rounded-lg border border-[#d1c5b2] bg-[#f7efe0] px-3 py-2"><Search size={16} className="text-[#9e907f}" /><input data-testid="input-track-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, artist, or album" className="w-full bg-transparent text-sm outline-none placeholder:text-[#a89d8d]" />{search && <button data-testid="button-clear-search" onClick={() => setSearch('')}><X size={15} /></button>}</div>{tracksQuery.isLoading ? <SkeletonRows /> : tracksQuery.isError ? <div data-testid="status-tracks-error" className="rounded-lg border border-[#e2b3a6] bg-[#f7ddd4] p-5 text-sm text-[#963e2b]">Your tracks could not load. <button onClick={() => tracksQuery.refetch()} className="font-semibold underline">Try again</button></div> : tracks.length ? <div className="space-y-1">{tracks.map((track) => <TrackRow key={track.id} track={track} active={player.track?.id === track.id && player.playing} onPlay={() => player.play(track)} onShare={() => void shareOne(track)} onPublish={() => void publishOne(track)} onEdit={() => { setEditingTrack(track); setModal('track'); }} onDelete={() => removeTrack(track.id)} />)}</div> : <div data-testid="empty-tracks" className="rounded-xl border border-dashed border-[#cdbfa9] bg-[#f7efe0] px-6 py-12 text-center"><Music2 className="mx-auto mb-3 text-[#d85c3c]" size={24} /><p className="font-display text-2xl">No published songs yet.</p><p className="mt-1 text-sm text-[#807768]">Sign in to upload music and publish it to the library.</p><button data-testid="button-empty-add-track" onClick={openTrackForm} className="mt-5 rounded-lg bg-[#263f3b] px-4 py-2 text-xs font-semibold text-[#f7efe0]">Upload a track</button></div>}</section>
      <aside className="animate-rise" style={{ animationDelay: '.16s' }}><SectionHeading eyebrow="A little ritual" title="Recently added" /><div className="rounded-xl bg-[#263f3b] p-5 text-[#f7efe0]"><div className="mb-5 flex items-center justify-between"><Headphones size={22} className="text-[#e3c65b]" /><span className="font-mono-custom text-[10px] uppercase tracking-[.15em] text-[#9db1a5]">Fresh in</span></div>{filteredRecent.length ? <div className="space-y-4">{filteredRecent.slice(0, 4).map((track, index) => <button data-testid={`button-recent-track-${track.id}`} key={track.id} onClick={() => player.play(track)} className="flex w-full items-center gap-3 text-left"><span className="font-mono-custom text-[10px] text-[#89a197]">0{index + 1}</span><StoredImage path={track.coverArtPath} alt={`${track.title} recent artwork`} className="h-9 w-9 rounded object-cover" fallback="ML" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{track.title}</span><span className="block truncate text-xs text-[#9db1a5]">{track.artist}</span></span><Play size={13} className="text-[#e3c65b]" /></button>)}</div> : <p className="py-6 text-sm leading-6 text-[#b4c6b8]">Your newest additions will find their way here.</p>}<div className="mt-6 border-t border-[#496059] pt-4"><p className="font-display text-xl text-[#e3c65b]">Take your time.</p><p className="mt-1 text-xs text-[#b4c6b8]">There is no algorithm in this room.</p></div></div></aside>
    </div>
    <section id="albums" className="animate-rise" style={{ animationDelay: '.22s' }}><SectionHeading eyebrow="Directory" title="Albums" action={<button data-testid="button-new-album" onClick={openAlbumForm} className="flex items-center gap-2 rounded-lg bg-[#263f3b] px-3 py-2 text-xs font-semibold text-[#f7efe0] hover:bg-[#34534c]"><Plus size={14} /> New album</button>} />{albumsQuery.isLoading ? <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">{[1,2,3,4,5].map(i => <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#e2dacb]" />)}</div> : albums.length ? <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">{albums.map((album) => <AlbumCard key={album.id} album={album} />)}</div> : <div data-testid="empty-albums" className="rounded-xl border border-dashed border-[#cdbfa9] bg-[#f7efe0] px-6 py-10 text-center"><FolderOpen className="mx-auto mb-3 text-[#367064]" size={25} /><p className="font-display text-2xl">No public albums yet.</p><button data-testid="button-empty-new-album" onClick={openAlbumForm} className="mt-4 rounded-lg bg-[#d85c3c] px-4 py-2 text-xs font-semibold text-[#fff5e8]">Create an album</button></div>}</section>
     {modal === 'album' && <AlbumForm onClose={() => setModal(null)} />}{modal === 'track' && <TrackForm track={editingTrack} albums={albums} onClose={() => { setModal(null); setEditingTrack(undefined); }} />}{shareOpen && <ShareModal title={sharedTrack?.title || "My music library"} text={sharedTrack ? `Listen to ${sharedTrack.title} by ${sharedTrack.artist}.` : "A public listening room from my music library."} url={sharedTrack ? sharedUrl : window.location.href} onClose={() => { setShareOpen(false); setSharedTrack(null); setSharedUrl(''); }} />}
  </div></Shell>;
}

function AlbumPage() {
  const params = useParams<{ id: string }>(); const [, setLocation] = useLocation(); const albumId = Number(params.id); const query = useGetAlbum(albumId, { query: { enabled: !!albumId, queryKey: getGetAlbumQueryKey(albumId) } }); const albumsQuery = useListAlbums(); const player = usePlayer(); const [modal, setModal] = useState<'album' | 'track' | null>(null); const [editingTrack, setEditingTrack] = useState<Track>(); const [notice, setNotice] = useState(''); const [shareOpen, setShareOpen] = useState(false); const [sharedTrack, setSharedTrack] = useState<Track | null>(null); const remove = useDeleteAlbum(); const deleteTrack = useDeleteTrack(); const publishAlbum = usePublishAlbum(); const publishTrack = usePublishTrack(); const qc = useQueryClient(); const album = query.data as AlbumDetail | undefined;
  const publishWholeAlbum = async () => {
    if (!album || !album.canManage || album.isPublished) return;
    if (!window.confirm('Publishing makes this album, its tracks, and artwork public and downloadable. Copies may remain even if later removed. Continue?')) return;
    try {
      await publishAlbum.mutateAsync({ albumId });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) }),
        qc.invalidateQueries({ queryKey: getListAlbumsQueryKey() }),
        qc.invalidateQueries({ queryKey: getListTracksQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }),
      ]);
      setNotice('This album and its tracks are now public and downloadable.');
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not publish this album.');
      return false;
    }
  };
  const share = async () => {
    if (!album) return;
    if (!album.isPublished && !(await publishWholeAlbum())) return;
    setSharedTrack(null);
    setShareOpen(true);
  };
  const shareSong = async (track: Track) => {
    let readyTrack = track;
    if (!track.isPublished) {
      if (!track.canManage || !window.confirm('Sharing this song will publish it and make the audio and cover public and downloadable. Copies may remain if later removed. Continue?')) return;
      try {
        readyTrack = await publishTrack.mutateAsync({ trackId: track.id });
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) }),
          qc.invalidateQueries({ queryKey: getListTracksQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }),
        ]);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not publish this song.');
        return;
      }
    }
    setSharedTrack(readyTrack);
    setShareOpen(true);
  };
  const deleteAlbum = async () => { if (!album || !window.confirm(`Delete ${album.title}? This cannot be undone.`)) return; await remove.mutateAsync({ albumId }); await qc.invalidateQueries({ queryKey: getListAlbumsQueryKey() }); await qc.invalidateQueries({ queryKey: getGetMusicDashboardQueryKey() }); setLocation('/'); };
  if (query.isLoading) return <Shell><div className="mx-auto max-w-[1100px] animate-pulse"><div className="h-8 w-20 rounded bg-[#e1d8c8]" /><div className="mt-8 h-72 rounded-2xl bg-[#e1d8c8]" /></div></Shell>;
  if (query.isError || !album) return <Shell><div data-testid="status-album-error" className="mx-auto max-w-[700px] py-20 text-center"><p className="font-display text-4xl">This record is out of reach.</p><button data-testid="button-retry-album" onClick={() => query.refetch()} className="mt-5 rounded-lg bg-[#d85c3c] px-4 py-2 text-sm text-[#fff5e8]">Try again</button></div></Shell>;
  return <Shell><div className="mx-auto max-w-[1160px]">
    <div className="mb-8 flex items-center justify-between"><Link href="/" data-testid="link-back-library" className="flex items-center gap-2 text-xs font-semibold text-[#6f675b] hover:text-[#d85c3c]"><ArrowLeft size={16} /> Back to library</Link><div className="flex gap-2"><button data-testid="button-share-album" onClick={() => void share()} className="flex items-center gap-2 rounded-lg border border-[#cdbfa9] bg-[#f7efe0] px-3 py-2 text-xs font-semibold hover:bg-[#e5dac8]"><Share2 size={14} /> Share</button>{album.canManage && !album.isPublished && <button data-testid="button-publish-album" onClick={() => void publishWholeAlbum()} className="flex items-center gap-2 rounded-lg bg-[#367064] px-3 py-2 text-xs font-semibold text-white"><Upload size={14} /> Publish</button>}{album.canManage && <><button data-testid="button-edit-album" onClick={() => setModal('album')} className="flex items-center gap-2 rounded-lg border border-[#cdbfa9] bg-[#f7efe0] px-3 py-2 text-xs font-semibold hover:bg-[#e5dac8]"><Edit3 size={14} /> Edit</button><button data-testid="button-delete-album" onClick={deleteAlbum} className="rounded-lg border border-[#e2b3a6] p-2 text-[#b34430] hover:bg-[#f5d8d0]"><Trash2 size={15} /></button></>}</div></div>
    {notice && <div data-testid="status-album-notice" className="mb-5 rounded-lg bg-[#f6d77a] px-4 py-3 text-sm">{notice}</div>}
    <section className="relative overflow-hidden rounded-2xl bg-[#263f3b] p-6 text-[#f7efe0] shadow-warm sm:p-10"><div className="absolute -right-20 -top-28 h-80 w-80 rounded-full border-[42px] border-[#34534c] opacity-70" /><div className="relative grid items-center gap-8 sm:grid-cols-[230px_1fr]"><StoredImage path={album.coverArtPath} alt={`${album.title} cover art`} className="aspect-square w-full max-w-[230px] rounded-xl object-cover shadow-2xl" fallback="ML" /><div><p className="mb-4 font-mono-custom text-[10px] uppercase tracking-[.23em] text-[#e3c65b]">Album / {String(album.year)}</p><h1 data-testid="text-album-title" className="max-w-[650px] font-display text-[54px] leading-[.9] tracking-tight sm:text-[74px]">{album.title}</h1><p data-testid="text-album-artist" className="mt-5 text-lg text-[#b7c8ba]">{album.artist}</p><div className="mt-8 flex items-center gap-5 text-xs text-[#9db1a5]"><span>{album.trackCount} tracks</span><span className="h-1 w-1 rounded-full bg-[#e3c65b]" /><span>Added {formatDate(album.createdAt)}</span></div></div></div></section>
    <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_280px]"><section><SectionHeading eyebrow="The tracklist" title="Songs" action={album.canManage ? <button data-testid="button-add-album-track" onClick={() => setModal('track')} className="flex items-center gap-2 rounded-lg bg-[#d85c3c] px-3 py-2 text-xs font-semibold text-[#fff5e8]"><Plus size={14} /> Add track</button> : undefined} />{album.tracks.length ? <div className="space-y-1">{album.tracks.map((track, index) => <div key={track.id} className="grid grid-cols-[28px_1fr] items-center gap-1"><span className="text-center font-mono-custom text-[10px] text-[#a89d8d]">{String(index + 1).padStart(2, '0')}</span><TrackRow track={track} active={player.track?.id === track.id && player.playing} onPlay={() => player.play(track)} onShare={() => void shareSong(track)} onEdit={() => { setEditingTrack(track); setModal('track'); }} onDelete={async () => { if (window.confirm('Remove this track?')) { await deleteTrack.mutateAsync({ trackId: track.id }); await qc.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) }); await qc.invalidateQueries({ queryKey: getListAlbumsQueryKey() }); } }} /></div>)}</div> : <div data-testid="empty-album-tracks" className="rounded-xl border border-dashed border-[#cdbfa9] p-10 text-center"><ListMusic className="mx-auto text-[#d85c3c]" /><p className="mt-3 font-display text-2xl">No songs on this record yet.</p></div>}</section><aside><div className="border-t border-[#d2c8b7] pt-4"><p className="font-mono-custom text-[10px] uppercase tracking-[.2em] text-[#d85c3c]">About this record</p><p className="mt-3 text-sm leading-6 text-[#6f675b]">A small corner of your collection, kept exactly how you like it. Edit the details whenever the story changes.</p></div><div className="mt-8 rounded-xl bg-[#f6d77a] p-5"><Disc3 size={22} className="text-[#263f3b]" /><p className="mt-7 font-display text-2xl leading-none text-[#263f3b]">Press play.<br />Stay awhile.</p></div></aside></div>
     {modal === 'album' && <AlbumForm album={album} onClose={() => setModal(null)} />}{modal === 'track' && <TrackForm track={editingTrack} albumId={albumId} albums={albumsQuery.data || []} onClose={() => { setModal(null); setEditingTrack(undefined); }} />}{shareOpen && <ShareModal title={sharedTrack?.title || album.title} text={sharedTrack ? `Listen to ${sharedTrack.title} by ${sharedTrack.artist}.` : `A record from my library: ${album.title}`} url={sharedTrack?.audioPath || window.location.href} onClose={() => { setShareOpen(false); setSharedTrack(null); }} />}
  </div></Shell>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={HomePage} /><Route path="/album/:id" component={AlbumPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;