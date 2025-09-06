# # --- Stage 1: Build the React Client ---
# FROM node:20-alpine AS client-builder
# WORKDIR /client/intellihunt
# COPY ./client/intellihunt/package.json ./
# RUN npm install
# COPY ./client/intellihunt ./
# RUN npm run build

# # --- Stage 2: Build and Run the Django Server ---
# FROM python:3.10-slim
# WORKDIR /server
# ENV PYTHONPATH=/server

# # Copy the required directories from your project
# # Paths are relative to the Docker build context (your repo root)
# COPY --from=client-builder /client/intellihunt/.next/build ./client/intellihunt/.next/build
# COPY ./server/requirements.txt ./requirements.txt
# COPY ./server/intelliHunt/crew ./crew

# RUN pip install --no-cache-dir -r requirements.txt

# # Copy the rest of the server code
# COPY ./server/ ./

# EXPOSE 8000
# # Change the CMD to specify the full path to the WSGI file
# CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "intelliHunt.wsgi:application"]

# --- Stage 1: Build the Next.js Client ---
FROM node:20-alpine AS client-builder
WORKDIR /app/client/intellihunt
COPY ./client/intellihunt/package.json ./client/intellihunt/package-lock.json* ./
RUN npm install
COPY ./client/intellihunt .
RUN npm run build
RUN ls -la /app/client/intellihunt/.next/standalone || echo "Standalone build not found"
RUN ls -la /app/client/intellihunt/.next/static || echo "Static directory not found"

# --- Stage 2: Run Django ---
FROM python:3.10-slim AS django
WORKDIR /app
ENV PYTHONPATH=/app/server
COPY ./server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt
COPY ./server /app/server
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "intelliHunt.wsgi:application"]

# --- Stage 3: Run the Next.js Frontend ---
FROM node:20-alpine AS nextjs
WORKDIR /app
# Copy standalone build and static assets from the client-builder stage
COPY --from=client-builder /app/client/intellihunt/.next/standalone ./
# Copy the public directory if it exists, as it's needed for assets
COPY --from=client-builder /app/client/intellihunt/public ./public
# Copy the static assets
COPY --from=client-builder /app/client/intellihunt/.next/static ./.next/static
EXPOSE 3000
ENV NODE_ENV=production
# The standalone output includes all necessary files, so we can run it directly.
CMD ["node", "server.js"]