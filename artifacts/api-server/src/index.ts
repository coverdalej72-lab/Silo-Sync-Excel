import app from "./app";
import { logger } from "./lib/logger";
import { db, shedGroupsTable, silosTable } from "@workspace/db";
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
    const sheds = [
      { name: "Sheds 1 & 2",   displayOrder: 1  },
      { name: "Sheds 3 & 4",   displayOrder: 2  },
      { name: "Sheds 5 & 6",   displayOrder: 3  },
      { name: "Sheds 7 & 8",   displayOrder: 4  },
      { name: "Sheds 9 & 10",  displayOrder: 5  },
      { name: "Sheds 11 & 12", displayOrder: 6  },
      { name: "Sheds 13 & 14", displayOrder: 7  },
      { name: "Sheds 15 & 16", displayOrder: 8  },
      { name: "Sheds 17 & 18", displayOrder: 9  },
      { name: "Sheds 19 & 20", displayOrder: 10 },
    ];

    const insertedGroups = await db.insert(shedGroupsTable).values(sheds).returning();

    const silos = insertedGroups.flatMap(g =>
      ["A", "B", "C"].map(letter => ({
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
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Seed farm data in the background — does not block port open
  seedFarmData().catch(err => logger.error({ err }, "Background seedFarmData failed"));
});
