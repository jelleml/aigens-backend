# 🔄 Script Migration Guide - Legacy to Modern

This document explains the migration from legacy hardcoded model scripts to the modern API-fetching system.

## 📊 Migration Status

### ✅ Modern Scripts (RECOMMENDED)
- `setup-models-modern.js` - New unified setup using API-fetched models
- `services/model-management/` - Modern CLI system with live API integration
- `npm run setup-models` - Now points to modern script
- `npm run model-mgmt sync` - Ongoing model synchronization

### ⚠️ Legacy Scripts (DEPRECATED)
- `setup-models-complete.js` - ❌ Uses hardcoded model lists
- `init-all-models-unified.js` - ❌ Uses hardcoded model lists  
- `scripts/update-models-info/` - ❌ Older update approach

## 🚀 How to Migrate

### 1. For New Setups
```bash
# Use this (modern API-fetched):
npm run setup-models

# Instead of this (legacy hardcoded):
npm run setup-models-legacy
```

### 2. For Existing Systems
```bash
# Update to latest models from APIs:
npm run model-mgmt sync

# Verify health:
npm run model-mgmt:health
```

### 3. For Ongoing Operations
```bash
# Regular sync (recommended weekly):
npm run sync:all

# Provider-specific sync:
npm run sync:openai
npm run sync:anthropic
npm run sync:together
```

## 🔍 Key Differences

| Feature | Legacy Scripts | Modern System |
|---------|----------------|---------------|
| **Model Source** | Hardcoded lists | Live API calls |
| **Updates** | Manual code changes | Automatic discovery |
| **Completeness** | Limited models | All available models |
| **Maintenance** | High | Low |
| **Accuracy** | Becomes outdated | Always current |

## 🐛 Migration Issues

### Common Problems
1. **"Models missing"** - Legacy scripts have limited hardcoded lists
2. **"Model outdated"** - Legacy scripts not updated with latest models
3. **"New models not found"** - API releases models faster than manual updates

### Solutions
```bash
# Switch to modern system:
npm run setup-models

# For ongoing updates:
npm run model-mgmt sync

# Check what's available:
npm run model-mgmt:status
```

## 📋 Checklist for Migration

- [ ] Backup current database
- [ ] Configure API keys for all providers
- [ ] Test modern setup in development
- [ ] Run `npm run setup-models` (modern)
- [ ] Verify with `npm run model-mgmt:health`
- [ ] Update deployment scripts
- [ ] Schedule regular `npm run sync:all`
- [ ] Remove references to legacy scripts

## 🚨 Breaking Changes

### Package.json Scripts Changed
```json
// OLD (now legacy):
"setup-models": "scripts/setup-init/setup-models-complete.js"

// NEW (modern):
"setup-models": "scripts/setup-init/setup-models-modern.js"
"setup-models-legacy": "scripts/setup-init/setup-models-complete.js"
```

### Recommended Commands Changed
```bash
# OLD approach:
npm run setup-models # (was using hardcoded lists)

# NEW approach:
npm run setup-models # (now uses API-fetched models)
npm run setup-models-legacy # (fallback to old behavior)
```

## 📞 Support

If you encounter issues during migration:

1. **Check health**: `npm run model-mgmt:health`
2. **Check logs**: `npm run model-mgmt:logs`
3. **Check status**: `npm run model-mgmt:status`
4. **Fallback**: `npm run setup-models-legacy` (temporary)

## 🗓️ Timeline

- **Immediate**: Legacy scripts marked as deprecated
- **Current**: Modern system is default
- **Future**: Legacy scripts may be removed in future versions

**Action Required**: Switch to modern system as soon as possible.