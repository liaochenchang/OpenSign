# Use an official Node runtime as the base image
FROM node:22.14.0

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the entire application source code
COPY . .

# Define environment variables
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false

# Build the application if build directory doesn't exist
RUN if [ ! -d "build" ]; then npm run build; fi

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run the application directly with npm start
CMD ["npm", "start"]