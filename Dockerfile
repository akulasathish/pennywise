# Use official Node.js runtime as parent image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (default to 3000, customizable via Env Var)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "server.js"]
