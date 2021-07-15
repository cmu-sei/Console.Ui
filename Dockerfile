FROM node as builder

COPY package.json package-lock.json ./

## Storing node modules on a separate layer will prevent unnecessary npm installs at each build
RUN npm set progress=false && \
  npm config set depth 0 && \
  npm cache clean --force && \
  npm config set unsafe-perm true

RUN npm ci && mkdir -p /ng-app/dist && cp -R ./node_modules ./ng-app

WORKDIR /ng-app

COPY . .

## Build the angular app in production mode and store the artifacts in dist folder
RUN $(npm bin)/ng build --configuration production

### Stage 2: Setup ###

FROM nginxinc/nginx-unprivileged:stable-alpine

# Clear all original files
USER root
RUN rm -rf /usr/share/nginx/html/*
USER nginx

COPY default.conf /etc/nginx/conf.d/default.conf
COPY settings-from-env.sh /usr/local/bin
COPY nginx-basehref.sh /docker-entrypoint.d/90-basehref.sh
COPY --from=builder /ng-app/dist /usr/share/nginx/html

USER root
RUN chmod 755 /usr/local/bin/settings-from-env.sh && \
    chown nginx:nginx /usr/share/nginx/html/assets/config
USER nginx

RUN ls -lah /usr/share/nginx/html/assets

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
