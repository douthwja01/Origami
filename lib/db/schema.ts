import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  primaryKey,
  type AnyPgColumn,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
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
  "backup",
]);

export const mediaBackgroundMode = pgEnum("media_background_mode", [
  "off",
  "vault",
  "fixed",
]);

export const projectVisibility = pgEnum("project_visibility", [
  "personal",
  "team",
]);

export const teamRole = pgEnum("team_role", ["owner", "admin", "member"]);

export const projectCodeSeq = pgSequence("project_code_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_username_idx").on(table.username)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("teams_slug_idx").on(table.slug)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("team_members_user_id_idx").on(table.userId),
  ],
);

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    token: text("token").notNull().unique(),
    role: teamRole("role").notNull().default("member"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("team_invites_team_id_idx").on(table.teamId),
    index("team_invites_username_idx").on(table.username),
  ],
);

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
    mediaBackgroundMode: mediaBackgroundMode("media_background_mode")
      .notNull()
      .default("off"),
    mediaBackgroundAssetId: uuid("media_background_asset_id").references(
      (): AnyPgColumn => assets.id,
      { onDelete: "set null" },
    ),
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
    visibility: projectVisibility("visibility").notNull().default("team"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    index("projects_owner_user_id_idx").on(table.ownerUserId),
    index("projects_team_id_idx").on(table.teamId),
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
    folderPath: text("folder_path").notNull().default(""),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storagePath: text("storage_path").notNull(),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_project_id_idx").on(table.projectId),
    index("assets_project_folder_idx").on(table.projectId, table.folderPath),
    unique("assets_project_folder_filename_unique").on(
      table.projectId,
      table.folderPath,
      table.filename,
    ),
  ],
);

export const projectFolders = pgTable(
  "project_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_folders_project_id_idx").on(table.projectId),
    unique("project_folders_unique_path").on(table.projectId, table.path),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    required: boolean("required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tags_project_id_idx").on(table.projectId),
    unique("tags_project_key_unique").on(table.projectId, table.key),
  ],
);

export const assetTags = pgTable(
  "asset_tags",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.tagId] }),
    index("asset_tags_tag_id_idx").on(table.tagId),
  ],
);

export const folderTags = pgTable(
  "folder_tags",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => projectFolders.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.folderId, table.tagId] }),
    index("folder_tags_tag_id_idx").on(table.tagId),
  ],
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
  vaultLogoPath: text("vault_logo_path"),
  vaultLogoMime: text("vault_logo_mime"),
  vaultLogoHash: text("vault_logo_hash"),
  maxUploadMb: integer("max_upload_mb"),
  vaultDir: text("vault_dir"),
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
