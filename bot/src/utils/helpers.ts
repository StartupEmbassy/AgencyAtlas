import { MyContext } from "../types/session";
import { RealEstateRegistration } from "../types/types";
import { deleteMessages } from "../services/messageManager";
import nodeFetch from 'node-fetch';
import https from 'https';

// Crear un agente HTTPS personalizado con timeouts más largos
const agent = new https.Agent({
    keepAlive: true,
    timeout: 30000,  // 30 segundos
    rejectUnauthorized: false
});

// Helper para limpiar URLs de parámetros innecesarios
function cleanUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        
        // Lista de parámetros a eliminar
        const paramsToRemove = [
            'feature',
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'fbclid',
            'gclid',
            '_ga'
        ];

        // Eliminar parámetros innecesarios
        paramsToRemove.forEach(param => {
            urlObj.searchParams.delete(param);
        });

        // Si es YouTube y solo queda el parámetro v, mantener una URL limpia
        if (urlObj.hostname.includes('youtube.com') && 
            urlObj.searchParams.has('v') && 
            urlObj.searchParams.size === 1) {
            return `https://www.youtube.com/watch?v=${urlObj.searchParams.get('v')}`;
        }

        return urlObj.toString();
    } catch {
        return url;
    }
}

// Helper para resolver URLs cortas
export async function resolveShortUrl(url: string): Promise<string> {
    try {
        console.log(`🔍 Resolviendo URL corta: ${url}`);
        
        // Validar formato de URL
        let formattedUrl = url;
        if (!url.startsWith('http')) {
            formattedUrl = `https://${url}`;
        }

        // Intentar resolver la URL usando GET en lugar de HEAD
        const response = await nodeFetch(formattedUrl, {
            method: 'GET',
            redirect: 'follow',
            agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 30000
        });
        
        // La URL final después de todas las redirecciones
        let finalUrl = response.url;
        
        // Verificar si la URL final es válida y diferente
        if (!finalUrl || finalUrl === url || finalUrl === formattedUrl) {
            console.log(`⚠️ URL no redirigida o igual: ${url} -> ${finalUrl}`);
            return url;
        }

        // Intentar extraer la URL real de la página si es necesario
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('text/html')) {
            const html = await response.text();
            // Buscar meta refresh o redirección JavaScript
            const metaRefresh = html.match(/content="0;URL='(.+?)'/i);
            const jsRedirect = html.match(/window\.location\.href\s*=\s*['"](.+?)['"]/i);
            if (metaRefresh?.[1]) {
                console.log('📍 Encontrada redirección meta refresh:', metaRefresh[1]);
                finalUrl = metaRefresh[1];
            }
            else if (jsRedirect?.[1]) {
                console.log('📍 Encontrada redirección JavaScript:', jsRedirect[1]);
                finalUrl = jsRedirect[1];
            }
        }

        // Limpiar la URL final de parámetros innecesarios
        const cleanedUrl = cleanUrl(finalUrl);
        console.log(`✅ URL resuelta y limpiada: ${cleanedUrl}`);
        return cleanedUrl;

    } catch (error) {
        console.error(`❌ Error resolviendo URL corta:`, error);
        return url;
    }
}

// Helper para borrar mensajes del paso anterior
export async function deletePreviousMessages(ctx: MyContext) {
    if (ctx.chat) {
        await deleteMessages(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        // Limpiar los arrays después de borrar
        ctx.session.botMessageIds = [];
        ctx.session.userMessageIds = [];
    }
}

// Helper para loggear el estado
export function logState(ctx: MyContext, action: string) {
    console.log('\n=== Estado de Sesión ===');
    console.log('Acción:', action);
    console.log('Step:', ctx.session.registration.step);
    console.log('Registration:', JSON.stringify(ctx.session.registration.currentRegistration, null, 2));
    console.log('=====================\n');
}

// Helper para crear una nueva registración
export function createNewRegistration(initial: Partial<RealEstateRegistration> = {}): RealEstateRegistration {
    return {
        started_at: Date.now(),
        last_update: Date.now(),
        messages_ids: [],
        photos: [],
        ...initial
    };
}

// Helper para formatear el resumen de URLs
export function formatUrlSummary(urls: Set<string>, validations: Map<string, any>): string {
    if (urls.size === 0) return 'No detectadas';
    if (urls.size === 1) {
        const url = Array.from(urls)[0];
        const validation = validations.get(url);
        if (!validation) return url;
        
        let summary = `${url}${validation.isValid ? ' ✅' : ' ❌'}`;
        
        if (validation.isValid) {
            if (validation.confidence) {
                summary += ` (${Math.round(validation.confidence * 100)}% match)\n`;
            }
            if (validation.webSummary) {
                summary += `📋 Verificado en web:\n`;
                summary += `- Tipo: ${validation.webSummary.type}\n`;
                if (validation.webSummary.title) summary += `- Título: ${validation.webSummary.title}\n`;
                if (validation.webSummary.location) summary += `- Ubicación: ${validation.webSummary.location}\n`;
            }
            const evidence = validation.validationDetails?.foundEvidence;
            if (evidence && evidence.length > 0) {
                summary += `✨ Evidencias encontradas:\n`;
                evidence.forEach((item: string) => {
                    summary += `- ${item}\n`;
                });
            }
        } else if (!validation.isValid && !url.includes('youtube.com')) {
            // Solo mostrar error si no es YouTube
            summary += ` - ${validation.error || 'URL inválida'}`;
        }
        
        return summary;
    }

    return '⚠️ Múltiples URLs detectadas:\n' + Array.from(urls).map(url => {
        const validation = validations.get(url);
        if (!validation) return url;
        
        let summary = `${url}${validation.isValid ? ' ✅' : ' ❌'}`;
        
        if (validation.isValid) {
            if (validation.confidence) {
                summary += ` (${Math.round(validation.confidence * 100)}% match)\n`;
            }
            if (validation.webSummary) {
                summary += `📋 Verificado en web:\n`;
                summary += `- Tipo: ${validation.webSummary.type}\n`;
                if (validation.webSummary.title) summary += `- Título: ${validation.webSummary.title}\n`;
                if (validation.webSummary.location) summary += `- Ubicación: ${validation.webSummary.location}\n`;
            }
            const evidence = validation.validationDetails?.foundEvidence;
            if (evidence && evidence.length > 0) {
                summary += `✨ Evidencias encontradas:\n`;
                evidence.forEach((item: string) => {
                    summary += `- ${item}\n`;
                });
            }
        } else if (!validation.isValid && !url.includes('youtube.com')) {
            // Solo mostrar error si no es YouTube
            summary += ` - ${validation.error || 'URL inválida'}`;
        }
        
        return summary;
    }).join('\n\n');
}

export interface QRValidationResult {
    isValid: boolean;
    url?: string;
    urlSource: 'qr' | 'text' | undefined;
    confidence: number;
}

export const validateAndProcessQR = async (qrData: string): Promise<QRValidationResult> => {
    qrData = qrData.trim();
    if (qrData.length < 8) return { 
        isValid: false, 
        confidence: 0,
        urlSource: undefined 
    };
    
    try {
        // Si es una URL, mayor confianza
        const url = new URL(qrData.startsWith('http') ? qrData : `https://${qrData}`);
        
        // Si es una URL corta conocida, resolverla
        if (url.hostname.includes('eqrco.de') || 
            url.hostname.includes('bit.ly') || 
            url.hostname.includes('goo.gl') || 
            url.hostname.includes('tinyurl.com')) {
            const resolvedUrl = await resolveShortUrl(url.toString());
            return { 
                isValid: true, 
                url: resolvedUrl,
                urlSource: 'qr',
                confidence: 0.9  // Alta confianza para URLs en QRs
            };
        }
        
        return { 
            isValid: true, 
            url: url.toString(),
            urlSource: 'qr',
            confidence: 0.9  // Alta confianza para URLs en QRs
        };
    } catch {
        // Si no es URL pero cumple longitud mínima
        return { 
            isValid: true,
            urlSource: 'text',
            confidence: 0.6  // Menor confianza para texto
        };
    }
};

export function normalizeUrl(url: string): string {
    try {
        const normalized = new URL(url.startsWith('http') ? url : `https://${url}`);
        return normalized.toString().replace(/\/$/, ''); // Eliminar slash final si existe
    } catch {
        return url;
    }
}

export function validatePhoneNumber(phone: string): string | null {
    // Limpiar el número de espacios y caracteres no numéricos excepto +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // Si el número es demasiado largo (probablemente concatenado)
    if (cleanPhone.length > 15) {
        // Intentar separar en números válidos
        const possibleNumbers = cleanPhone.match(/\+?\d{9,15}/g);
        if (possibleNumbers && possibleNumbers.length > 0) {
            // Devolver el primer número válido encontrado
            return possibleNumbers[0];
        }
        return null;
    }
    
    // Validar longitud mínima y máxima para un número internacional
    if (cleanPhone.length >= 9 && cleanPhone.length <= 15) {
        return cleanPhone;
    }
    
    return null;
} 