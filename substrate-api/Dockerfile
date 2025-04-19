FROM node:23-alpine

RUN apk add bash
# Create app directory
WORKDIR /opt/panic

# Change directory, and copy all substrate-api contents from the host to the
# container.
WORKDIR /opt/panic/substrate-api
COPY ./substrate-api ./

# RUN npm install
RUN npm install

# Build API
RUN npm run build

# Expose port
EXPOSE 8080

CMD ["node", "/opt/panic/substrate-api/src/server.js"]
