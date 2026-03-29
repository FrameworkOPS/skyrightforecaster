FROM node:20-alpine

WORKDIR /app

# Copy backend package files
COPY skyright-forecaster/skyright-forecaster/package*.json ./

# Install ALL dependencies (including dev for TypeScript)
RUN npm install --include=dev

# Copy backend source
COPY skyright-forecaster/skyright-forecaster/ ./

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "dist/index.js"]
