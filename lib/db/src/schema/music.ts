import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const albumsTable = pgTable("albums", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  year: integer("year").notNull(),
  coverArtPath: text("cover_art_path"),
  publicCoverUrl: text("public_cover_url"),
  isPublished: boolean("is_published").notNull().default(false),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  year: integer("year").notNull(),
  albumId: integer("album_id").references(() => albumsTable.id, {
    onDelete: "set null",
  }),
  coverArtPath: text("cover_art_path"),
  audioPath: text("audio_path").notNull(),
  publicAudioUrl: text("public_audio_url"),
  publicCoverUrl: text("public_cover_url"),
  isPublished: boolean("is_published").notNull().default(false),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAlbumSchema = createInsertSchema(albumsTable).omit({
  id: true,
  createdAt: true,
});
export const insertTrackSchema = createInsertSchema(tracksTable).omit({
  id: true,
  createdAt: true,
});

export type Album = typeof albumsTable.$inferSelect;
export type Track = typeof tracksTable.$inferSelect;
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;
export type InsertTrack = z.infer<typeof insertTrackSchema>;