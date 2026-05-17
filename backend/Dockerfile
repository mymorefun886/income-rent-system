FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY storage ./storage

EXPOSE 8788

CMD ["npm", "start"]
