import { MyContext } from "../types/session";
import { RealEstateRegistration } from "../types/types";
import { deleteMessages } from "../services/messageManager";

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
        
        if (validation.isValid && validation.confidence) {
            summary += ` (${Math.round(validation.confidence * 100)}% match)\n`;
            if (validation.webSummary) {
                summary += `📋 Verificado en web:\n`;
                summary += `- Negocio: ${validation.webSummary.title}\n`;
                summary += `- Ubicación: ${validation.webSummary.location}\n`;
                summary += `- Tipo: ${validation.webSummary.type}\n`;
            }
            const evidence = validation.validationDetails?.foundEvidence;
            if (evidence && evidence.length > 0) {
                summary += `✨ Evidencias encontradas:\n`;
                evidence.forEach((item: string) => {
                    summary += `- ${item}\n`;
                });
            }
        } else if (!validation.isValid) {
            summary += ` - ${validation.error || 'URL inválida'}`;
        }
        
        return summary;
    }

    return '⚠️ Múltiples URLs detectadas:\n' + Array.from(urls).map(url => {
        const validation = validations.get(url);
        if (!validation) return url;
        
        let summary = `${url}${validation.isValid ? ' ✅' : ' ❌'}`;
        
        if (validation.isValid && validation.confidence) {
            summary += ` (${Math.round(validation.confidence * 100)}% match)\n`;
            if (validation.webSummary) {
                summary += `📋 Verificado en web:\n`;
                summary += `- Negocio: ${validation.webSummary.title}\n`;
                summary += `- Ubicación: ${validation.webSummary.location}\n`;
                summary += `- Tipo: ${validation.webSummary.type}\n`;
            }
            const evidence = validation.validationDetails?.foundEvidence;
            if (evidence && evidence.length > 0) {
                summary += `✨ Evidencias encontradas:\n`;
                evidence.forEach((item: string) => {
                    summary += `- ${item}\n`;
                });
            }
        } else if (!validation.isValid) {
            summary += ` - ${validation.error || 'URL inválida'}`;
        }
        
        return summary;
    }).join('\n\n');
} 