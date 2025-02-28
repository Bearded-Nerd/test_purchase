from flask import Flask, request, jsonify, send_from_directory, render_template_string
import sys
import os
import json
import base64
from PIL import Image
import io
import traceback

# Create a simplified version of OmniParser for web automation
# This will work even if the full OmniParser isn't available
class SimplifiedParser:
    def __init__(self):
        # Try to import the real OmniParser if available
        try:
            sys.path.append('./OmniParser')
            from omni.parser import Parser
            self.parser = Parser()
            self.using_real_parser = True
        except ImportError:
            # Fall back to simplified version
            self.using_real_parser = False
            print("Using simplified parser (OmniParser not found)")
    
    def parse(self, screenshot_path):
        if self.using_real_parser:
            return self.parser.parse(screenshot_path)
        else:
            # Simplified parsing using PIL for basic element detection
            # This is a fallback when OmniParser isn't available
            try:
                from PIL import Image
                img = Image.open(screenshot_path)
                # Return a simplified structure with basic image info
                return [{
                    'type': 'image',
                    'text': '',
                    'bounding_box': {
                        'x1': 0, 'y1': 0, 
                        'x2': img.width, 'y2': img.height
                    },
                    'attributes': {'width': img.width, 'height': img.height}
                }]
            except Exception as e:
                print(f"Error in simplified parsing: {str(e)}")
                return []

    def find_elements(self, screenshot_path, element_type=None, text=None):
        elements = self.parse(screenshot_path)
        
        # Filter elements based on criteria
        if element_type or text:
            filtered = []
            for element in elements:
                type_match = not element_type or element.get('type') == element_type
                text_match = not text or (element.get('text') and text in element.get('text'))
                if type_match and text_match:
                    filtered.append(element)
            return filtered
        return elements

app = Flask(__name__)

# Simple HTML page for testing
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>OmniParser Service</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <div class="container">
        <h1>OmniParser Service</h1>
        
        <div class="status-box success">
            <p>Service is running</p>
        </div>
        
        <div class="section">
            <h2>Upload Screenshot for Analysis</h2>
            <form id="uploadForm" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="screenshot">Screenshot:</label>
                    <input type="file" id="screenshot" name="screenshot" accept="image/*">
                </div>
                <button type="submit" class="btn">Analyze Screenshot</button>
            </form>
        </div>
        
        <div class="section">
            <h2>Results</h2>
            <div id="results">
                <p>No results yet</p>
            </div>
        </div>
    </div>
    
    <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData();
            const fileInput = document.getElementById('screenshot');
            
            if (fileInput.files.length === 0) {
                alert('Please select a file');
                return;
            }
            
            formData.append('file', fileInput.files[0]);
            
            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const resultsDiv = document.getElementById('results');
                    
                    let html = '<h3>Detected Elements:</h3>';
                    html += '<pre>' + JSON.stringify(result.elements, null, 2) + '</pre>';
                    
                    resultsDiv.innerHTML = html;
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error uploading file');
            }
        });
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "No file part"
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "No selected file"
            }), 400
        
        # Save the uploaded file
        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        filepath = os.path.join(upload_dir, file.filename)
        file.save(filepath)
        
        # Initialize the parser
        parser = SimplifiedParser()
        
        # Parse the screenshot
        elements = parser.parse(filepath)
        
        # Convert elements to serializable format
        serializable_elements = []
        for element in elements:
            if hasattr(element, 'to_dict'):
                # For real OmniParser elements
                serializable_elements.append(element.to_dict())
            else:
                # For our simplified elements
                serializable_elements.append(element)
        
        return jsonify({
            "success": True,
            "elements": serializable_elements,
            "filename": file.filename
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/find_element', methods=['POST'])
def find_element():
    try:
        data = request.json
        screenshot_path = data.get('screenshot_path')
        element_type = data.get('element_type')
        text = data.get('text')
        
        if not screenshot_path or not os.path.exists(screenshot_path):
            return jsonify({
                "success": False,
                "error": f"Screenshot not found at path: {screenshot_path}"
            }), 400
        
        # Initialize the parser
        parser = SimplifiedParser()
        
        # Find elements matching criteria
        elements = parser.find_elements(screenshot_path, element_type, text)
        
        if not elements:
            return jsonify({
                "success": False,
                "error": "No matching elements found"
            }), 404
        
        # Get the first matching element
        element = elements[0]
        
        # Calculate click coordinates
        if hasattr(element, 'bounding_box'):
            # For real OmniParser elements
            bbox = element.bounding_box
            x = (bbox.x1 + bbox.x2) / 2
            y = (bbox.y1 + bbox.y2) / 2
        else:
            # For our simplified elements
            bbox = element.get('bounding_box', {})
            x = (bbox.get('x1', 0) + bbox.get('x2', 100)) / 2
            y = (bbox.get('y1', 0) + bbox.get('y2', 100)) / 2
        
        return jsonify({
            "success": True,
            "coordinates": {"x": x, "y": y}
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# For Glitch compatibility
if __name__ == '__main__':
    # Get port from environment variable (Glitch sets this)
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
