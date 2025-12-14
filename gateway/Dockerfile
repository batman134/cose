FROM nginx:alpine

# Remove default configs to prevent interference
RUN rm -rf /etc/nginx/conf.d /docker-entrypoint.d

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
