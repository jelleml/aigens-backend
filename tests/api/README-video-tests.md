# Video API Tests

This directory contains comprehensive tests for all three video model providers integrated in the AIGens backend.

## 🎬 **Providers Tested**
- **Google Veo3** - Video generation with audio/video-only variants
- **Amazon Nova** - AWS Bedrock Nova Reel models (v1.0, v1.1)  
- **Runway ML** - Gen-3/Gen-4 models (Alpha & Turbo variants)

## 📁 **Test Files**

### **Integration Tests**
- `test-video-models-integration.js` - Main integration test covering all providers
- `final-video-api-summary.js` - Complete status report and summary

### **Provider-Specific Tests**
- `test-google-veo3-api.js` - Google Veo3 specific tests
- `test-amazon-nova-api.js` - Amazon Nova specific tests
- `test-runway-api.js` - Runway ML specific tests

### **Quick Status Checks**
- `real-api-test.js` - Real API connectivity test with config.js keys
- `simple-api-status.js` - Database integration status check

### **Utilities**
- `test-with-keys.sh` - Script template for setting environment variables
- `quick-video-api-test.js` - Quick status checker (legacy)

## 🚀 **How to Run Tests**

### **Recommended: Final Summary**
```bash
node tests/api/final-video-api-summary.js
```
Shows complete integration status for all providers.

### **Real API Tests** (requires API keys in config.js)
```bash
node tests/api/real-api-test.js
```
Tests actual API connectivity and responses.

### **Database Integration Only**
```bash
node tests/api/simple-api-status.js
```
Tests database integration without API calls.

### **Individual Provider Tests**
```bash
node tests/api/test-google-veo3-api.js
node tests/api/test-amazon-nova-api.js  
node tests/api/test-runway-api.js
```

### **Full Integration Test**
```bash
node tests/api/test-video-models-integration.js
```

## ⚙️ **Configuration**

API keys are configured in `/config/config.js`:
- `config.google_veo.apiKey` - Google Gemini API key
- `config.amazon_bedrock.aws_access_key_id` - AWS Access Key
- `config.amazon_bedrock.apiKey` - AWS Bearer Token  
- `config.runway.apiKey` - Runway ML API key

## 📊 **What the Tests Cover**

### **Service-Level Tests**
- ✅ API connectivity and response times
- ✅ Model availability and discovery
- ✅ Cost calculation validation
- ✅ Error handling and graceful degradation

### **Database Integration Tests**  
- ✅ Provider existence and configuration
- ✅ Model creation and activation
- ✅ Price score population with JSON format
- ✅ Relationship integrity

### **Feature-Specific Tests**
- ✅ Video+Audio vs Video-Only variants (Veo3)
- ✅ Gen-3 vs Gen-4 model comparison (Runway)
- ✅ Alpha vs Turbo variant pricing (Runway)
- ✅ Multi-shot vs single-shot capabilities (Nova)

## 🎯 **Expected Results**

All tests should show:
- ✅ **3/3 providers ready**
- ✅ **API connectivity working** (with keys)
- ✅ **Database integration complete**
- ✅ **12 total models** (6 Veo3 + 2 Nova + 4 Runway)
- ✅ **Price calculations functional**

## 🔧 **Dependencies**

Required packages (already in package.json):
- `aws-sdk` - Amazon Nova integration
- `axios` - HTTP requests  
- `@google/genai` - Google Veo3 integration

## 📝 **Test Output Example**

```
🎬 FINAL VIDEO API INTEGRATION SUMMARY
=====================================

📋 Google Veo3:
   🗄️ Database Provider: ✅ OK (6 models)  
   🔑 API Keys: ✅ Present
   🌐 API Status: ✅ OK
   🎯 Overall: ✅ READY

📋 Amazon Nova:
   🗄️ Database Provider: ✅ OK (2 models)
   🔑 API Keys: ✅ Present  
   🌐 API Status: ✅ OK
   🎯 Overall: ✅ READY

📋 Runway ML:
   🗄️ Database Provider: ✅ OK (4 models)
   🔑 API Keys: ✅ Present
   🌐 API Status: ✅ OK  
   🎯 Overall: ✅ READY

🎉 INTEGRATION COMPLETE!
All video model providers are ready for production use.
```