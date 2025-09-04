// import { Serve } from "bun";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, userActions, chainRewards } from "./db/schema";
import "dotenv/config";
import { eq, and } from "drizzle-orm";

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

        // Get user details endpoint
        if (url.pathname.startsWith("/users") && req.method === "GET") {
            return handleGetUsers(req);
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
// Handle get users request
async function handleGetUsers(req: Request) {
    try {
        initializeDb();
        const url = new URL(req.url);
        const userAddress = url.pathname.split("/").pop();

        // Get specific user if address is provided
        if (userAddress && userAddress !== "users") {
            const userData = await db
                .select()
                .from(users)
                .where(eq(users.address, userAddress));

            if (userData.length === 0) {
                return new Response(
                    JSON.stringify({ error: "User not found" }),
                    {
                        status: 404,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }

            // Get user's chain rewards if available
            const userChainRewards = await db
                .select()
                .from(chainRewards)
                .where(eq(chainRewards.userAddress, userAddress));

            // Get user's actions if available
            const userActionsData = await db
                .select()
                .from(userActions)
                .where(eq(userActions.userAddress, userAddress));

            // Combine all user data
            const response = {
                user: userData[0],
                chainRewards: userChainRewards,
                actions: userActionsData,
            };

            return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Get all users if no specific address is provided
        const allUsers = await db.select().from(users);
        return new Response(JSON.stringify(allUsers), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error retrieving user data:", error);
        return new Response(
            JSON.stringify({ error: "Failed to retrieve user data" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
}

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
        const chainId = data.chainId || data.chain_id || "0"; // Default to Ethereum mainnet if not specified

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
                // Handle rewards based on event type
                if (eventType === "wallet_connected") {
                    // Check if user already exists to determine if this is first connection
                    const existingUser = await db
                        .select()
                        .from(users)
                        .where(eq(users.address, userAddress));
                    const isNewUser = existingUser.length === 0;

                    // Check if chain rewards exist for this chain
                    const existingChainReward = await db
                        .select()
                        .from(chainRewards)
                        .where(
                            and(
                                eq(chainRewards.userAddress, userAddress),
                                eq(chainRewards.chainId, chainId),
                            ),
                        );
                    const isNewChain = existingChainReward.length === 0;

                    // Check if wallet_connected event has been recorded for this user (regardless of chain)
                    const walletConnectedExists = await db
                        .select()
                        .from(userActions)
                        .where(
                            and(
                                eq(userActions.userAddress, userAddress),
                                eq(userActions.actionType, "wallet_connected"),
                            ),
                        );

                    const isFirstConnection =
                        walletConnectedExists.length === 0;

                    if (isFirstConnection) {
                        // First wallet connection ever, award 1000 points
                        initialRewards = 1000;
                        console.log(
                            `First-time wallet connection for user ${userAddress} - awarding 1000 points (chain: ${chainId})`,
                        );
                    } else {
                        console.log(
                            `User ${userAddress} has already connected wallet before - no rewards (chain: ${chainId})`,
                        );
                    }
                }

                // Create or update the user
                await db
                    .insert(users)
                    .values({ address: userAddress })
                    .onConflictDoNothing({ target: users.address });

                // Create or update chain-specific rewards
                if (initialRewards > 0) {
                    // Check if chain rewards already exist for this user and chain
                    const existingChainReward = await db
                        .select()
                        .from(chainRewards)
                        .where(
                            and(
                                eq(chainRewards.userAddress, userAddress),
                                eq(chainRewards.chainId, chainId),
                            ),
                        );

                    if (existingChainReward.length > 0) {
                        // Update existing record with rewards
                        await db
                            .update(chainRewards)
                            .set({ rewards: initialRewards })
                            .where(
                                eq(
                                    chainRewards.id,
                                    existingChainReward[0]?.id || 0,
                                ),
                            );
                        console.log(
                            `Updated rewards for existing chain record: ${initialRewards}`,
                        );
                    } else {
                        // Insert new record
                        await db.insert(chainRewards).values({
                            userAddress,
                            chainId,
                            rewards: initialRewards,
                        });
                        console.log(
                            `Inserted new chain record with rewards: ${initialRewards}`,
                        );
                    }
                } else {
                    // Check if chain rewards already exist for this user and chain
                    const existingChainReward = await db
                        .select()
                        .from(chainRewards)
                        .where(
                            and(
                                eq(chainRewards.userAddress, userAddress),
                                eq(chainRewards.chainId, chainId),
                            ),
                        );

                    if (existingChainReward.length === 0) {
                        // Only insert if it doesn't exist yet
                        await db.insert(chainRewards).values({
                            userAddress,
                            chainId,
                            rewards: 0,
                        });
                        console.log(
                            `Inserted new chain record with zero rewards`,
                        );
                    }
                }

                // Handle rewards based on event type
                if (eventType !== "wallet_connected") {
                    // Get current chain-specific rewards for this user
                    const chainRecord = await db
                        .select()
                        .from(chainRewards)
                        .where(
                            and(
                                eq(chainRewards.userAddress, userAddress),
                                eq(chainRewards.chainId, chainId),
                            ),
                        )
                        .then((records) => records[0]);

                    if (chainRecord) {
                        const currentRewards = chainRecord.rewards || 0;
                        let rewardsToAdd = 0;

                        if (eventType === "deposit_confirmed") {
                            // Handle deposit_confirmed with amount-based rewards
                            let amount = 0;
                            const txHash =
                                data.txHash ||
                                data.hash ||
                                data.transactionHash ||
                                null;

                            // Try to parse amount from different possible formats
                            if (data.amount) {
                                // Handle both numeric and string values
                                if (typeof data.amount === "number") {
                                    amount = data.amount;
                                } else if (typeof data.amount === "string") {
                                    // Remove any non-numeric characters except decimal point
                                    const cleanedAmount = data.amount.replace(
                                        /[^\d.-]/g,
                                        "",
                                    );
                                    amount = parseFloat(cleanedAmount) || 0;
                                }
                            }

                            console.log(`Parsed deposit amount: ${amount}`);
                            console.log(
                                `Transaction hash: ${txHash || "None"}`,
                            );

                            // Check if this is the same transaction hash as the last one
                            let isDuplicateTransaction = false;
                            if (txHash) {
                                // Check if this hash matches chain record's lastTxHash
                                if (chainRecord.lastTxHash === txHash) {
                                    console.log(
                                        `Transaction ${txHash} already processed for user ${userAddress} on chain ${chainId} - skipping reward`,
                                    );
                                    isDuplicateTransaction = true;
                                } else {
                                    // Update the chain record's lastTxHash
                                    const existingRecord = await db
                                        .select()
                                        .from(chainRewards)
                                        .where(
                                            and(
                                                eq(
                                                    chainRewards.userAddress,
                                                    userAddress,
                                                ),
                                                eq(
                                                    chainRewards.chainId,
                                                    chainId,
                                                ),
                                            ),
                                        );

                                    if (existingRecord.length > 0) {
                                        await db
                                            .update(chainRewards)
                                            .set({ lastTxHash: txHash })
                                            .where(
                                                eq(
                                                    chainRewards.id,
                                                    existingRecord[0]?.id || 0,
                                                ),
                                            );
                                    }
                                    console.log(
                                        `Updated lastTxHash to ${txHash} for user ${userAddress} on chain ${chainId}`,
                                    );
                                }
                            } else {
                                console.log(
                                    `No transaction hash provided - proceeding with caution`,
                                );
                            }

                            // Only award rewards for new transactions or if no hash was provided
                            if (
                                (!isDuplicateTransaction || !txHash) &&
                                amount > 0
                            ) {
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

                        // Update chain-specific rewards if needed
                        if (rewardsToAdd > 0) {
                            const chainRecordToUpdate = await db
                                .select()
                                .from(chainRewards)
                                .where(
                                    and(
                                        eq(
                                            chainRewards.userAddress,
                                            userAddress,
                                        ),
                                        eq(chainRewards.chainId, chainId),
                                    ),
                                );

                            if (chainRecordToUpdate.length > 0) {
                                await db
                                    .update(chainRewards)
                                    .set({
                                        rewards: currentRewards + rewardsToAdd,
                                    })
                                    .where(
                                        eq(
                                            chainRewards.id,
                                            chainRecordToUpdate[0]?.id || 0,
                                        ),
                                    );
                            }

                            // Also update total rewards in the users table
                            // Get all chain rewards for this user
                            const allChainRewards = await db
                                .select({ rewards: chainRewards.rewards })
                                .from(chainRewards)
                                .where(
                                    eq(chainRewards.userAddress, userAddress),
                                );

                            // Sum up all chain rewards
                            const totalRewards = allChainRewards.reduce(
                                (sum, record) => sum + (record.rewards || 0),
                                0,
                            );

                            // Update the total in users table
                            await db
                                .update(users)
                                .set({ rewards: totalRewards })
                                .where(eq(users.address, userAddress));

                            console.log(
                                `Awarded ${rewardsToAdd} points to ${userAddress} on chain ${chainId} for ${eventType}`,
                            );
                            console.log(
                                `Updated total rewards to ${totalRewards}`,
                            );
                        }
                    }
                }

                // Get action type and data
                const actionType = eventType;
                const actionData =
                    typeof data === "object"
                        ? JSON.stringify({ ...data, chainId }) // Ensure chainId is included in action data
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
        let chainRewardsValue = 0;

        if (userAddress && typeof userAddress === "string") {
            try {
                // Get total rewards
                const userResult = await db
                    .select()
                    .from(users)
                    .where(eq(users.address, userAddress));

                if (userResult.length > 0 && userResult[0]?.rewards !== null) {
                    userRewards = userResult[0]?.rewards || 0;
                    console.log(
                        `Current total rewards for ${userAddress}: ${userRewards}`,
                    );
                }

                // Get chain-specific rewards
                const chainResult = await db
                    .select()
                    .from(chainRewards)
                    .where(
                        and(
                            eq(chainRewards.userAddress, userAddress),
                            eq(chainRewards.chainId, chainId),
                        ),
                    );

                if (
                    chainResult.length > 0 &&
                    chainResult[0]?.rewards !== null
                ) {
                    chainRewardsValue = chainResult[0]?.rewards || 0;
                    console.log(
                        `Current chain ${chainId} rewards for ${userAddress}: ${chainRewardsValue}`,
                    );
                }
            } catch (error) {
                console.error("Error fetching user rewards:", error);
            }
        }

        const response = {
            success: true,
            receivedAt: new Date().toISOString(),
            userAddress: userAddress || null,
            eventType: event,
            chainId: chainId,
            txHash: data.txHash || data.hash || data.transactionHash || null,
            totalRewards: userRewards,
            chainRewards: chainRewardsValue,
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
