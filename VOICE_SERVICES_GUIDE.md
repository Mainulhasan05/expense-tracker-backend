# Voice Services Integration Guide

## Overview

This system uses **Speechmatics** for voice transcription and **ElevenLabs** for Text-to-Speech (TTS), with full support for **Bengali (বাংলা)** language.

### Key Features

- ✅ **Speechmatics** - Advanced speech-to-text with Bengali support
- ✅ **ElevenLabs** - High-quality TTS with multilingual support
- ✅ **Priority System** - Speechmatics accounts have higher priority
- ✅ **Multi-account Management** - Automatic rotation and load balancing
- ✅ **Rate Limiting** - Built-in protection against API rate limits
- ✅ **Usage Tracking** - Monitor API usage and costs
- ✅ **Bangla Language** - Native support for Bengali transcription and synthesis

## Architecture

```
Voice Message (Telegram/Upload)
       │
       ▼
[Audio Format Conversion] ← FFmpeg (to MP3, 16kHz)
       │
       ▼
[Voice Service - Priority Selection]
       │
       ├─→ [Speechmatics SDK] (Priority 10) ← Primary
       │   └─→ BatchClient.transcribe()
       ├─→ [Speechmatics Account 2] (Priority 10)
       └─→ [Speechmatics Account 3] (Priority 8)
       │
       ▼
[Bengali Transcription]
       │
       ▼
[Clarifai AI Parser] ← Expense extraction
       │
       ▼
[Transaction Saved to Database]

Text-to-Speech Flow:
Text → [ElevenLabs SDK] → textToSpeech.convert() → Audio Buffer
```

## Official SDKs

This integration uses the official SDKs from both providers:

- **@speechmatics/batch-client** - Official Speechmatics Node.js SDK
- **@elevenlabs/elevenlabs-js** - Official ElevenLabs Node.js SDK

### Benefits of Using Official SDKs:
- ✅ Automatic job polling and status updates
- ✅ Built-in error handling and retries
- ✅ Type safety and better documentation
- ✅ Simplified API interaction
- ✅ Maintained by the service providers

## Setup Instructions

### 1. Get Speechmatics API Key

1. Sign up at https://www.speechmatics.com/
2. Go to Account → API Keys
3. Create a new API key
4. Copy the API key (starts with something like `AbCdEf123456...`)

#### Speechmatics Pricing
- **Free Trial**: 8 hours of transcription
- **Pay-as-you-go**: $0.10 per minute for standard mode
- **Bengali Support**: Fully supported with code `bn`

### 2. Get ElevenLabs API Key

1. Sign up at https://elevenlabs.io/
2. Go to Profile → API Keys
3. Generate a new API key
4. Copy the API key

#### ElevenLabs Pricing
- **Free Tier**: 10,000 characters/month
- **Starter**: $5/month for 30,000 characters
- **Multilingual V2 Model**: Supports Bengali synthesis

### 3. Add Accounts via Script

#### Add Speechmatics Account

```bash
cd expense-tracker-backend
node scripts/add-voice-account.js speechmatics YOUR_API_KEY "Speechmatics Account 1"
```

#### Add ElevenLabs Account

```bash
node scripts/add-voice-account.js elevenlabs YOUR_API_KEY "ElevenLabs Account 1"
```

### 4. Add Accounts via API

#### Speechmatics Account

```bash
curl -X POST http://localhost:8000/api/admin/voice/accounts \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "speechmatics",
    "apiKey": "YOUR_SPEECHMATICS_API_KEY",
    "name": "Speechmatics Account 1",
    "priority": 10,
    "planType": "trial",
    "config": {
      "language": "bn",
      "operatingPoint": "standard"
    },
    "notes": "Primary transcription account"
  }'
```

#### ElevenLabs Account

```bash
curl -X POST http://localhost:8000/api/admin/voice/accounts \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "elevenlabs",
    "apiKey": "YOUR_ELEVENLABS_API_KEY",
    "name": "ElevenLabs Account 1",
    "priority": 5,
    "planType": "free",
    "config": {
      "modelId": "eleven_multilingual_v2",
      "voiceId": "pNInz6obpgDQGcFmaJgB"
    },
    "notes": "TTS for notifications"
  }'
```

## Priority System

The voice service uses a **priority-based selection** system:

| Provider | Default Priority | Description |
|----------|-----------------|-------------|
| Speechmatics | 10 | Highest priority - used first for transcription |
| ElevenLabs | 5 | Lower priority - used for TTS |

### How Priority Works

1. **Automatic Selection**: System selects account with highest priority
2. **Load Balancing**: Among same priority, uses least recently used
3. **Rate Limiting**: Skips accounts that hit rate limits
4. **Failover**: Automatically tries next available account on error

### Custom Priority

You can set custom priority values:

```javascript
// Higher priority = used first
{
  "priority": 15  // Will be used before priority 10
}
```

## Language Configuration

### Speechmatics Language Codes

| Language | Code | Status |
|----------|------|--------|
| Bengali | `bn` | ✅ Fully Supported |
| English | `en` | ✅ Fully Supported |
| Hindi | `hi` | ✅ Fully Supported |

### Operating Points

- **Standard**: Fast, accurate for clear audio
- **Enhanced**: Better accuracy for noisy environments (slower, more expensive)

### ElevenLabs Models

| Model | Description | Bengali Support |
|-------|-------------|-----------------|
| `eleven_multilingual_v2` | Latest multilingual model | ✅ Yes |
| `eleven_monolingual_v1` | English only | ❌ No |

## API Endpoints

### Account Management

```
GET    /api/admin/voice/accounts          # Get all accounts + stats
POST   /api/admin/voice/accounts          # Add new account
PUT    /api/admin/voice/accounts/:id      # Update account
DELETE /api/admin/voice/accounts/:id      # Delete account
GET    /api/admin/voice/stats              # Get provider statistics
```

### Testing

```
POST /api/admin/voice/test/transcription   # Test audio transcription
POST /api/admin/voice/test/tts             # Test text-to-speech
GET  /api/admin/voice/accounts/:id/voices  # Get available voices (ElevenLabs)
```

## Frontend Management

### Access Voice Service UI

1. Log in as admin
2. Navigate to **Dashboard → Admin → Voice Services**
3. View account status and statistics

### Features

- **Add Accounts**: Both Speechmatics and ElevenLabs
- **Priority Management**: Set custom priorities
- **Provider Statistics**: Track usage by provider
- **Test Transcription**: Upload audio to test
- **Test TTS**: Generate speech from text
- **Real-time Status**: See active/exhausted accounts

## Usage Examples

### Transcribe Audio (Programmatic)

```javascript
const voiceService = require('./services/voiceService');

const result = await voiceService.transcribeAudio('/path/to/audio.mp3');
console.log(result.text); // "আমার খরচ ৫০০ টাকা"
console.log(result.provider); // "speechmatics"
console.log(result.language); // "bn"

// Behind the scenes (using Speechmatics SDK):
// const client = new BatchClient({ apiKey, appId });
// const audio = await client.transcribe(file, config, "json-v2");
```

### Generate Speech (TTS)

```javascript
const voiceService = require('./services/voiceService');

const result = await voiceService.generateSpeech('আপনার খরচ সংরক্ষিত হয়েছে');
console.log(result.audioBuffer); // Buffer containing MP3 audio
console.log(result.characters); // 31
console.log(result.provider); // "elevenlabs"

// Behind the scenes (using ElevenLabs SDK):
// const elevenlabs = new ElevenLabsClient({ apiKey });
// const audio = await elevenlabs.textToSpeech.convert(voiceId, { text, model_id });
```

### Telegram Bot Integration

The system automatically uses Speechmatics when users send voice messages to the Telegram bot:

1. User sends voice message in Bengali
2. Bot converts audio to MP3 (16kHz)
3. Speechmatics transcribes with Bengali language config
4. Clarifai AI parses the transcription for expenses
5. Transaction is saved and confirmed

## Monitoring & Statistics

### Provider Stats

```javascript
{
  "speechmatics": {
    "total": 3,              // Total accounts
    "active": 2,             // Active accounts
    "totalRequests": 145,    // Total transcriptions
    "totalAudioSeconds": 8745, // Total audio processed
    "totalCharacters": 0
  },
  "elevenlabs": {
    "total": 1,
    "active": 1,
    "totalRequests": 23,
    "totalAudioSeconds": 0,
    "totalCharacters": 4567  // Characters synthesized
  }
}
```

### Account Status

- **Active**: Ready to use
- **Exhausted**: Credits depleted
- **Expired**: Trial period ended
- **Error**: Too many consecutive errors
- **Disabled**: Manually disabled by admin

## Rate Limiting

### Default Limits

| Provider | Requests/Minute |
|----------|----------------|
| Speechmatics | 10 |
| ElevenLabs | 20 |

### How It Works

1. System tracks requests per minute per account
2. Auto-resets counter after 60 seconds
3. Skips rate-limited accounts automatically
4. Rotates to next available account

## Troubleshooting

### "No available accounts" Error

**Causes:**
- All accounts exhausted
- All accounts rate-limited
- All accounts expired

**Solutions:**
1. Add more accounts
2. Wait for rate limits to reset (60 seconds)
3. Check account status in admin panel
4. Verify API keys are valid

### Transcription Quality Issues

**Bengali Audio:**
- Ensure `language: "bn"` is set
- Use `operatingPoint: "enhanced"` for noisy audio
- Check audio quality (clear speech, minimal background noise)

**Audio Format:**
- System auto-converts to MP3
- 16kHz sample rate is optimal
- Mono channel works best

### API Key Validation Failed

1. Check API key is correct
2. Verify account has credits
3. Test API key directly on provider website
4. Check for whitespace in API key

## Cost Estimation

### Speechmatics

- **Standard Mode**: $0.10/minute = $6/hour
- **Enhanced Mode**: $0.15/minute = $9/hour
- **Free Trial**: 8 hours = 480 minutes

### ElevenLabs

- **Free Tier**: 10,000 chars/month = ~40 short messages
- **Starter Plan**: $5/month for 30,000 chars
- **Average Bengali sentence**: ~50-100 characters

### Example Calculation

**Monthly Usage (Example):**
- 200 voice messages (avg 10 seconds each) = 33 minutes
- Speechmatics cost: 33 × $0.10 = **$3.30/month**
- TTS notifications (5000 chars): **Free** (under free tier)

## Migration from AssemblyAI

### What Changed

- ❌ Removed: AssemblyAI integration
- ✅ Added: Speechmatics (better Bengali support)
- ✅ Added: ElevenLabs (TTS capability)
- ✅ Improved: Priority-based selection
- ✅ Enhanced: Multi-account management

### Migration Steps

1. ✅ Backend model updated to `VoiceServiceAccount`
2. ✅ Service layer replaced with `voiceService.js`
3. ✅ Admin routes updated to `/api/admin/voice/*`
4. ✅ Frontend UI updated to `/dashboard/admin/voice-services`
5. ✅ Telegram bot updated to use new service
6. ✅ Old AssemblyAI files removed

### Data Migration

Old AssemblyAI accounts are **not** automatically migrated. You must:

1. Delete old AssemblyAI accounts (if any)
2. Add new Speechmatics accounts
3. Test transcription with sample audio

## Security Best Practices

1. **Store API Keys Securely**: Never commit to Git
2. **Use Environment Variables**: For production deployments
3. **Rotate Keys Regularly**: Change API keys every 90 days
4. **Monitor Usage**: Set up alerts for unusual activity
5. **Limit Admin Access**: Only trusted users should manage accounts

## Support

### Speechmatics Support
- Documentation: https://docs.speechmatics.com/
- Support: support@speechmatics.com
- Status: https://status.speechmatics.com/

### ElevenLabs Support
- Documentation: https://docs.elevenlabs.io/
- Discord: https://discord.gg/elevenlabs
- Status: https://status.elevenlabs.io/

## Changelog

### v2.0.0 - Voice Services Integration
- Replaced AssemblyAI with Speechmatics
- Added ElevenLabs TTS support
- Implemented priority-based account selection
- Enhanced Bengali language support
- Added comprehensive admin UI
- Improved rate limiting and error handling
