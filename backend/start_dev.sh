#!/bin/bash
# Quick start script for FastAPI development server

echo "🚀 Starting FastAPI Development Server..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    if [ -f .env.example ]; then
        echo "📝 Copying .env.example to .env..."
        cp .env.example .env
    else
        echo "📝 Creating .env file..."
        cat > .env << EOF
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your-openai-key
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000
EOF
    fi
    echo "✏️  Please edit .env with your API keys, then run this script again"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.11+"
    exit 1
fi

# Check if venv exists, create if not
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    echo "📥 Installing dependencies..."
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
fi

# Activate venv
source venv/bin/activate

# Check if dependencies are installed
if ! python -c "import fastapi" &> /dev/null; then
    echo "📦 Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
fi

# Start server
echo "✅ Starting server on http://localhost:8001"
echo "📚 API docs available at http://localhost:8001/docs"
echo "🛑 Press Ctrl+C to stop"
echo ""

python -m uvicorn main:app --reload --port 8001 --log-level warning --no-access-log --timeout-keep-alive 360

