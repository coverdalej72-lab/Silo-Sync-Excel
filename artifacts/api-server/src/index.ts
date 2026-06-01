import app from "./app";
import { logger } from "./lib/logger";
import { db, farmsTable, shedGroupsTable, silosTable } from "@workspace/db";
import { count } from "drizzle-orm";

// Prevent unhandled promise rejections from crashing the server process
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled promise rejection — keeping server alive");
});

// Prevent uncaught exceptions from crashing the server process
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — keeping server alive");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedFarmData() {
  try {
    const [{ value: groupCount }] = await db.select({ value: count() }).from(shedGroupsTable);
    if (groupCount > 0) return;

    logger.info('Seeding shed groups and silos...');

    // Get or create a default farm to satisfy the farmId foreign key
    const existingFarms = await db.select().from(farmsTable).limit(1);
    const farm = existingFarms[0] ?? (await db.insert(farmsTable).values({ name: "Default Farm" }).returning())[0];

    const sheds = [
      { farmId: farm.id, name: "Sheds 1 & 2",   displayOrder: 1  },
      { farmId: farm.id, name: "Sheds 3 & 4",   displayOrder: 2  },
      { farmId: farm.id, name: "Sheds 5 & 6",   displayOrder: 3  },
      { farmId: farm.id, name: "Sheds 7 & 8",   displayOrder: 4  },
      { farmId: farm.id, name: "Sheds 9 & 10",  displayOrder: 5  },
      { farmId: farm.id, name: "Sheds 11 & 12", displayOrder: 6  },
      { farmId: farm.id, name: "Sheds 13 & 14", displayOrder: 7  },
      { farmId: farm.id, name: "Sheds 15 & 16", displayOrder: 8  },
      { farmId: farm.id, name: "Sheds 17 & 18", displayOrder: 9  },
      { farmId: farm.id, name: "Sheds 19 & 20", displayOrder: 10 },
    ];

    const insertedGroups = await db.insert(shedGroupsTable).values(sheds).returning();

    const silos = insertedGroups.flatMap(g =>
      ["A", "B", "C"].map(letter => ({
        farmId: farm.id,
        shedGroupId: g.id,
        letter,
        name: `Silo ${letter}`,
        defaultFeedType: null,
      }))
    );
    await db.insert(silosTable).values(silos);
    logger.info(`Seeded ${insertedGroups.length} shed groups with ${silos.length} silos`);
  } catch (err) {
    logger.error({ err }, 'Failed to seed farm data — server still starting');
  }
}

// Start listening immediately so the port is open before any async init work
// Bind explicitly to 0.0.0.0 (IPv4) so the workflow health checker can reach it.
// Without this Node.js binds to :: (IPv6 wildcard) and the IPv4 monitor check fails.
const server = app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Seed farm data in the background — does not block port open
  seedFarmData().catch(err => logger.error({ err }, "Background seedFarmData failed"));
});

// Graceful shutdown — close the server on SIGTERM so the port is freed
// before the process exits. This prevents orphan-process port conflicts
// when the workflow runner restarts the service.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — closing server");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  // Force exit after 5 s if connections are still open
  setTimeout(() => process.exit(0), 5000).unref();
});
