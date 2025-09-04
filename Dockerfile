# --- Stage 1: Build the React Client ---
FROM node:18-alpine AS client-builder
WORKDIR /client
COPY ./client/package.json ./
RUN npm install
COPY ./client ./
RUN npm run build

# --- Stage 2: Build and Run the Django Server ---
FROM python:3.10-slim
WORKDIR /server
COPY --from=client-builder /client/build ./client/build
COPY ./server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ./server ./
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "intelliHunt.wsgi:application"]