const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class OmniParse {
  constructor(options = {}) {
    this.serviceUrl = options.serviceUrl || 'http://localhost:5000';
    this.browser = null;
    this.screenshotDir = options.screenshotDir || path.join(__dirname, 'temp_screenshots');
    
    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async launch(options = {}) {
    // Launch Puppeteer browser with appropriate options for Glitch
    const puppeteerOptions = {
      headless: options.headless !== false,
      slowMo: options.slowMo || 0,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    };
    
    this.browser = await puppeteer.launch(puppeteerOptions);
    
    // Check if OmniParser service is running
    try {
      await axios.get(`${this.serviceUrl}/health`);
      console.log("OmniParser service is running");
    } catch (error) {
      console.warn("Warning: OmniParser service not detected. Some features may be limited.");
    }
    
    return this;
  }

  async newPage() {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    const page = await this.browser.newPage();
    
    // Add a method to take a screenshot and analyze it
    page.analyzeScreenshot = async (options = {}) => {
      const screenshotPath = path.join(this.screenshotDir, `screenshot_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      
      try {
        const response = await axios.post(`${this.serviceUrl}/parse_screenshot`, {
          screenshot_path: screenshotPath
        });
        
        // Clean up the screenshot file if not needed
        if (!options.keepScreenshot) {
          fs.unlinkSync(screenshotPath);
        }
        
        return response.data;
      } catch (error) {
        console.error("Error analyzing screenshot:", error.message);
        return { success: false, error: error.message };
      }
    };
    
    // Add a method to find and click an element based on text or type
    page.findAndClick = async (elementType, text) => {
      const screenshotPath = path.join(this.screenshotDir, `click_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      
      try {
        const response = await axios.post(`${this.serviceUrl}/get_click_coordinates`, {
          screenshot_path: screenshotPath,
          element_type: elementType,
          text: text
        });
        
        // Clean up the screenshot
        fs.unlinkSync(screenshotPath);
        
        if (response.data.success) {
          const { x, y } = response.data.coordinates;
          await page.mouse.click(x, y);
          return true;
        } else {
          console.warn(`Could not find element of type "${elementType}" with text "${text}"`);
          return false;
        }
      } catch (error) {
        console.error("Error finding element:", error.message);
        return false;
      }
    };
    
    // Add a method to find text on the page
    page.findText = async (text) => {
      const screenshotPath = path.join(this.screenshotDir, `find_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      
      try {
        const response = await axios.post(`${this.serviceUrl}/find_element`, {
          screenshot_path: screenshotPath,
          text: text
        });
        
        // Clean up the screenshot
        fs.unlinkSync(screenshotPath);
        
        return response.data.success;
      } catch (error) {
        console.error("Error finding text:", error.message);
        return false;
      }
    };
    
    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    // Clean up any remaining screenshots
    try {
      const files = fs.readdirSync(this.screenshotDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.screenshotDir, file));
      }
    } catch (error) {
      console.error("Error cleaning up screenshots:", error.message);
    }
  }
}

module.exports = {
  launch: (options) => new OmniParse(options).launch(options)
};
