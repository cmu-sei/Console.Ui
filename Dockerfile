FROM node:16-alpine as builder

COPY package.json package-lock.json ./

# Storing node modules on a separate layer will prevent unnecessary npm install at each build
RUN npm set progress=false && \
  npm config set depth 0 && \
  npm cache clean --force && \
  npm config set unsafe-perm true

RUN npm ci && mkdir -p /ng-app/dist && cp -R ./node_modules ./ng-app

WORKDIR /ng-app

COPY . .

RUN $(npm bin)/ng build --resources-output-path=assets/fonts --configuration production 

### Stage 2: Setup ###

FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN rm -rf /usr/share/nginx/html/*
COPY default.conf /etc/nginx/conf.d/default.conf
COPY scripts/nginx-basehref.sh /docker-entrypoint.d/90-basehref.sh
COPY scripts/settings-from-env.sh /docker-entrypoint.d/91-settings-from-env.sh
COPY --from=builder /ng-app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html && chmod +x /docker-entrypoint.d/90-basehref.sh && chmod +x /docker-entrypoint.d/91-settings-from-env.sh
USER nginx

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
