from flask import Flask, request, jsonify
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

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "version": "1.0"})

@app.route('/parse_screenshot', methods=['POST'])
def parse_screenshot():
    try:
        data = request.json
        screenshot_path = data.get('screenshot_path')
        
        if not screenshot_path or not os.path.exists(screenshot_path):
            return jsonify({
                "success": False,
                "error": f"Screenshot not found at path: {screenshot_path}"
            }), 400
        
        # Initialize the parser
        parser = SimplifiedParser()
        
        # Parse the screenshot
        elements = parser.parse(screenshot_path)
        
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
            "elements": serializable_elements
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
        element_type = data.get('element_type')  # button, link, input, etc.
        text = data.get('text')  # Text content to search for
        
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
        
        # Return the first matching element
        element = elements[0]
        if hasattr(element, 'to_dict'):
            element_data = element.to_dict()
        else:
            element_data = element
            
        return jsonify({
            "success": True,
            "element": element_data
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/get_click_coordinates', methods=['POST'])
def get_click_coordinates():
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
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
