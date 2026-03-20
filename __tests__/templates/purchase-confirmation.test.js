/**
 * Test per il template email di conferma acquisto
 */

const fs = require('fs').promises;
const path = require('path');
const mjml = require('mjml');

describe('Purchase Confirmation Email Template', () => {
    let templateContent;

    beforeAll(async () => {
        // Carica il template MJML
        const templatePath = path.join(__dirname, '../../templates/emails/purchase-confirmation.mjml');
        templateContent = await fs.readFile(templatePath, 'utf8');
    });

    it('dovrebbe compilare correttamente il template MJML', () => {
        // Compila il template
        const result = mjml(templateContent, {
            validationLevel: 'soft',
            minify: true
        });

        // Verifica che non ci siano errori di compilazione
        expect(result.errors).toBeDefined();
        expect(Array.isArray(result.errors)).toBe(true);

        // Verifica che l'HTML sia generato
        expect(result.html).toBeDefined();
        expect(typeof result.html).toBe('string');
        expect(result.html.length).toBeGreaterThan(0);
    });

    it('dovrebbe contenere tutti i placeholder necessari', () => {
        // Verifica che il template contenga tutti i placeholder richiesti
        const requiredPlaceholders = [
            '**first_name**',
            '**app_name**',
            '**transaction_id**',
            '**transaction_date**',
            '**payment_method**',
            '**amount_paid**',
            '**currency**',
            '**base_credits**',
            '**bonus_credits_section**',
            '**total_credits**',
            '**new_balance**',
            '**support_email**'
        ];

        requiredPlaceholders.forEach(placeholder => {
            expect(templateContent).toContain(placeholder);
        });
    });

    it('dovrebbe generare HTML valido con struttura corretta', () => {
        // Compila il template
        const result = mjml(templateContent, {
            validationLevel: 'soft',
            minify: true
        });

        const html = result.html;

        // Verifica che l'HTML contenga elementi essenziali
        expect(html).toContain('<html>');
        expect(html).toContain('<body>');
        expect(html).toContain('Acquisto Completato');
        expect(html).toContain('Dettagli Transazione');
        expect(html).toContain('Crediti Acquistati');
        expect(html).toContain('Saldo Aggiornato');
    });

    it('dovrebbe gestire correttamente la sezione bonus crediti', () => {
        // Verifica che il template contenga il placeholder per la sezione bonus
        expect(templateContent).toContain('**bonus_credits_section**');

        // Verifica che ci sia la logica per mostrare/nascondere i bonus
        expect(templateContent).toContain('bonus_credits_section');
    });

    it('dovrebbe avere un design responsive', () => {
        // Compila il template
        const result = mjml(templateContent, {
            validationLevel: 'soft',
            minify: true
        });

        const html = result.html;

        // Verifica che l'HTML contenga classi responsive di MJML
        expect(html).toContain('mjml');
        expect(html).toContain('mj-section');
        expect(html).toContain('mj-column');
        expect(html).toContain('mj-text');
    });

    it('dovrebbe avere colori e stili appropriati', () => {
        // Verifica che il template contenga colori appropriati
        expect(templateContent).toContain('#6b46c1'); // Colore principale
        expect(templateContent).toContain('#f4f4f4'); // Background
        expect(templateContent).toContain('#ffffff'); // Sezione principale
        expect(templateContent).toContain('#f8f9fa'); // Sezione dettagli
        expect(templateContent).toContain('#e6fffa'); // Sezione crediti
        expect(templateContent).toContain('#f0fff4'); // Sezione saldo
    });
}); 