// import { Serve } from "bun";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, userActions } from "./db/schema";
import "dotenv/config";
import { eq } from "drizzle-orm";

// Initialize database connection
let pool: Pool;
let db: ReturnType<typeof drizzle>;

function initializeDb() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            connectionTimeoutMillis: 5000,
        });
        db = drizzle(pool);
        console.log("Database connection initialized");
    }
}

// Simple webhook server
const server = Bun.serve({
    port: process.env.PORT || 3001,

    fetch(req) {
        const url = new URL(req.url);

        // Log every incoming request
        console.log(`[${new Date().toISOString()}] Request received:`);
        console.log(`- URL: ${req.url}`);
        console.log(`- Method: ${req.method}`);
        console.log(`- Path: ${url.pathname}`);
        console.log(`- Query params: ${url.search}`);

        // Log request headers
        console.log("Request Headers:");
        req.headers.forEach((value, key) => {
            console.log(`- ${key}: ${value}`);
        });

        // Handle webhook endpoint
        if (url.pathname === "/webhook" && req.method === "POST") {
            return handleWebhook(req);
        }

        // Health check endpoint
        if (url.pathname === "/health") {
            console.log("Health check requested");
            return new Response("OK", { status: 200 });
        }

        // 404 for all other routes
        console.log(`Route not found: ${url.pathname}`);
        return new Response("Not Found", { status: 404 });
    },
});

// Handle incoming webhook data
async function handleWebhook(req: Request) {
    try {
        // Initialize DB connection if not already done
        initializeDb();

        // Log the entire request
        console.log(`Webhook Request Received:`);
        console.log(`- URL: ${req.url}`);
        console.log(`- Method: ${req.method}`);

        // Log complete request headers
        console.log("Request Headers:");
        const headerEntries: [string, string][] = [];
        req.headers.forEach((value, key) => {
            console.log(`- ${key}: ${value}`);
            headerEntries.push([key, value]);
        });

        // Parse the content type
        const contentType = req.headers.get("content-type");
        console.log(`- Content Type: ${contentType}`);

        let data: any;

        // Handle different content types
        if (contentType?.includes("application/json")) {
            // Parse JSON data
            data = await req.json();
            console.log("JSON Data Received:");
        } else if (contentType?.includes("application/x-www-form-urlencoded")) {
            // Parse form data
            const formData = await req.formData();
            data = Object.fromEntries(formData.entries());
            console.log("Form Data Received:");
        } else {
            // Read as text for other content types
            data = await req.text();
            console.log("Text Data Received:");
        }

        // Log the received data in a detailed format
        console.log(JSON.stringify(data, null, 2));

        // Process user data if available
        // Extract user address outside the try block so it's available in the response
        const userAddress =
            data.userAddress ||
            data.address ||
            (data.user && data.user.address);

        const event = data.event || data.type || "UNKNOWN_EVENT";

        const amount = data.amount || null;

        try {
            console.log(`Attempting to extract user address from data...`);
            console.log(`Found address: ${userAddress || "None"}`);
            console.log(`Found event: ${event || "None"}`);
            console.log(`Found amount: ${amount || "None"}`);

            if (userAddress && typeof userAddress === "string") {
                console.log(`Processing data for user: ${userAddress}`);

                // Get event type
                const eventType = data.event || data.type || "UNKNOWN_EVENT";
                console.log(`Processing event: ${eventType}`);

                // Ensure user exists in the database (upsert operation)
                let initialRewards = 0;
                if (eventType === "wallet_connected") {
                    // For wallet_connected, check if this is first connection
                    const existingUser = await db
                        .select()
                        .from(users)
                        .where(eq(users.address, userAddress));

                    if (existingUser.length === 0) {
                        // New user, award 1000 points for first connection
                        initialRewards = 1000;
                        console.log(
                            `New user ${userAddress} connected - awarding 1000 points`,
                        );
                    }
                }

                // Create or update the user
                await db
                    .insert(users)
                    .values({ address: userAddress, rewards: initialRewards })
                    .onConflictDoUpdate({
                        target: users.address,
                        set:
                            initialRewards > 0
                                ? { rewards: initialRewards }
                                : {},
                    });

                // Handle rewards based on event type
                if (eventType !== "wallet_connected") {
                    // Get current rewards for this user
                    const userRecord = await db
                        .select()
                        .from(users)
                        .where(eq(users.address, userAddress))
                        .then((records) => records[0]);

                    if (userRecord) {
                        const currentRewards = userRecord.rewards || 0;
                        let rewardsToAdd = 0;

                        if (eventType === "deposit_confirmed") {
                            // Handle deposit_confirmed with amount-based rewards
                            const amount = parseFloat(data.amount) || 0;

                            if (amount > 0) {
                                if (amount <= 1000) {
                                    // 10x rewards for amounts <= 1000
                                    rewardsToAdd = Math.floor(amount * 10);
                                    console.log(
                                        `Awarding ${rewardsToAdd} points (10x) for deposit of ${amount}`,
                                    );
                                } else {
                                    // 1:1 rewards for amounts > 1000
                                    rewardsToAdd = Math.floor(amount);
                                    console.log(
                                        `Awarding ${rewardsToAdd} points (1:1) for deposit of ${amount}`,
                                    );
                                }
                            }
                        }

                        // Update rewards if needed
                        if (rewardsToAdd > 0) {
                            await db
                                .update(users)
                                .set({ rewards: currentRewards + rewardsToAdd })
                                .where(eq(users.address, userAddress));
                            console.log(
                                `Awarded ${rewardsToAdd} points to ${userAddress} for ${eventType}`,
                            );
                        }
                    }
                }

                // Get action type and data
                const actionType = eventType;
                const actionData =
                    typeof data === "object"
                        ? JSON.stringify(data)
                        : String(data);

                // Insert the action
                await db.insert(userActions).values({
                    userAddress,
                    actionType,
                    actionData,
                });

                console.log(`Action recorded for user ${userAddress}`);
                console.log(`Database operation successful`);
            } else {
                console.log(
                    "No valid user address found in webhook data, skipping database insertion",
                );
                console.log(
                    `Data structure received: ${typeof data === "object" ? Object.keys(data).join(", ") : typeof data}`,
                );
            }
        } catch (dbError: any) {
            console.error("Error recording user action to database:", dbError);
            console.error("Database error details:", {
                name: dbError.name,
                message: dbError.message,
                stack: dbError.stack,
            });
            // Continue execution - we don't want to fail the webhook just because DB operations failed
        }

        // Return a success response
        console.log(`Webhook processing completed successfully`);

        // Get current rewards for the user if available
        let userRewards = 0;
        if (userAddress && typeof userAddress === "string") {
            try {
                const userResult = await db
                    .select()
                    .from(users)
                    .where(eq(users.address, userAddress));

                if (userResult.length > 0 && userResult[0]?.rewards !== null) {
                    userRewards = userResult[0]?.rewards || 0;
                }
            } catch (error) {
                console.error("Error fetching user rewards:", error);
            }
        }

        const response = {
            success: true,
            receivedAt: new Date().toISOString(),
            userRewards: userRewards,
        };
        console.log(`Sending response: ${JSON.stringify(response)}`);
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (error: any) {
        // Log and handle errors
        console.error("Error processing webhook:", error);
        console.error("Error details:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });

        return new Response(
            JSON.stringify({
                success: false,
                error: "Failed to process webhook data",
                errorDetails: error.message,
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
    }
}

console.log(
    `[${new Date().toISOString()}] Webhook server listening on http://localhost:${server.port}`,
);
console.log(`Log Level: VERBOSE - Logging all incoming requests and data`);
