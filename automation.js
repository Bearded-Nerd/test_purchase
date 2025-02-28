// Test Purchase Automation using Microsoft Omniparse
// This script automates test purchases for performance marketing with simple UI


const omniparse = require('./omniparse');
// const omniparse = require('@microsoft/omniparse');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Create directories for screenshots if they don't exist
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

async function runTestPurchase(config) {
  const {
    landingPageUrl,
    testCustomerInfo,
    testPaymentInfo,
    screenshotPath,
    headless = true
  } = config;
  
  console.log(`Starting test purchase for: ${landingPageUrl}`);
  ensureDirectoryExists(screenshotPath);
  
  // Initialize browser session
  const browser = await omniparse.launch({
    headless: headless,
    slowMo: 50 // Slows down operations for better stability
  });
  
  let page;
  
  try {
    page = await browser.newPage();
    
    // Set viewport to desktop size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to landing page
    console.log("Navigating to landing page...");
    await page.goto(landingPageUrl, { waitUntil: 'networkidle2' });
    
    // Take screenshot of landing page
    await page.screenshot({ path: `${screenshotPath}/landing_page.png` });
    
    // Check for and handle quiz (if present)
    const hasQuiz = await checkForQuiz(page);
    if (hasQuiz) {
      console.log("Quiz detected - completing with random answers...");
      await completeQuizRandomly(page);
      await page.screenshot({ path: `${screenshotPath}/quiz_completed.png` });
    }
    
    // Look for and click main CTA button
    await clickMainCTA(page);
    
    // Handle checkout form
    console.log("Filling checkout form...");
    await fillCheckoutForm(page, testCustomerInfo);
    await page.screenshot({ path: `${screenshotPath}/checkout_filled.png` });
    
    // Handle payment
    console.log("Entering payment details...");
    await enterPaymentDetails(page, testPaymentInfo);
    await page.screenshot({ path: `${screenshotPath}/payment_entered.png` });
    
    // Submit order (but don't actually complete if it's just a test)
    if (config.submitOrder) {
      console.log("Submitting order...");
      await submitOrder(page);
      await page.screenshot({ path: `${screenshotPath}/order_submitted.png` });
    }
    
    // Capture order confirmation or error
    const orderResult = await captureOrderResult(page);
    console.log("Test purchase result:", orderResult);
    
    return {
      success: true,
      orderResult,
      screenshots: `${screenshotPath}`
    };
  } catch (error) {
    console.error("Error during test purchase:", error);
    
    // Take screenshot of error state
    try {
      if (page) {
        await page.screenshot({ path: `${screenshotPath}/error_state.png` });
      }
    } catch (screenshotError) {
      console.error("Could not capture error screenshot:", screenshotError);
    }
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function checkForQuiz(page) {
  // Check for common quiz indicators
  const quizSelectors = [
    'form[id*="quiz"]',
    'div[class*="quiz"]',
    'div[id*="quiz"]',
    'div[class*="question"]',
    'form.survey',
    '.question-container'
  ];
  
  for (const selector of quizSelectors) {
    const element = await page.$(selector);
    if (element) return true;
  }
  
  // Look for multiple choice questions
  const radioButtons = await page.$$('input[type="radio"]');
  if (radioButtons.length > 3) return true;
  
  return false;
}

async function completeQuizRandomly(page) {
  // Find all question containers
  const questions = await page.$$('.question-container, div[class*="question"], .form-group');
  
  if (questions.length === 0) {
    // If no specific question containers found, look for individual input elements
    await handleLooseFormElements(page);
    return;
  }
  
  for (const question of questions) {
    // For each question, find radio buttons or checkboxes
    const radioButtons = await question.$$('input[type="radio"]');
    if (radioButtons.length > 0) {
      // Select a random radio button
      const randomIndex = Math.floor(Math.random() * radioButtons.length);
      await radioButtons[randomIndex].click();
      continue;
    }
    
    const checkboxes = await question.$$('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      // Select a random number of checkboxes (at least 1)
      const numToSelect = Math.floor(Math.random() * checkboxes.length) + 1;
      const shuffled = [...checkboxes].sort(() => 0.5 - Math.random());
      for (let i = 0; i < numToSelect && i < shuffled.length; i++) {
        await shuffled[i].click();
      }
      continue;
    }
    
    // If there's a dropdown
    const select = await question.$('select');
    if (select) {
      await handleSelect(page, select);
      continue;
    }
    
    // For text inputs, enter some generic text
    const textInput = await question.$('input[type="text"], textarea');
    if (textInput) {
      await textInput.type('Test Response');
    }
  }
  
  // Look for and click the next/continue button
  await clickContinueButton(page);
}

async function handleLooseFormElements(page) {
  // Handle radio buttons that aren't in clear question containers
  const radioButtons = await page.$$('input[type="radio"]');
  if (radioButtons.length > 0) {
    // Group radio buttons by name attribute
    const radioGroups = {};
    for (const radio of radioButtons) {
      const name = await page.evaluate(el => el.name, radio);
      if (!radioGroups[name]) {
        radioGroups[name] = [];
      }
      radioGroups[name].push(radio);
    }
    
    // Select one random option from each group
    for (const name in radioGroups) {
      const group = radioGroups[name];
      const randomIndex = Math.floor(Math.random() * group.length);
      await group[randomIndex].click();
    }
  }
  
  // Handle checkboxes
  const checkboxes = await page.$$('input[type="checkbox"]');
  if (checkboxes.length > 0) {
    // Select a random number of checkboxes
    const numToSelect = Math.max(1, Math.floor(Math.random() * checkboxes.length));
    const shuffled = [...checkboxes].sort(() => 0.5 - Math.random());
    for (let i = 0; i < numToSelect && i < shuffled.length; i++) {
      await shuffled[i].click();
    }
  }
  
  // Handle all selects on the page
  const selects = await page.$$('select');
  for (const select of selects) {
    await handleSelect(page, select);
  }
  
  // Handle text inputs
  const textInputs = await page.$$('input[type="text"], textarea');
  for (const input of textInputs) {
    await input.type('Test Response');
  }
  
  // Click continue button
  await clickContinueButton(page);
}

async function handleSelect(page, selectElement) {
  // Get all options
  const options = await selectElement.$$('option');
  
  if (options.length > 1) {
    // Get all option values
    const optionValues = await page.evaluate(select => {
      const options = Array.from(select.options).slice(1); // Skip first option as it's often a placeholder
      return options.map(opt => opt.value);
    }, selectElement);
    
    if (optionValues.length > 0) {
      // Select a random option (skipping the first one)
      const randomIndex = Math.floor(Math.random() * optionValues.length);
      await selectElement.select(optionValues[randomIndex]);
    }
  }
}

async function clickContinueButton(page) {
  const nextButtons = [
    'button[type="submit"]',
    'button:contains("Next")', 
    'button:contains("Continue")',
    'a.btn:contains("Next")',
    'input[type="submit"]',
    'button.continue',
    'button.next-step',
    'a.continue-button'
  ];
  
  for (const buttonSelector of nextButtons) {
    try {
      const buttonExists = await page.$(buttonSelector);
      if (buttonExists) {
        await page.click(buttonSelector);
        
        // Wait for page transition
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        break;
      }
    } catch (e) {
      // Try next button selector
      continue;
    }
  }
}

async function clickMainCTA(page) {
  console.log("Looking for main CTA button...");
  
  // Try using OmniParser to find and click the button
  const clickedWithOmniParser = await page.findAndClick('button', 'Get Started') || 
                               await page.findAndClick('button', 'Continue') ||
                               await page.findAndClick('button', 'Add to Cart');
  
  if (clickedWithOmniParser) {
    console.log("Clicked CTA button using OmniParser");
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
    return true;
  }
  
  // Fall back to traditional selectors if OmniParser didn't work
  console.log("Falling back to traditional selectors...");
  const ctaSelectors = [
    'a.main-cta',
    'button.cta-button',
    'a.btn-primary',
    'button[type="submit"]',
    'a:contains("Get Started")',
    'a:contains("Add to Cart")',
    'a:contains("Checkout")',
    'a.btn:contains("Continue")',
    'button:contains("Continue")',
    'a.button',
    'button.submit',
    'input[type="submit"]'
  ];
  
  for (const selector of ctaSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        
        // Wait for page transition
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        return true;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  throw new Error("Could not find main CTA button");
}

async function fillCheckoutForm(page, customerInfo) {
  const formFields = {
    firstName: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First"]', '#firstName'],
    lastName: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last"]', '#lastName'],
    email: ['input[type="email"]', 'input[name="email"]', 'input[id*="email"]', '#email'],
    phone: ['input[type="tel"]', 'input[name="phone"]', 'input[id*="phone"]', '#phone', 'input[placeholder*="Phone"]'],
    address1: ['input[name="address1"]', 'input[id*="address"]', 'input[placeholder*="Address"]', '#address1'],
    city: ['input[name="city"]', 'input[id*="city"]', '#city'],
    state: ['select[name="state"]', 'select[id*="state"]', '#state', 'select[name="province"]'],
    zipCode: ['input[name="zip"]', 'input[name="postalCode"]', 'input[id*="zip"]', 'input[id*="postal"]', '#zip', '#postalCode'],
    country: ['select[name="country"]', 'select[id*="country"]', '#country']
  };
  
  // For each field type, try all possible selectors
  for (const [fieldName, selectors] of Object.entries(formFields)) {
    if (customerInfo[fieldName]) {
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            if (selector.startsWith('select')) {
              // Enhanced select handling
              await handleFormSelect(page, selector, customerInfo[fieldName]);
            } else {
              await page.type(selector, customerInfo[fieldName]);
            }
            break; // Break once we've found and filled a working selector
          }
        } catch (e) {
          // Try next selector
          continue;
        }
      }
    }
  }
}

async function handleFormSelect(page, selector, value) {
  // Get all available options to handle different formats of dropdown
  const options = await page.evaluate((sel) => {
    const select = document.querySelector(sel);
    if (!select) return [];
    
    return Array.from(select.options).map(option => ({
      value: option.value,
      text: option.text.trim().toLowerCase()
    }));
  }, selector);
  
  if (options.length === 0) return;
  
  // Try to find the option by value first
  let optionValue = options.find(opt => opt.value.toLowerCase() === value.toLowerCase())?.value;
  
  // If not found by value, try by text
  if (!optionValue) {
    optionValue = options.find(opt => opt.text.toLowerCase() === value.toLowerCase())?.value;
  }
  
  // If still not found, for state/province try to match abbreviated vs full name
  if (!optionValue && (selector.includes('state') || selector.includes('province'))) {
    // Map of state abbreviations to full names
    const stateMap = {
      'AL': 'alabama', 'AK': 'alaska', 'AZ': 'arizona', 'AR': 'arkansas',
      'CA': 'california', 'CO': 'colorado', 'CT': 'connecticut', 'DE': 'delaware',
      'FL': 'florida', 'GA': 'georgia', 'HI': 'hawaii', 'ID': 'idaho',
      'IL': 'illinois', 'IN': 'indiana', 'IA': 'iowa', 'KS': 'kansas',
      'KY': 'kentucky', 'LA': 'louisiana', 'ME': 'maine', 'MD': 'maryland',
      'MA': 'massachusetts', 'MI': 'michigan', 'MN': 'minnesota', 'MS': 'mississippi',
      'MO': 'missouri', 'MT': 'montana', 'NE': 'nebraska', 'NV': 'nevada',
      'NH': 'new hampshire', 'NJ': 'new jersey', 'NM': 'new mexico', 'NY': 'new york',
      'NC': 'north carolina', 'ND': 'north dakota', 'OH': 'ohio', 'OK': 'oklahoma',
      'OR': 'oregon', 'PA': 'pennsylvania', 'RI': 'rhode island', 'SC': 'south carolina',
      'SD': 'south dakota', 'TN': 'tennessee', 'TX': 'texas', 'UT': 'utah',
      'VT': 'vermont', 'VA': 'virginia', 'WA': 'washington', 'WV': 'west virginia',
      'WI': 'wisconsin', 'WY': 'wyoming'
    };
    
    // Try to match state by full name or abbreviation
    const valueUpper = value.toUpperCase();
    const valueLower = value.toLowerCase();
    
    if (stateMap[valueUpper]) {
      // Value is an abbreviation, find the full name
      optionValue = options.find(opt => opt.text.toLowerCase() === stateMap[valueUpper])?.value;
    } else {
      // Value is a full name, find the abbreviation
      const abbr = Object.keys(stateMap).find(abbr => stateMap[abbr] === valueLower);
      if (abbr) {
        optionValue = options.find(opt => opt.value.toUpperCase() === abbr || opt.text.toUpperCase() === abbr)?.value;
      }
    }
  }
  
  // If we found a match, select it
  if (optionValue) {
    await page.select(selector, optionValue);
  } else if (options.length > 0) {
    // If no match found but options exist, select the first non-empty option
    const firstValidOption = options.find(opt => opt.value && opt.value !== 'null' && opt.value !== 'undefined' && opt.value !== '');
    if (firstValidOption) {
      await page.select(selector, firstValidOption.value);
    }
  }
}

async function enterPaymentDetails(page, paymentInfo) {
  // Handle credit card iframe if present
  const cardIframe = await page.$('iframe[name*="card"], iframe[id*="card"], iframe[src*="stripe"], iframe[src*="paypal"]');
  
  if (cardIframe) {
    // Switch to iframe context
    const frameHandle = await cardIframe.contentFrame();
    
    // Fill card details in iframe
    await frameHandle.type('input[name*="number"], input[placeholder*="card"], input[data-elements-stable-field-name="cardNumber"]', paymentInfo.cardNumber);
    await frameHandle.type('input[name*="exp"], input[placeholder*="MM"], input[data-elements-stable-field-name="cardExpiry"]', paymentInfo.expiry);
    await frameHandle.type('input[name*="cvc"], input[placeholder*="CVC"], input[data-elements-stable-field-name="cardCvc"]', paymentInfo.cvc);
    
    // Return to main page context
    await page.frames()[0];
  } else {
    // Direct card fields on page
    const cardFields = {
      cardNumber: ['input[name*="card_number"]', 'input[id*="card"]', 'input[placeholder*="Card"]', '#cardNumber'],
      cardName: ['input[name*="card_name"]', 'input[placeholder*="name on card"]', '#cardName'],
      expiry: ['input[name*="expiry"]', 'input[name*="exp"]', 'input[placeholder*="MM/YY"]', '#expiry', '#expDate'],
      cvc: ['input[name*="cvc"]', 'input[name*="cvv"]', 'input[placeholder*="CVC"]', '#cvc', '#cvv']
    };
    
    for (const [fieldName, selectors] of Object.entries(cardFields)) {
      if (paymentInfo[fieldName]) {
        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              await page.type(selector, paymentInfo[fieldName]);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
    }
  }
}

async function submitOrder(page) {
  // Common submit order button selectors
  const submitSelectors = [
    'button[type="submit"]',
    'button:contains("Place Order")',
    'button:contains("Complete Order")',
    'button:contains("Purchase")',
    'button:contains("Submit")',
    'input[type="submit"]',
    'button.submit-button',
    'button.order-button'
  ];
  
  for (const selector of submitSelectors) {
    try {
      const buttonExists = await page.$(selector);
      if (buttonExists) {
        await page.click(selector);
        
        // Wait for order processing
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        return true;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  throw new Error("Could not find submit order button");
}

async function captureOrderResult(page) {
  // Look for success indicators
  const successSelectors = [
    '.order-confirmation',
    '.success-message',
    'h1:contains("Thank You")',
    'div:contains("Order Confirmed")',
    '.thank-you-page',
    '.confirmation'
  ];
  
  for (const selector of successSelectors) {
    const element = await page.$(selector);
    if (element) {
      return {
        status: 'success',
        message: await page.evaluate(el => el.textContent, element)
      };
    }
  }
  
  // Look for error indicators
  const errorSelectors = [
    '.error-message',
    '.alert-danger',
    'div[role="alert"]',
    '.payment-error'
  ];
  
  for (const selector of errorSelectors) {
    const element = await page.$(selector);
    if (element) {
      return {
        status: 'error',
        message: await page.evaluate(el => el.textContent, element)
      };
    }
  }
  
  // If neither success nor error is found
  return {
    status: 'unknown',
    currentUrl: page.url()
  };
}

// Simple Web UI for the test purchase tool
function startWebUI() {
  const app = express();
  const port = process.env.PORT || 3000;
  
  // Set up middleware
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Serve the main UI page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  // API endpoint to run a test purchase
  app.post('/api/run-test', async (req, res) => {
    try {
      const { landingPageUrl, customerInfo, paymentInfo, submitOrder, headless } = req.body;
      
      const screenshotPath = path.join(__dirname, 'screenshots', `run-${Date.now()}`);
      
      // Run the test purchase
      const result = await runTestPurchase({
        landingPageUrl,
        testCustomerInfo: customerInfo,
        testPaymentInfo: paymentInfo,
        screenshotPath,
        submitOrder: submitOrder === 'true',
        headless: headless === 'true'
      });
      
      // Return the results
      res.json({
        ...result,
        screenshotsPath: `/screenshots/${path.basename(screenshotPath)}`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Serve screenshots
  app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));
  
  // Start the server
  app.listen(port, () => {
    console.log(`Test Purchase Tool UI running at http://localhost:${port}`);
  });
  
  return app;
}

// Create the public directory and HTML file for the UI
function setupUI() {
  const publicDir = path.join(__dirname, 'public');
  ensureDirectoryExists(publicDir);
  
  const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Purchase Automation Tool</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { padding-top: 20px; padding-bottom: 40px; }
    .container { max-width: 800px; }
    .results-container { margin-top: 30px; }
    .screenshot-container { margin-top: 20px; }
    .screenshot-container img { max-width: 100%; border: 1px solid #ddd; margin-bottom: 10px; }
    .loading { display: none; margin-top: 20px; text-align: center; }
    .form-section { margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 5px; }
    .form-section h3 { margin-top: 0; font-size: 1.2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="mb-4">Test Purchase Automation Tool</h1>
    
    <form id="testPurchaseForm">
      <div class="form-section">
        <h3>Landing Page</h3>
        <div class="mb-3">
          <label for="landingPageUrl" class="form-label">Landing Page URL</label>
          <input type="url" class="form-control" id="landingPageUrl" name="landingPageUrl" required 
                 placeholder="https://example.com/landing-page">
        </div>
      </div>
      
      <div class="form-section">
        <h3>Customer Information</h3>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="firstName" class="form-label">First Name</label>
            <input type="text" class="form-control" id="firstName" name="firstName" value="Test">
          </div>
          <div class="col-md-6 mb-3">
            <label for="lastName" class="form-label">Last Name</label>
            <input type="text" class="form-control" id="lastName" name="lastName" value="User">
          </div>
        </div>
        
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="email" class="form-label">Email</label>
            <input type="email" class="form-control" id="email" name="email" value="test@example.com">
          </div>
          <div class="col-md-6 mb-3">
            <label for="phone" class="form-label">Phone</label>
            <input type="tel" class="form-control" id="phone" name="phone" value="5555555555">
          </div>
        </div>
        
        <div class="mb-3">
          <label for="address1" class="form-label">Address</label>
          <input type="text" class="form-control" id="address1" name="address1" value="123 Test St">
        </div>
        
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="city" class="form-label">City</label>
            <input type="text" class="form-control" id="city" name="city" value="Testville">
          </div>
          <div class="col-md-3 mb-3">
            <label for="state" class="form-label">State</label>
            <input type="text" class="form-control" id="state" name="state" value="NY">
          </div>
          <div class="col-md-3 mb-3">
            <label for="zipCode" class="form-label">Zip Code</label>
            <input type="text" class="form-control" id="zipCode" name="zipCode" value="10001">
          </div>
        </div>
        
        <div class="mb-3">
          <label for="country" class="form-label">Country</label>
          <input type="text" class="form-control" id="country" name="country" value="US">
        </div>
      </div>
      
      <div class="form-section">
        <h3>Payment Information</h3>
        <div class="alert alert-info">
          Use test card number: 0000000000000000
        </div>
        
        <div class="mb-3">
          <label for="cardNumber" class="form-label">Card Number</label>
          <input type="text" class="form-control" id="cardNumber" name="cardNumber" value="0000000000000000">
        </div>
        
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="cardName" class="form-label">Name on Card</label>
            <input type="text" class="form-control" id="cardName" name="cardName" value="Test User">
          </div>
          <div class="col-md-3 mb-3">
            <label for="expiry" class="form-label">Expiry (MM/YY)</label>
            <input type="text" class="form-control" id="expiry" name="expiry" value="12/25">
          </div>
          <div class="col-md-3 mb-3">
            <label for="cvc" class="form-label">CVC</label>
            <input type="text" class="form-control" id="cvc" name="cvc" value="123">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h3>Test Options</h3>
        <div class="mb-3 form-check">
          <input type="checkbox" class="form-check-input" id="submitOrder" name="submitOrder">
          <label class="form-check-label" for="submitOrder">Actually Submit Order (unchecked = stop before submission)</label>
        </div>
        
        <div class="mb-3 form-check">
          <input type="checkbox" class="form-check-input" id="headless" name="headless">
          <label class="form-check-label" for="headless">Run Headless (unchecked = show browser)</label>
        </div>
      </div>
      
      <button type="submit" class="btn btn-primary">Start Test Purchase</button>
    </form>
    
    <div class="loading">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p>Running test purchase... This may take a minute.</p>
    </div>
    
    <div class="results-container" id="resultsContainer" style="display: none;">
      <h2>Test Results</h2>
      <div class="alert" id="resultStatus"></div>
      
      <div id="resultDetails"></div>
      
      <h3 class="mt-4">Screenshots</h3>
      <div class="screenshot-container" id="screenshotContainer"></div>
    </div>
  </div>
  
  <script src="/app.js"></script>
</body>
</html>
  `;
  
  // Create app.js for the client-side JavaScript
  const appJs = `
document.getElementById('testPurchaseForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // Show loading state
  document.querySelector('.loading').style.display = 'block';
  document.getElementById('resultsContainer').style.display = 'none';
  
  // Gather form data
  const formData = new FormData(this);
  const customerInfo = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    address1: formData.get('address1'),
    city: formData.get('city'),
    state: formData.get('state'),
    zipCode: formData.get('zipCode'),
    country: formData.get('country')
  };
  
  const paymentInfo = {
    cardNumber: formData.get('cardNumber'),
    cardName: formData.get('cardName'),
    expiry: formData.get('expiry'),
    cvc: formData.get('cvc')
  };
  
  // Prepare request data
  const requestData = {
    landingPageUrl: formData.get('landingPageUrl'),
    customerInfo,
    paymentInfo,
    submitOrder: formData.get('submitOrder') ? 'true' : 'false',
    headless: formData.get('headless') ? 'true' : 'false'
  };
  
  try {
    // Send API request
    const response = await fetch('/api/run-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    const result = await response.json();
    
    // Display results
    const resultsContainer = document.getElementById('resultsContainer');
    const resultStatus = document.getElementById('resultStatus');
    const resultDetails = document.getElementById('resultDetails');
    const screenshotContainer = document.getElementById('screenshotContainer');
    
    resultsContainer.style.display = 'block';
    
    if (result.success) {
      resultStatus.className = 'alert alert-success';
      resultStatus.textContent = 'Test purchase completed successfully!';
      
      // Show order result details
      let detailsHtml = '<h4>Order Result:</h4>';
      if (result.orderResult) {
        detailsHtml += '<p><strong>Status:</strong> ' + result.orderResult.status + '</p>';
        if (result.orderResult.message) {
          detailsHtml += '<p><strong>Message:</strong> ' + result.orderResult.message + '</p>';
        }
        if (result.orderResult.currentUrl) {
          detailsHtml += '<p><strong>Final URL:</strong> ' + result.orderResult.currentUrl + '</p>';
        }
      }
      resultDetails.innerHTML = detailsHtml;
      
      // Display screenshots
      if (result.screenshotsPath) {
        const screenshotFiles = [
          'landing_page.png',
          'quiz_completed.png',
          'checkout_filled.png',
          'payment_entered.png',
          'order_submitted.png'
        ];
        
        let screenshotsHtml = '';
        for (const file of screenshotFiles) {
          const title = file.replace('.png', '').replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
          screenshotsHtml += '<div class="mb-3">';
          screenshotsHtml += '<h5>' + title + '</h5>';
          screenshotsHtml += '<img src="' + result.screenshotsPath + '/' + file + '" alt="' + file + '" onerror="this.style.display=\\'none\\'">';
          screenshotsHtml += '</div>';
        }
        
        // Also check for error screenshot
        screenshotsHtml += '<div class="mb-3">';
        screenshotsHtml += '<h5>Error State (if applicable)</h5>';
        screenshotsHtml += '<img src="' + result.screenshotsPath + '/error_state.png" alt="Error State" onerror="this.style.display=\\'none\\'">';
        screenshotsHtml += '</div>';
        
        screenshotContainer.innerHTML = screenshotsHtml;
      }
    } else {
      resultStatus.className = 'alert alert-danger';
      resultStatus.textContent = 'Test purchase failed: ' + (result.error || 'Unknown error');
      
      // Show error screenshot if available
      if (result.screenshotsPath) {
        screenshotContainer.innerHTML = '<div class="mb-3">' +
          '<h5>Error State</h5>' +
          '<img src="' + result.screenshotsPath + '/error_state.png" alt="Error State" onerror="this.style.display=\\'none\\'">' +
          '</div>';
      }
    }
  } catch (error) {
    console.error('Error running test:', error);
    const resultsContainer = document.getElementById('resultsContainer');
    const resultStatus = document.getElementById('resultStatus');
    
    resultsContainer.style.display = 'block';
    resultStatus.className = 'alert alert-danger';
    resultStatus.textContent = 'Error running test: ' + error.message;
  } finally {
    // Hide loading state
    document.querySelector('.loading').style.display = 'none';
  }
});
  `;
  
  fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(publicDir, 'app.js'), appJs);
}

// Main function to start the application
function main() {
  // Create screenshots directory
  ensureDirectoryExists(path.join(__dirname, 'screenshots'));
  
  // Set up the UI
  setupUI();
  
  // Start the web server
  startWebUI();
}

// Run the application
main();

// Export functions for testing or programmatic use
module.exports = {
  runTestPurchase,
  startWebUI
};