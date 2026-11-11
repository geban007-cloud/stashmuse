import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_categories_parent_sort").on(table.parentId, table.sortOrder)]
);

export const savedItems = sqliteTable(
  "saved_items",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    sourceType: text("source_type").notNull().default("favorite"),
    sourceKey: text("source_key").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    coverUrl: text("cover_url"),
    contentType: text("content_type").notNull().default("link"),
    sourceCollection: text("source_collection"),
    excerpt: text("excerpt"),
    status: text("status").notNull().default("inbox"),
    availability: text("availability").notNull().default("available"),
    categoryId: text("category_id"),
    categorySource: text("category_source").notNull().default("user"),
    tags: text("tags").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_saved_items_platform_source").on(table.platform, table.sourceKey),
    index("idx_saved_items_status_updated").on(table.status, table.updatedAt),
    index("idx_saved_items_category").on(table.categoryId),
  ]
);

export const suggestions = sqliteTable("classification_suggestions", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  categoryId: text("category_id"),
  tags: text("tags").notNull().default("[]"),
  confidence: integer("confidence").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const digests = sqliteTable(
  "digests",
  {
    id: text("id").primaryKey(),
    digestDate: text("digest_date").notNull(),
    itemIds: text("item_ids").notNull(),
    deliveryState: text("delivery_state").notNull().default("queued"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uniq_digests_date").on(table.digestDate)]
);

export const retentionEvents = sqliteTable(
  "retention_events",
  {
    id: text("id").primaryKey(),
    digestId: text("digest_id").notNull(),
    itemId: text("item_id").notNull(),
    action: text("action").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_retention_events_digest_item").on(table.digestId, table.itemId),
    index("idx_retention_events_item_created").on(table.itemId, table.createdAt),
  ]
);

export const actionPlans = sqliteTable(
  "action_plans",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    digestId: text("digest_id"),
    title: text("title").notNull(),
    steps: text("steps").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uniq_action_plans_item").on(table.itemId), index("idx_action_plans_updated").on(table.updatedAt)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
