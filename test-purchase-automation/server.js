const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(bodyParser.json());

// Serve static files
app.use(express.static('public'));

// Serve screenshots
app.use('/screenshots', express.static('screenshots'));

// Create directories for screenshots
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// API endpoint to run a test purchase
app.post('/api/run-test', async (req, res) => {
  const {
    landingPageUrl,
    customerInfo,
    paymentInfo,
    submitOrder = false,
    headless = true,
    omniparserUrl
  } = req.body;
  
  // Generate a unique ID for this test run
  const testId = Date.now().toString();
  const testScreenshotsDir = path.join(screenshotsDir, testId);
  fs.mkdirSync(testScreenshotsDir, { recursive: true });
  
  console.log(`Starting test purchase for: ${landingPageUrl}`);
  
  let browser;
  let page;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: headless === 'true',
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
    });
    
    page = await browser.newPage();
    
    // Set viewport to desktop size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to landing page
    console.log("Navigating to landing page...");
    await page.goto(landingPageUrl, { waitUntil: 'networkidle2' });
    
    // Take screenshot of landing page
    const landingPageScreenshot = path.join(testScreenshotsDir, 'landing_page.png');
    await page.screenshot({ path: landingPageScreenshot });
    
    // Check for and handle quiz (if present)
    const hasQuiz = await checkForQuiz(page);
    if (hasQuiz) {
      console.log("Quiz detected - completing with random answers...");
      await completeQuizRandomly(page);
      await page.screenshot({ path: path.join(testScreenshotsDir, 'quiz_completed.png') });
    }
    
    // Look for and click main CTA button
    await clickMainCTA(page, omniparserUrl, landingPageScreenshot);
    
    // Handle checkout form
    console.log("Filling checkout form...");
    await fillCheckoutForm(page, customerInfo);
    await page.screenshot({ path: path.join(testScreenshotsDir, 'checkout_filled.png') });
    
    // Handle payment
    console.log("Entering payment details...");
    await enterPaymentDetails(page, paymentInfo);
    await page.screenshot({ path: path.join(testScreenshotsDir, 'payment_entered.png') });
    
    // Submit order (but don't actually complete if it's just a test)
    if (submitOrder === 'true') {
      console.log("Submitting order...");
      await submitOrderAction(page);
      await page.screenshot({ path: path.join(testScreenshotsDir, 'order_submitted.png') });
    }
    
    // Capture order confirmation or error
    const orderResult = await captureOrderResult(page);
    console.log("Test purchase result:", orderResult);
    
    // Return success response
    res.json({
      success: true,
      orderResult,
      screenshotsPath: `/screenshots/${testId}`
    });
  } catch (error) {
    console.error("Error during test purchase:", error);
    
    // Take screenshot of error state
    if (page) {
      try {
        await page.screenshot({ path: path.join(testScreenshotsDir, 'error_state.png') });
      } catch (e) {
        console.error("Could not take error screenshot:", e);
      }
    }
    
    res.json({
      success: false,
      error: error.message,
      screenshotsPath: `/screenshots/${testId}`
    });
  } finally {
    // Close browser
    if (browser) {
      await browser.close();
    }
  }
});

// Helper function to check for quiz
async function checkForQuiz(page) {
  // Common quiz indicators
  const quizSelectors = [
    '.quiz-container',
    '.quiz-question',
    'form.quiz',
    'div[id*="quiz"]',
    'div[class*="quiz"]',
    'h2:contains("Quiz")',
    'h3:contains("Quiz")'
  ];
  
  for (const selector of quizSelectors) {
    try {
      const quizElement = await page.$(selector);
      if (quizElement) {
        return true;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  return false;
}

// Helper function to complete quiz with random answers
async function completeQuizRandomly(page) {
  // Look for radio buttons or checkboxes
  const inputSelectors = [
    'input[type="radio"]',
    'input[type="checkbox"]'
  ];
  
  for (const selector of inputSelectors) {
    try {
      const inputs = await page.$$(selector);
      if (inputs.length > 0) {
        // Select a random input from each group
        const groups = {};
        
        for (const input of inputs) {
          const name = await page.evaluate(el => el.name, input);
          if (!groups[name]) {
            groups[name] = [];
          }
          groups[name].push(input);
        }
        
        // Select one option from each group
        for (const groupName in groups) {
          const group = groups[groupName];
          const randomIndex = Math.floor(Math.random() * group.length);
          await group[randomIndex].click();
        }
      }
    } catch (e) {
      console.error("Error selecting quiz options:", e);
    }
  }
  
  // Look for and click continue/next/submit button
  const buttonSelectors = [
    'button:contains("Continue")',
    'button:contains("Next")',
    'button:contains("Submit")',
    'button[type="submit"]',
    'input[type="submit"]'
  ];
  
  for (const selector of buttonSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        return;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
}

// Helper function to click main CTA button
async function clickMainCTA(page, omniparserUrl, screenshotPath) {
  console.log("Looking for main CTA button...");
  
  // Try using OmniParser to find and click the button if URL is provided
  if (omniparserUrl && screenshotPath) {
    try {
      console.log("Using OmniParser to find CTA button...");
      
      // Upload screenshot to OmniParser
      const formData = new FormData();
      formData.append('file', fs.createReadStream(screenshotPath));
      
      const response = await axios.post(`${omniparserUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        // Look for button elements in the parsed result
        const elements = response.data.elements;
        const buttonElements = elements.filter(el => 
          (el.type === 'button' || el.tag_name === 'button') && 
          (el.text && ['get started', 'continue', 'add to cart', 'buy now'].includes(el.text.toLowerCase()))
        );
        
        if (buttonElements.length > 0) {
          const button = buttonElements[0];
          const bbox = button.bounding_box;
          
          // Calculate center coordinates
          const x = (bbox.x1 + bbox.x2) / 2;
          const y = (bbox.y1 + bbox.y2) / 2;
          
          // Click at these coordinates
          await page.mouse.click(x, y);
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
          console.log("Clicked CTA button using OmniParser");
          return;
        }
      }
    } catch (error) {
      console.error("Error using OmniParser:", error.message);
      // Fall back to traditional selectors
    }
  }
  
  // Fall back to traditional selectors
  const ctaSelectors = [
    'button:contains("Get Started")',
    'button:contains("Continue")',
    'button:contains("Add to Cart")',
    'button:contains("Buy Now")',
    'a.btn:contains("Get Started")',
    'a.btn:contains("Continue")',
    'a.btn:contains("Add to Cart")',
    'a.btn:contains("Buy Now")',
    'button.cta',
    'a.cta',
    'button.btn-primary',
    'a.btn-primary'
  ];
  
  for (const selector of ctaSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        
        // Wait for page transition
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        return;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  throw new Error("Could not find main CTA button");
}

// Helper function to fill checkout form
async function fillCheckoutForm(page, customerInfo) {
  // Common field selectors
  const fieldMappings = {
    firstName: ['input[name="firstName"]', 'input[id="firstName"]', 'input[name="first_name"]', 'input[id="first_name"]'],
    lastName: ['input[name="lastName"]', 'input[id="lastName"]', 'input[name="last_name"]', 'input[id="last_name"]'],
    email: ['input[name="email"]', 'input[id="email"]', 'input[type="email"]'],
    phone: ['input[name="phone"]', 'input[id="phone"]', 'input[name="phoneNumber"]', 'input[id="phoneNumber"]', 'input[name="phone_number"]'],
    address1: ['input[name="address1"]', 'input[id="address1"]', 'input[name="address"]', 'input[id="address"]', 'input[name="street_address"]'],
    city: ['input[name="city"]', 'input[id="city"]'],
    state: ['input[name="state"]', 'input[id="state"]', 'select[name="state"]', 'select[id="state"]'],
    zipCode: ['input[name="zipCode"]', 'input[id="zipCode"]', 'input[name="zip"]', 'input[id="zip"]', 'input[name="postal_code"]'],
    country: ['input[name="country"]', 'input[id="country"]', 'select[name="country"]', 'select[id="country"]']
  };
  
  // Fill each field
  for (const [field, selectors] of Object.entries(fieldMappings)) {
    if (customerInfo[field]) {
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            // Check if it's a select element
            const tagName = await page.evaluate(el => el.tagName.toLowerCase(), element);
            
            if (tagName === 'select') {
              await page.select(selector, customerInfo[field]);
            } else {
              await page.type(selector, customerInfo[field]);
            }
            break;
          }
        } catch (e) {
          // Try next selector
          continue;
        }
      }
    }
  }
  
  // Look for and click continue/next button
  const continueSelectors = [
    'button:contains("Continue")',
    'button:contains("Next")',
    'button:contains("Proceed")',
    'button[type="submit"]',
    'input[type="submit"]',
    'a.btn:contains("Continue")'
  ];
  
  for (const selector of continueSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        break;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
}

// Helper function to enter payment details
async function enterPaymentDetails(page, paymentInfo) {
  // Common payment field selectors
  const fieldMappings = {
    cardNumber: ['input[name="cardNumber"]', 'input[id="cardNumber"]', 'input[name="card_number"]', 'input[id="card_number"]', 'input[name="ccnumber"]'],
    cardName: ['input[name="cardName"]', 'input[id="cardName"]', 'input[name="card_name"]', 'input[id="card_name"]', 'input[name="ccname"]'],
    expiry: ['input[name="expiry"]', 'input[id="expiry"]', 'input[name="expiration"]', 'input[id="expiration"]', 'input[name="ccexp"]'],
    cvc: ['input[name="cvc"]', 'input[id="cvc"]', 'input[name="cvv"]', 'input[id="cvv"]', 'input[name="security_code"]']
  };
  
  // Fill each payment field
  for (const [field, selectors] of Object.entries(fieldMappings)) {
    if (paymentInfo[field]) {
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await page.type(selector, paymentInfo[field]);
            break;
          }
        } catch (e) {
          // Try next selector
          continue;
        }
      }
    }
  }
  
  // Handle iframe-based payment forms (common for Stripe, etc.)
  const iframeSelectors = ['iframe[name*="card"]', 'iframe[id*="card"]', 'iframe[src*="stripe"]'];
  
  for (const iframeSelector of iframeSelectors) {
    try {
      const frameHandle = await page.$(iframeSelector);
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        
        // Try to fill card number in the iframe
        await frame.type('input[name="cardnumber"]', paymentInfo.cardNumber).catch(() => {});
        await frame.type('input[name="exp-date"]', paymentInfo.expiry).catch(() => {});
        await frame.type('input[name="cvc"]', paymentInfo.cvc).catch(() => {});
        break;
      }
    } catch (e) {
      // Try next iframe
      continue;
    }
  }
}

async function submitOrderAction(page) {
  // Common submit button selectors
  const submitSelectors = [
    'button:contains("Place Order")',
    'button:contains("Complete Purchase")',
    'button:contains("Submit Order")',
    'button:contains("Pay Now")',
    'button[type="submit"]',
    'input[type="submit"]',
    'a.btn:contains("Complete")'
  ];
  
  for (const selector of submitSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        return;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
}

async function captureOrderResult(page) {
  // Get current URL
  const currentUrl = page.url();
  
  // Check for common success indicators
  const successIndicators = [
    '.order-confirmation',
    '.order-success',
    '.thank-you',
    'h1:contains("Thank You")',
    'h2:contains("Thank You")',
    'h1:contains("Order Confirmed")',
    '.confirmation-message'
  ];
  
  let status = 'unknown';
  
  for (const selector of successIndicators) {
    try {
      const element = await page.$(selector);
      if (element) {
        status = 'success';
        break;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  // Check for error messages
  if (status === 'unknown') {
    const errorIndicators = [
      '.error-message',
      '.alert-danger',
      '.payment-error',
      'p:contains("declined")',
      'div:contains("payment failed")'
    ];
    
    for (const selector of errorIndicators) {
      try {
        const element = await page.$(selector);
        if (element) {
          status = 'error';
          break;
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
  }
  
  // If still unknown, assume pending
  if (status === 'unknown') {
    status = 'pending';
  }
  
  return {
    status,
    currentUrl
  };
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});