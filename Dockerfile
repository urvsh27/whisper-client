# Dockerfile
FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Install serve globally
RUN npm install -g serve

# Expose port 3000 and run the app
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]