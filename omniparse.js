const axios = require('axios');
const puppeteer = require('puppeteer');

class OmniParse {
  constructor(options = {}) {
    this.serviceUrl = options.serviceUrl || 'http://localhost:5000';
    this.browser = null;
  }

  async launch(options = {}) {
    // Launch Puppeteer browser
    this.browser = await puppeteer.launch({
      headless: options.headless !== false,
      slowMo: options.slowMo || 0
    });
    
    // Check if OmniParser service is running
    try {
      await axios.get(`${this.serviceUrl}/health`);
    } catch (error) {
      throw new Error('OmniParser service is not running. Please start the service first.');
    }
    
    return this;
  }

  async newPage() {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    const page = await this.browser.newPage();
    
    // Extend the page with OmniParser functionality
    page.parseScreenshot = async (screenshotPath) => {
      const response = await axios.post(`${this.serviceUrl}/parse_screenshot`, {
        screenshot_path: screenshotPath
      });
      
      return response.data;
    };
    
    page.findAndClick = async (screenshotPath, selector) => {
      const response = await axios.post(`${this.serviceUrl}/interact`, {
        screenshot_path: screenshotPath,
        action: 'click',
        selector: selector
      });
      
      if (response.data.success && response.data.result) {
        await page.mouse.click(response.data.result.x, response.data.result.y);
      }
      
      return response.data;
    };
    
    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = {
  launch: (options) => new OmniParse(options).launch(options)
};
