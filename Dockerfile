FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY backend ./backend
COPY frontend ./frontend

ENV HOST=0.0.0.0
ENV PORT=8090

EXPOSE 8090

CMD ["node", "backend/server.js"]
