import {
  bigint,
  date,
  index,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("assets_project_id_idx").on(table.projectId)],
);
