FROM oven/bun:latest

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3001

# Set the command to run the webhook server
CMD ["bun", "run", "index.ts"]
