FROM node:20-alpine
WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (need devDeps for build + tsx)
RUN npm ci --legacy-peer-deps

# Copy all source files
COPY . .

# Build the React Router app (generates build/client + build/server)
RUN npm run build

# Expose the port
EXPOSE 4015

# Set environment
ENV NODE_ENV=production
ENV PORT=4015

# Start the Hono custom server
CMD ["node", "--max-old-space-size=256", "./build/custom-server/index.js"]
