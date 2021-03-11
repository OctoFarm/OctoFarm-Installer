FROM node:13.0.1-stretch
WORKDIR /app

COPY . .
RUN npm ci
ENTRYPOINT ["npm", "run", "build"]
