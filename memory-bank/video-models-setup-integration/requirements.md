# Integrazione Modelli Video nel Sistema di Setup

## Contesto

Il sistema Aigens Backend dispone di un sistema unificato per l'aggiornamento dei modelli AI tramite lo script `scripts/update-models-info/update-all-models.js`. Attualmente questo script gestisce i seguenti provider:

- Anthropic
- OpenAI  
- Ideogram
- OpenRouter
- Together AI

## Obiettivo

Integrare i modelli video esistenti nel sistema di setup unificato:

- **Google Veo3** (`update-veo3-models.js`)
- **Runway** (`update-runway-models.js`) 
- **Amazon Nova** (`update-nova-models.js`)

## Requisiti

1. **Aggiungere i provider video** al file `update-all-models.js`
2. **Aggiornare la documentazione** con i nuovi flag di comando
3. **Mantenere la compatibilità** con il sistema esistente
4. **Verificare la funzionalità** dei nuovi script integrati

## Provider da Integrare

### Google Veo3
- **Script**: `update-veo3-models.js`
- **Flag**: `--veo3`
- **Nome**: "Google Veo3"
- **Modelli**: Veo 3 (Video + Audio), Veo 3 (Video Only), Veo 3 Fast

### Runway
- **Script**: `update-runway-models.js`
- **Flag**: `--runway`
- **Nome**: "Runway"
- **Modelli**: Gen-3 Alpha, Gen-3 Alpha Turbo, Gen-4, Gen-4 Turbo

### Amazon Nova
- **Script**: `update-nova-models.js`
- **Flag**: `--nova`
- **Nome**: "Amazon Nova"
- **Modelli**: Nova Reel 1.0, Nova Reel 1.1

## Criteri di Successo

- [ ] I provider video sono integrati nel sistema unificato
- [ ] I flag `--veo3`, `--runway`, `--nova` funzionano correttamente
- [ ] La documentazione help è aggiornata
- [ ] Gli script possono essere eseguiti individualmente e in gruppo
- [ ] Il sistema mantiene la retrocompatibilità
