"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRealEstateUrl = validateRealEstateUrl;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const jsdom_1 = require("jsdom");
const node_fetch_1 = __importDefault(require("node-fetch"));
async function validateRealEstateUrl(url, businessName) {
    try {
        // 1. Validar formato de URL
        let formattedUrl = url;
        if (!url.startsWith('http')) {
            formattedUrl = `https://${url}`;
        }
        try {
            new URL(formattedUrl);
        }
        catch (error) {
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
            const response = await (0, node_fetch_1.default)(formattedUrl, {
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
            const dom = new jsdom_1.JSDOM(html);
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
            const groq = new groq_sdk_1.default();
            const prompt = `
                Analiza si este contenido web pertenece a la inmobiliaria "${businessName}".
                
                Contenido web:
                ${cleanText}

                Responde SOLO con un JSON con este formato:
                {
                    "matchesBusiness": boolean,
                    "confidence": number (0-1),
                    "extractedBusinessName": string,
                    "webSummary": {
                        "title": string,
                        "description": string,
                        "location": string,
                        "type": string
                    },
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

                Asegúrate de que el resumen web (webSummary) sea conciso y legible, sin caracteres especiales.
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
                extractedText: cleanText,
                webSummary: result.webSummary,
                validationDetails: result.validationDetails
            };
        }
        catch (error) {
            return {
                isValid: false,
                isOnline: false,
                matchesBusiness: false,
                confidence: 0,
                error: error instanceof Error ? error.message : 'Error desconocido al acceder al sitio'
            };
        }
    }
    catch (error) {
        return {
            isValid: false,
            isOnline: false,
            matchesBusiness: false,
            confidence: 0,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
