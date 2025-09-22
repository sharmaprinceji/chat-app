FROM node:20

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies
RUN npm install --include=dev

# Copy the rest of the app
COPY . .

# Expose port 9000
EXPOSE 9000

# Start the app using nodemon
CMD ["npm", "run", "dev"]
