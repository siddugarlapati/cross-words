# Stage 1: Build the React application
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install dependencies cleanly
RUN npm ci

# Copy all source files
COPY . .

# Run production build
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine

# Copy the custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
