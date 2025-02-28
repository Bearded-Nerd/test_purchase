const { spawn } = require('child_process');
const path = require('path');

// Start the Python microservice
const pythonProcess = spawn('python', [path.join(__dirname, 'omniparser-service', 'app.py')], {
  stdio: 'inherit'
});

// Wait for the service to start
setTimeout(() => {
  // Start the Node.js application
  const nodeProcess = spawn('node', [path.join(__dirname, 'automation.js')], {
    stdio: 'inherit'
  });
  
  nodeProcess.on('close', (code) => {
    console.log(`Node.js process exited with code ${code}`);
    pythonProcess.kill();
  });
}, 2000);

// Handle process termination
process.on('SIGINT', () => {
  pythonProcess.kill();
  process.exit();
});
