# Base image
FROM node:20-alpine

# Working directory inside container
WORKDIR /usr/src/app

# Copy package files first (to use Docker cache)
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy app source
COPY . .

# Expose the app port
EXPOSE 9000

# Default command (used in production)
CMD ["node", "server.js"]
