import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  type AnyPgColumn,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const projectStatus = pgEnum("project_status", [
  "planned",
  "active",
  "on_hold",
  "done",
  "archived",
]);

export const assetKind = pgEnum("asset_kind", [
  "media",
  "code",
  "document",
  "cad",
]);

export const projectCodeSeq = pgSequence("project_code_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    status: projectStatus("status").notNull().default("planned"),
    parentId: uuid("parent_id").references((): AnyPgColumn => projects.id, {
      onDelete: "restrict",
    }),
    githubUrl: text("github_url"),
    websiteUrl: text("website_url"),
    mediaBackground: boolean("media_background").notNull().default(false),
    mediaBackgroundCycle: boolean("media_background_cycle")
      .notNull()
      .default(false),
    mediaBackgroundOpacity: integer("media_background_opacity")
      .notNull()
      .default(25),
    checksum: text("checksum"),
    checksumAt: timestamp("checksum_at", { withTimezone: true }),
    lastBackupChecksum: text("last_backup_checksum"),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_parent_id_idx").on(table.parentId),
    index("projects_status_idx").on(table.status),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storagePath: text("storage_path").notNull(),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("assets_project_id_idx").on(table.projectId)],
);

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  backupEnabled: boolean("backup_enabled").notNull().default(false),
  backupIntervalCount: integer("backup_interval_count").notNull().default(1),
  backupIntervalUnit: text("backup_interval_unit").notNull().default("week"),
  backupRetentionCount: integer("backup_retention_count").notNull().default(4),
  backupRetentionUnit: text("backup_retention_unit").notNull().default("week"),
  backupRetentionMode: text("backup_retention_mode").notNull().default("age"),
  backupNestFolders: boolean("backup_nest_folders").notNull().default(false),
  backupLastRunAt: timestamp("backup_last_run_at", { withTimezone: true }),
  backupLastSummary: text("backup_last_summary"),
  theme: text("theme").notNull().default("workshop"),
  vaultName: text("vault_name").notNull().default("Workshop"),
});

export const projectBackups = pgTable(
  "project_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    checksum: text("checksum").notNull(),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_backups_project_id_idx").on(table.projectId),
    index("project_backups_created_at_idx").on(table.createdAt),
  ],
);
