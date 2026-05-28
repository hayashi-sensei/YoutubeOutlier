import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const workspaceId = process.env.SEED_WORKSPACE_ID;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

if (!workspaceId) {
  throw new Error("SEED_WORKSPACE_ID is required. Refusing to seed an implicit workspace.");
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const recommendations = [
  {
    id: `rec_${Date.now()}_1`,
    channelUrl: "https://www.youtube.com/@aiautomationlab",
    title: "AI Automation Lab",
    reason: "Audience overlap with AI agents and no-code automation.",
    relevanceScore: 0.91,
  },
  {
    id: `rec_${Date.now()}_2`,
    channelUrl: "https://www.youtube.com/@creatorbooth",
    title: "Creator Booth",
    reason: "Similar creator education format with repeatable tutorial patterns.",
    relevanceScore: 0.82,
  },
];

let client;

try {
  client = await pool.connect();

  const workspaceResult = await client.query('select id from "Workspace" where id = $1 limit 1', [workspaceId]);
  const existingWorkspaceId = workspaceResult.rows[0]?.id;

  if (!existingWorkspaceId) {
    throw new Error("No workspace found.");
  }

  const existingResult = await client.query(
    'select count(*)::int as count from "CompetitorRecommendation" where "workspaceId" = $1 and status = $2',
    [workspaceId, "NEW"],
  );
  const existingCount = existingResult.rows[0]?.count ?? 0;

  if (existingCount > 0) {
    console.log(`Recommendations already exist for ${workspaceId}`);
  } else {
    for (const recommendation of recommendations) {
      await client.query(
        `insert into "CompetitorRecommendation" ("id", "workspaceId", "channelUrl", "title", "reason", "relevanceScore", "status", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
        [
          recommendation.id,
          workspaceId,
          recommendation.channelUrl,
          recommendation.title,
          recommendation.reason,
          recommendation.relevanceScore,
          "NEW",
        ],
      );
    }

    console.log(`Seeded competitor recommendations for ${workspaceId}`);
  }
} finally {
  client?.release();
  await pool.end();
}
