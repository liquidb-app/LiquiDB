#!/bin/bash

# LiquiDB Development Script
echo "🚀 Starting LiquiDB Development Environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build Electron main process
echo "🔨 Building Electron main process..."
npm run build:electron

# Start development server
echo "🎯 Starting development server..."
npm run dev
