#!/bin/bash

# Check if Python is installed
if command -v python3 &>/dev/null; then
  PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
  PYTHON_CMD="python"
else
  echo "Error: Python is not installed"
  exit 1
fi

# Install Python dependencies
$PYTHON_CMD -m pip install --user -r requirements.txt || echo "Warning: Could not install Python dependencies"

# Create uploads directory
mkdir -p uploads

# Try to clone OmniParser if it doesn't exist
if [ ! -d "OmniParser" ]; then
  echo "Cloning OmniParser repository..."
  if command -v git &>/dev/null; then
    git clone https://github.com/microsoft/OmniParser.git
    cd OmniParser
    $PYTHON_CMD -m pip install --user -r requirements.txt || echo "Warning: Could not install OmniParser dependencies"
    cd ..
  else
    echo "Warning: git is not installed, cannot clone OmniParser"
  fi
fi

# Start the Python service
export PORT=3000
$PYTHON_CMD app.py 