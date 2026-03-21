FROM node:20-alpine

WORKDIR /app

# Copy app files (data/ is excluded via .dockerignore — mounted as volume instead)
COPY LNL3D_Quote.html ./
COPY server.js ./

# Data directory created at runtime via volume mount
# server.js will auto-create it + empty JSON files if missing

EXPOSE 3000

CMD ["node", "server.js"]
