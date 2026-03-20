# Migliorie al Rate Limiter

## Problema Risolto

Il rate limiter precedente era configurato **per IP**, causando problemi in ambiente di sviluppo dove un singolo utente poteva facilmente superare il limite di 60 richieste al minuto.

## Soluzioni Implementate

### 1. Rate Limiting per Utente

Il rate limiter ora distingue tra utenti diversi dallo stesso IP:

-   **Utenti autenticati**: Rate limit calcolato per `IP + User ID`
-   **Utenti con JWT**: Rate limit calcolato per `IP + JWT User ID`
-   **Utenti anonimi**: Rate limit calcolato per `IP + "anonymous"`

### 2. Limiti Differenziati per Ambiente

-   **Development**: 1000 richieste al minuto (per facilitare il testing)
-   **Production**: 60 richieste al minuto (sicurezza)

### 3. Caricamento Automatico dell'Utente

Il middleware `loadUserFromToken` viene applicato automaticamente prima del rate limiting per assicurarsi che `req.user` sia sempre disponibile quando possibile.

## Implementazione Tecnica

### Chiave di Rate Limiting

```javascript
const generateRateLimitKey = (req) => {
	const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";

	// Se l'utente è autenticato, includi il suo ID nella chiave
	if (req.user && req.user.id) {
		return `${ip}-user-${req.user.id}`;
	}

	// Se c'è un token JWT valido ma l'utente non è ancora stato caricato
	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.startsWith("Bearer ")) {
		try {
			const jwt = require("jsonwebtoken");
			const config = require("../config/config");
			const token = authHeader.split(" ")[1];
			const decoded = jwt.verify(token, config.jwt.secret);
			return `${ip}-jwt-${decoded.id}`;
		} catch (error) {
			// Token non valido, usa solo IP
		}
	}

	// Fallback: usa solo IP per utenti non autenticati
	return `${ip}-anonymous`;
};
```

### Configurazione del Limite

```javascript
const apiLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minuto
	max: process.env.NODE_ENV === "development" ? 1000 : 60,
});
```

### Middleware Combinato

```javascript
const apiLimiterWithUser = [
	loadUserFromToken, // Carica l'utente dal JWT
	apiLimiter, // Applica il rate limiting
];
```

## Vantaggi

1. **Isolamento per Utente**: Ogni utente ha il proprio limite indipendentemente dall'IP
2. **Sicurezza Migliorata**: Previene attacchi di forza bruta per utente specifico
3. **Sviluppo Facilitato**: Limiti più alti in development
4. **Compatibilità**: Funziona con sia JWT che sessioni
5. **Fallback Robusto**: Gestisce correttamente utenti non autenticati

## Test

Per testare il funzionamento:

```bash
node test-rate-limiter.js
```

## Monitoraggio

Il rate limiter include header informativi:

-   `X-RateLimit-Limit`: Limite massimo di richieste
-   `X-RateLimit-Remaining`: Richieste rimanenti
-   `X-RateLimit-Reset`: Timestamp di reset del limite

## Note per la Produzione

-   In produzione, considerare l'uso di Redis invece di InMemoryStore per scalabilità
-   Monitorare i log per identificare pattern di abuso
-   Considerare l'implementazione di whitelist per IP fidati
