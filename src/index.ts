// import { Serve } from "bun";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, userActions } from "./db/schema";
import "dotenv/config";

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
    port: process.env.PORT || 3000,

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
        try {
            // Check if we have a user address in the data
            const userAddress =
                data.userAddress ||
                data.address ||
                (data.user && data.user.address);

            console.log(`Attempting to extract user address from data...`);
            console.log(`Found address: ${userAddress || "None"}`);

            if (userAddress && typeof userAddress === "string") {
                console.log(`Processing data for user: ${userAddress}`);

                // Ensure user exists (upsert operation)
                // await db
                //     .insert(users)
                //     .values({ address: userAddress })
                //     .onConflictDoNothing({ target: users.address });

                // // Get action type and data
                // const actionType =
                //     data.actionType || data.type || "WEBHOOK_EVENT";
                // const actionData =
                //     typeof data === "object"
                //         ? JSON.stringify(data)
                //         : String(data);

                // // Insert the action
                // await db.insert(userActions).values({
                //     userAddress,
                //     actionType,
                //     actionData,
                // });

                // console.log(`Action recorded for user ${userAddress}`);
                // console.log(`Database operation successful`);
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
        const response = {
            success: true,
            receivedAt: new Date().toISOString(),
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
