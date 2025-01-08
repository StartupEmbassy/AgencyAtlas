import { UrlValidationResult } from "../types/types";
import https from 'https';
import nodeFetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import Groq from 'groq-sdk';
import { resolveShortUrl } from '../utils/helpers';

const agent = new https.Agent({
    keepAlive: true,
    timeout: 30000,  // 30 segundos
    rejectUnauthorized: false
});

async function fetchWithTimeout(url: string, retries = 3): Promise<string> {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await nodeFetch(url, {
                agent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000 * (i + 1) // Incrementar timeout en cada intento
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('text/html')) {
                throw new Error('La respuesta no es HTML');
            }

            return await response.text();
        } catch (error) {
            console.log(`Intento ${i + 1} fallido para URL ${url}:`, error);
            lastError = error;
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i)));
            }
        }
    }
    throw lastError;
}

export async function validateRealEstateUrl(url: string, businessName: string): Promise<UrlValidationResult> {
    try {
        // 1. Validar formato de URL
        let formattedUrl = url;
        if (!url.startsWith('http')) {
            formattedUrl = `https://${url}`;
        }

        // Detectar si es una URL de listado o corta
        const isListingOrShortUrl = formattedUrl.match(/listing|property|eqrco\.de|bit\.ly|goo\.gl|tinyurl\.com|youtube\.com\/watch/i);

        try {
            new URL(formattedUrl);
        } catch (error) {
            return {
                isValid: false,
                matchesBusiness: false,
                confidence: 0,
                error: 'URL mal formada'
            };
        }

        // 2. Si es una URL corta, intentar resolverla primero
        if (isListingOrShortUrl) {
            try {
                formattedUrl = await resolveShortUrl(formattedUrl);
                console.log('URL resuelta a:', formattedUrl);
            } catch (error) {
                console.log('Error resolviendo URL corta:', error);
                // Continuamos con la URL original si hay error
            }
        }

        // 3. Verificar si el sitio está online y obtener contenido
        try {
            console.log(`🔍 Validando URL: ${formattedUrl}`);
            
            // Intentar obtener el contenido de la página
            const html = await fetchWithTimeout(formattedUrl);
            
            // Si es una URL de YouTube, validarla como contenido multimedia
            if (formattedUrl.includes('youtube.com/watch')) {
                try {
                    const videoId = new URL(formattedUrl).searchParams.get('v');
                    if (videoId) {
                        return {
                            isValid: true,
                            matchesBusiness: true,
                            confidence: 0.7,
                            businessName: businessName,
                            webSummary: {
                                title: "Video de YouTube",
                                description: "Video relacionado con la propiedad",
                                location: "",
                                type: "video"
                            },
                            validationDetails: {
                                nameMatch: true,
                                addressMatch: false,
                                isRealEstateSite: true,
                                foundEvidence: ["URL de video de YouTube válida"]
                            }
                        };
                    }
                } catch (error) {
                    console.error('Error validando URL de YouTube:', error);
                }
            }
            
            // Si es una URL de listado conocida, validarla como tal
            if (isListingOrShortUrl && !formattedUrl.includes('youtube.com')) {
                return {
                    isValid: true,
                    matchesBusiness: true,
                    confidence: 0.3,
                    businessName: businessName,
                    webSummary: {
                        title: "Listing URL",
                        description: "URL de listado de propiedad",
                        location: "",
                        type: "listing"
                    },
                    validationDetails: {
                        nameMatch: false,
                        addressMatch: false,
                        isRealEstateSite: true,
                        foundEvidence: ["URL detectada como listado de propiedad"]
                    }
                };
            }

            // Para cualquier otra URL, analizar su contenido
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

            // 5. Analizar con Groq si el contenido coincide con el negocio
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
                    "webSummary": {
                        "title": string,
                        "description": string,
                        "location": string,
                        "type": string
                    },
                    "reasons": [
                        "razón 1: explicación detallada de por qué esta web coincide o no con la inmobiliaria",
                        "razón 2: explicación detallada de elementos específicos encontrados",
                        "razón 3: explicación detallada de coincidencias o discrepancias"
                    ],
                    "validationDetails": {
                        "nameMatch": boolean,
                        "addressMatch": boolean,
                        "isRealEstateSite": boolean,
                        "foundEvidence": [
                            "evidencia 1: descripción detallada de lo encontrado",
                            "evidencia 2: descripción detallada de elementos que confirman que es la web oficial",
                            "evidencia 3: descripción detallada de servicios inmobiliarios encontrados"
                        ]
                    }
                }

                IMPORTANT NOTES:
                1. Be very specific in the reasons, explaining exactly what elements match or don't match.
                2. In foundEvidence, provide detailed descriptions of what makes this the official website.
                3. Look for specific real estate services, property listings, and company information.
                4. Check for address matches, contact information, and business hours.
                5. Analyze the overall professionalism and authenticity of the website.

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
                matchesBusiness: result.matchesBusiness,
                confidence: result.confidence,
                businessName: result.extractedBusinessName,
                extractedText: cleanText,
                webSummary: result.webSummary,
                validationDetails: result.validationDetails
            };

        } catch (error) {
            console.error(`❌ Error validando URL ${formattedUrl}:`, error);
            return {
                isValid: false,
                matchesBusiness: false,
                confidence: 0,
                error: error instanceof Error ? error.message : 'Error desconocido al acceder al sitio'
            };
        }
    } catch (error) {
        return {
            isValid: false,
            matchesBusiness: false,
            confidence: 0,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
} 