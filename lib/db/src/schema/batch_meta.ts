import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { farmsTable } from "./farms";

export const batchMetaTable = pgTable("batch_meta", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id, { onDelete: "cascade" }),
  lastResetAt: timestamp("last_reset_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BatchMeta = typeof batchMetaTable.$inferSelect;
