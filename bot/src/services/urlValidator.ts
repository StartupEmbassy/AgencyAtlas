import Groq from "groq-sdk";
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';

export interface UrlValidationResult {
    isValid: boolean;
    isOnline: boolean;
    matchesBusiness: boolean;
    confidence: number;
    error?: string;
    businessName?: string;
    extractedText?: string;
}

export async function validateRealEstateUrl(url: string, businessName: string): Promise<UrlValidationResult> {
    try {
        // 1. Validar formato de URL
        let formattedUrl = url;
        if (!url.startsWith('http')) {
            formattedUrl = `https://${url}`;
        }

        try {
            new URL(formattedUrl);
        } catch (error) {
            return {
                isValid: false,
                isOnline: false,
                matchesBusiness: false,
                confidence: 0,
                error: 'URL mal formada'
            };
        }

        // 2. Verificar si el sitio está online
        try {
            const response = await fetch(formattedUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 5000
            });

            if (!response.ok) {
                return {
                    isValid: false,
                    isOnline: false,
                    matchesBusiness: false,
                    confidence: 0,
                    error: `Sitio no accesible: ${response.status}`
                };
            }

            // 3. Extraer contenido de la página
            const html = await response.text();
            const dom = new JSDOM(html);
            const document = dom.window.document;

            // Extraer texto relevante
            const title = document.title;
            const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
            const h1s = Array.from(document.querySelectorAll('h1')).map(el => el.textContent || '').join(' ');
            const mainContent = document.querySelector('main')?.textContent || 
                              document.querySelector('body')?.textContent || '';

            // Limpiar y limitar el texto
            const cleanText = `
                Título: ${title}
                Descripción: ${metaDescription}
                Encabezados: ${h1s}
                Contenido principal: ${mainContent.substring(0, 500)}...
            `.replace(/\s+/g, ' ').trim();

            // 4. Analizar con Groq si el contenido coincide con el negocio
            const groq = new Groq();
            const prompt = `
                Analiza si este contenido web pertenece a la inmobiliaria "${businessName}".
                
                Contenido web:
                ${cleanText}

                Responde SOLO con un JSON con este formato:
                {
                    "matchesBusiness": boolean,
                    "confidence": number (0-1),
                    "extractedBusinessName": string,
                    "reasons": [
                        "razón 1: explicación detallada",
                        "razón 2: explicación detallada",
                        "razón 3: explicación detallada"
                    ],
                    "validationDetails": {
                        "nameMatch": boolean,
                        "addressMatch": boolean,
                        "isRealEstateSite": boolean,
                        "foundEvidence": string[]
                    }
                }
            `;

            const analysis = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.2-90b-vision-preview",
                temperature: 0.1,
                max_tokens: 500
            });

            const content = analysis.choices[0].message.content || '';
            const result = JSON.parse(content);

            return {
                isValid: result.matchesBusiness,
                isOnline: true,
                matchesBusiness: result.matchesBusiness,
                confidence: result.confidence,
                businessName: result.extractedBusinessName,
                extractedText: cleanText
            };

        } catch (error) {
            return {
                isValid: false,
                isOnline: false,
                matchesBusiness: false,
                confidence: 0,
                error: error instanceof Error ? error.message : 'Error desconocido al acceder al sitio'
            };
        }

    } catch (error) {
        return {
            isValid: false,
            isOnline: false,
            matchesBusiness: false,
            confidence: 0,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
} 