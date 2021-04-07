FROM node as builder

COPY package.json package-lock.json ./

## Storing node modules on a separate layer will prevent unnecessary npm installs at each build
RUN npm ci && mkdir /ng-app && cp -R ./node_modules ./ng-app

WORKDIR /ng-app

COPY . .

## Build the angular app in production mode and store the artifacts in dist folder
RUN $(npm bin)/ng build --prod

### STAGE 2: Setup ###

FROM nginx

## Copy our default nginx config
COPY default.conf /etc/nginx/conf.d/

## Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

RUN chown -R nginx:nginx /usr/share/nginx/html      && \
    chown -R nginx:nginx /var/cache/nginx           && \
    chown -R nginx:nginx /var/log/nginx             && \
    chown -R nginx:nginx /etc/nginx/conf.d          && \
    sed -i '/user  nginx;/d' /etc/nginx/nginx.conf  && \
    sed -i 's,/var/run/nginx.pid,/tmp/nginx.pid,' /etc/nginx/nginx.conf

USER nginx

## From ‘builder’ stage copy over the artifacts in dist folder to default nginx public folder
COPY --from=builder /ng-app/dist /usr/share/nginx/html
COPY --from=builder /ng-app/nginx-basehref.sh /docker-entrypoint.d/90-basehref.sh

CMD ["nginx", "-g", "daemon off;"]
