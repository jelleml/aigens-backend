# Google Veo - Esempi di Utilizzo

## Panoramica

Questa sezione contiene esempi pratici di utilizzo del servizio Google Veo per la generazione di video da testo.

## Esempi Base

### 1. Generazione Video Semplice

```javascript
const googleVeoService = require('./services/google-veo.service');

async function generateSimpleVideo() {
    try {
        const result = await googleVeoService.processGoogleVeoRequest({
            prompt: 'Un gatto che gioca con una palla colorata',
            modelId: 1, // ID del modello Google Veo
            userId: 123,
            chatId: 456
        });

        console.log('Video generato:', result.videoUrl);
        console.log('Costo:', result.cost);
    } catch (error) {
        console.error('Errore:', error.message);
    }
}
```

### 2. Generazione con Event Stream

```javascript
async function generateVideoWithProgress() {
    try {
        const result = await googleVeoService.processGoogleVeoRequest({
            prompt: 'Un robot che cammina in una città futura',
            modelId: 1,
            userId: 123,
            chatId: 456,
            onStream: (event) => {
                switch (event.type) {
                    case 'video-generation-started':
                        console.log('🚀 Generazione iniziata');
                        break;
                    case 'video-generation-progress':
                        console.log(`📊 Progresso: ${event.data.progress}%`);
                        break;
                    case 'video-generation-completed':
                        console.log('✅ Generazione completata');
                        console.log('Video URL:', event.data.videoUrl);
                        break;
                    case 'video-generation-error':
                        console.log('❌ Errore:', event.data.error);
                        break;
                }
            }
        });

        console.log('Risultato finale:', result);
    } catch (error) {
        console.error('Errore:', error.message);
    }
}
```

### 3. Verifica Modelli Disponibili

```javascript
async function checkAvailableModels() {
    try {
        const models = await googleVeoService.getAvailableModels();
        console.log('Modelli disponibili:');
        models.forEach(model => {
            console.log(`- ${model.name} (${model.id}): ${model.description}`);
        });
    } catch (error) {
        console.error('Errore:', error.message);
    }
}
```

## Esempi Avanzati

### 4. Generazione Batch di Video

```javascript
async function generateBatchVideos() {
    const prompts = [
        'Un gatto che gioca con una palla',
        'Un paesaggio di montagna al tramonto',
        'Un robot che cammina in una città futura',
        'Un fiore che sboccia in time-lapse',
        'Un uccello che vola nel cielo azzurro'
    ];

    const results = [];

    for (const prompt of prompts) {
        try {
            console.log(`Generando video per: "${prompt}"`);
            
            const result = await googleVeoService.processGoogleVeoRequest({
                prompt: prompt,
                modelId: 1,
                userId: 123,
                chatId: 456
            });

            results.push({
                prompt: prompt,
                videoUrl: result.videoUrl,
                cost: result.cost
            });

            console.log(`✅ Completato: ${result.videoUrl}`);
            
            // Pausa tra le generazioni
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Errore per "${prompt}":`, error.message);
        }
    }

    console.log('Riepilogo generazioni:');
    results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.prompt} - ${result.videoUrl} (${result.cost} EUR)`);
    });
}
```

### 5. Gestione Errori Avanzata

```javascript
async function generateVideoWithErrorHandling() {
    try {
        // Verifica fondi prima della generazione
        const hasFunds = await googleVeoService.checkUserFunds(123, 0.01);
        if (!hasFunds) {
            throw new Error('Fondi insufficienti');
        }

        // Verifica disponibilità modello
        const isAvailable = await googleVeoService.isModelAvailable('google-veo-1.0');
        if (!isAvailable) {
            throw new Error('Modello non disponibile');
        }

        const result = await googleVeoService.processGoogleVeoRequest({
            prompt: 'Un gatto che gioca con una palla',
            modelId: 1,
            userId: 123,
            chatId: 456,
            onStream: (event) => {
                if (event.type === 'video-generation-error') {
                    console.error('Errore durante la generazione:', event.data.error);
                }
            }
        });

        return result;
    } catch (error) {
        console.error('Errore gestito:', error.message);
        
        // Gestione specifica per diversi tipi di errore
        if (error.message.includes('Fondi insufficienti')) {
            console.log('💡 Suggerimento: Ricarica il wallet');
        } else if (error.message.includes('Rate limit')) {
            console.log('💡 Suggerimento: Aspetta 60 secondi prima di riprovare');
        } else if (error.message.includes('API key')) {
            console.log('💡 Suggerimento: Verifica la configurazione dell\'API key');
        }
        
        throw error;
    }
}
```

### 6. Integrazione con Frontend

```javascript
// Frontend - React Hook per Google Veo
import { useState, useCallback } from 'react';

function useGoogleVeo() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const generateVideo = useCallback(async (prompt, modelId, userId, chatId) => {
        setIsGenerating(true);
        setProgress(0);
        setError(null);
        setResult(null);

        try {
            const response = await fetch(`/api/v1/chats/${chatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    content: prompt,
                    model_id: modelId,
                    agent_type: 'video'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    }, []);

    return {
        generateVideo,
        isGenerating,
        progress,
        error,
        result
    };
}

// Componente React per la generazione video
function VideoGenerator() {
    const { generateVideo, isGenerating, progress, error, result } = useGoogleVeo();
    const [prompt, setPrompt] = useState('');

    const handleGenerate = async () => {
        await generateVideo(prompt, 1, 123, 456);
    };

    return (
        <div>
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Descrivi il video che vuoi generare..."
            />
            <button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? 'Generando...' : 'Genera Video'}
            </button>
            
            {isGenerating && (
                <div>
                    <p>Progresso: {progress}%</p>
                    <progress value={progress} max="100" />
                </div>
            )}
            
            {error && (
                <div style={{ color: 'red' }}>
                    Errore: {error}
                </div>
            )}
            
            {result && (
                <div>
                    <h3>Video Generato!</h3>
                    <video src={result.videoUrl} controls />
                    <p>Costo: {result.cost} EUR</p>
                </div>
            )}
        </div>
    );
}
```

## Esempi di Prompt

### Prompt Semplici

```javascript
const simplePrompts = [
    'Un gatto che gioca con una palla',
    'Un paesaggio di montagna al tramonto',
    'Un robot che cammina in una città futura',
    'Un fiore che sboccia in time-lapse',
    'Un uccello che vola nel cielo azzurro',
    'Una macchina che guida su una strada deserta',
    'Un bambino che ride e gioca',
    'Un temporale con fulmini nel cielo',
    'Un treno che attraversa un ponte',
    'Un pesce che nuota in un acquario'
];
```

### Prompt Avanzati

```javascript
const advancedPrompts = [
    'Un gatto bianco che gioca con una palla rossa in un giardino soleggiato, stile cinematografico',
    'Un robot umanoide che cammina attraverso una città futura con grattacieli di vetro e luci neon',
    'Un fiore rosso che sboccia lentamente in time-lapse, con gocce di rugiada che brillano al sole',
    'Un paesaggio di montagna innevata al tramonto, con nuvole colorate e riflessi nell\'acqua',
    'Un uccello colorato che vola attraverso un canyon roccioso, con cascate e vegetazione lussureggiante',
    'Una macchina sportiva rossa che guida su una strada costiera al tramonto, con l\'oceano sullo sfondo',
    'Un bambino che ride e gioca con bolle di sapone in un parco verde, con altri bambini sullo sfondo',
    'Un temporale drammatico con fulmini che illuminano il cielo scuro, pioggia che cade su una città',
    'Un treno ad alta velocità che attraversa un ponte sospeso su un fiume, con montagne sullo sfondo',
    'Un pesce tropicale colorato che nuota in un acquario con coralli e alghe, illuminato da luci subacquee'
];
```

## Esempi di Testing

### 7. Test Unitario

```javascript
// tests/unit/google-veo.test.js
describe('Google Veo Service', () => {
    test('should generate video successfully', async () => {
        const mockResult = {
            success: true,
            videoUrl: 'https://storage.googleapis.com/test.mp4',
            cost: 0.01
        };

        jest.spyOn(googleVeoService, 'processGoogleVeoRequest')
            .mockResolvedValue(mockResult);

        const result = await googleVeoService.processGoogleVeoRequest({
            prompt: 'test',
            modelId: 1,
            userId: 123,
            chatId: 456
        });

        expect(result.success).toBe(true);
        expect(result.videoUrl).toBeDefined();
        expect(result.cost).toBe(0.01);
    });

    test('should handle insufficient funds', async () => {
        jest.spyOn(googleVeoService, 'checkUserFunds')
            .mockResolvedValue(false);

        await expect(googleVeoService.processGoogleVeoRequest({
            prompt: 'test',
            modelId: 1,
            userId: 123,
            chatId: 456
        })).rejects.toThrow('Fondi insufficienti');
    });
});
```

### 8. Test di Integrazione

```javascript
// tests/integration/google-veo-api.test.js
describe('Google Veo API Integration', () => {
    test('should create video generation request', async () => {
        const response = await request(app)
            .post('/api/v1/chats/123/messages')
            .set('Authorization', 'Bearer test-token')
            .send({
                content: 'Un gatto che gioca con una palla',
                model_id: 1,
                agent_type: 'video'
            })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.videoUrl).toBeDefined();
    });
});
```

## Esempi di Configurazione

### 9. Configurazione Environment

```bash
# .env
GOOGLE_GEMINI_KEY=your_google_veo_api_key_here
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name
GOOGLE_CLOUD_STORAGE_PROJECT_ID=your-project-id
```

### 10. Configurazione Database

```sql
-- Aggiunta provider Google Veo
INSERT INTO providers (name, description, provider_type) 
VALUES ('google-veo', 'Google Veo - Servizio di generazione video da testo', 'direct');

-- Aggiunta modelli Google Veo
INSERT INTO models (name, model_slug, api_model_id, description, id_provider, is_active, capabilities, pricing_type) 
VALUES 
('Google Veo 1.0', 'google-veo-1.0', 'google-veo-1.0', 'Google Veo 1.0 - Modello di generazione video da testo', 1, true, '["video-generation"]', 'per_request'),
('Google Veo 2.0', 'google-veo-2.0', 'google-veo-2.0', 'Google Veo 2.0 - Modello avanzato di generazione video da testo', 1, true, '["video-generation", "video-editing"]', 'per_request');
```

## Best Practices

### 11. Gestione delle Risorse

```javascript
// Cleanup automatico dei file temporanei
async function generateVideoWithCleanup() {
    let tempFile = null;
    
    try {
        const result = await googleVeoService.processGoogleVeoRequest({
            prompt: 'test',
            modelId: 1,
            userId: 123,
            chatId: 456
        });
        
        return result;
    } catch (error) {
        console.error('Errore durante la generazione:', error);
        throw error;
    } finally {
        // Cleanup automatico gestito dal servizio
        console.log('Cleanup completato');
    }
}
```

### 12. Retry Logic

```javascript
async function generateVideoWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Tentativo ${attempt}/${maxRetries}`);
            
            const result = await googleVeoService.processGoogleVeoRequest({
                prompt: prompt,
                modelId: 1,
                userId: 123,
                chatId: 456
            });
            
            return result;
        } catch (error) {
            console.error(`Tentativo ${attempt} fallito:`, error.message);
            
            if (attempt === maxRetries) {
                throw new Error(`Generazione fallita dopo ${maxRetries} tentativi`);
            }
            
            // Pausa esponenziale tra i tentativi
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
```

Questi esempi forniscono una base completa per l'utilizzo del servizio Google Veo in diversi scenari e contesti. 