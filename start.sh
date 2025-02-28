#!/bin/bash

# Install Python dependencies
cd omniparser-service
pip install -r requirements.txt

# Try to clone OmniParser if it doesn't exist
if [ ! -d "OmniParser" ]; then
  echo "Cloning OmniParser repository..."
  git clone https://github.com/microsoft/OmniParser.git
  cd OmniParser
  pip install -r requirements.txt
  cd ..
fi

# Start the Python service in the background
python app.py &
PYTHON_PID=$!

# Go back to the main directory
cd ..

# Install Node.js dependencies
npm install

# Start the Node.js application
node automation.js

# When Node.js exits, kill the Python process
kill $PYTHON_PID 