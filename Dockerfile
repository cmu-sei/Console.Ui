FROM node as builder

COPY package.json package-lock.json ./

## Storing node modules on a separate layer will prevent unnecessary npm installs at each build
RUN npm set progress=false && \
  npm config set depth 0 && \
  npm cache clean --force && \
  npm config set unsafe-perm true

RUN npm ci && mkdir /ng-app && cp -R ./node_modules ./ng-app

WORKDIR /ng-app

COPY . .

## Build the angular app in production mode and store the artifacts in dist folder
RUN $(npm bin)/ng build --prod

### Stage 2: Setup ###

FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN rm -rf /usr/share/nginx/html/*
USER nginx

COPY default.conf /etc/nginx/conf.d/default.conf
COPY nginx-basehref.sh /docker-entrypoint.d/90-basehref.sh
COPY --from=builder /ng-app/dist /usr/share/nginx/html

EXPOSE 8080

ENTRYPOINT ["nginx", "-g", "daemon off;"]