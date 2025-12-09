FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ensure static directory exists for mounted volume
RUN mkdir -p /staticfiles && chmod 755 /staticfiles

EXPOSE 80 443
