# Use an official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the application port
EXPOSE 8000

# Use environment variables from a .env file (optional)
# If you're using docker-compose, this is handled there

# Start the app
CMD ["npm", "start"]
