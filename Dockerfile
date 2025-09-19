# Stage 1: Build the frontend
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy all files to build the CSS
COPY . .

# Build the CSS.
RUN npx @tailwindcss/cli -i tailwind.css -o style.css

# Stage 2: Run the application
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py index.html script.js favicon.ico favicon.svg ./

# Copy the built CSS from the builder stage
COPY --from=builder /app/style.css .

# Expose port 5000
EXPOSE 5000

# Start Flask application
CMD ["python", "app.py"]
