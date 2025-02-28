from flask import Flask, request, jsonify
import sys
import os
import json
import base64
from PIL import Image
import io

# Add OmniParser to the Python path
sys.path.append('./OmniParser')

# Import OmniParser modules
from omni.parser import Parser

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/parse_screenshot', methods=['POST'])
def parse_screenshot():
    try:
        data = request.json
        screenshot_path = data.get('screenshot_path')
        
        # Initialize the parser
        parser = Parser()
        
        # Parse the screenshot
        elements = parser.parse(screenshot_path)
        
        # Convert elements to serializable format
        serializable_elements = []
        for element in elements:
            serializable_elements.append({
                'type': element.type,
                'text': element.text,
                'bounding_box': element.bounding_box.to_dict() if hasattr(element, 'bounding_box') else None,
                'attributes': element.attributes
            })
        
        return jsonify({
            "success": True,
            "elements": serializable_elements
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/interact', methods=['POST'])
def interact():
    try:
        data = request.json
        screenshot_path = data.get('screenshot_path')
        action = data.get('action')
        selector = data.get('selector')
        
        # Initialize the parser
        parser = Parser()
        
        # Parse the screenshot
        elements = parser.parse(screenshot_path)
        
        # Find the element based on the selector
        target_element = None
        for element in elements:
            if selector.get('type') and element.type == selector.get('type'):
                if selector.get('text') and element.text == selector.get('text'):
                    target_element = element
                    break
        
        if not target_element:
            return jsonify({
                "success": False,
                "error": "Element not found"
            }), 404
        
        # Perform the action
        result = None
        if action == 'click':
            # Simulate a click by returning the coordinates
            if hasattr(target_element, 'bounding_box'):
                x = (target_element.bounding_box.x1 + target_element.bounding_box.x2) / 2
                y = (target_element.bounding_box.y1 + target_element.bounding_box.y2) / 2
                result = {"x": x, "y": y}
        
        return jsonify({
            "success": True,
            "result": result
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
