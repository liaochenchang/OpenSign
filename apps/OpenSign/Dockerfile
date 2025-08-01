# Use an official Node runtime as the base image
FROM node:22.14.0

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the application source code
COPY . .

# Copy entrypoint.sh and make it executable
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Define environment variables
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false

# Build the application (it's already built, but this ensures it's fresh)
RUN npm run build

# Inject env.js loader into index.html
RUN sed -i '/<head>/a\<script src="/env.js"></script>' build/index.html

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Use entrypoint script
ENTRYPOINT ["./entrypoint.sh"]

# Run the application
CMD ["npm", "start"]