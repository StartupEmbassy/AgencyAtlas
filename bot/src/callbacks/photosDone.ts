import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";
import { analyzeImage } from "../services/imageAnalysis";
import { validateRealEstateUrl } from "../services/urlValidator";
import { deletePreviousMessages } from "../utils/helpers";
import { formatUrlSummary } from "../utils/helpers";
import type { UrlValidationResult } from "../services/urlValidator";
import type { PhotoRegistration } from "../types/types";

// Helper para normalizar números de teléfono
function normalizePhoneNumber(phone: string): string {
    // Eliminar todos los caracteres no numéricos excepto +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // Si empieza con 00, reemplazar por +
    if (normalized.startsWith('00')) {
        normalized = '+' + normalized.slice(2);
    }
    
    // Si empieza con 0 y tiene 9-10 dígitos, asumimos que es francés y añadimos +33
    if (normalized.startsWith('0') && normalized.length >= 9 && normalized.length <= 10) {
        normalized = '+33' + normalized.slice(1);
    }
    
    return normalized;
}

// Helper para verificar si dos números son similares
function areSimilarPhoneNumbers(phone1: string, phone2: string): boolean {
    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);
    
    // Si son exactamente iguales
    if (normalized1 === normalized2) return true;
    
    // Si uno contiene al otro (para casos donde uno tiene más dígitos)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
    
    // Si solo difieren en el prefijo internacional
    const withoutPrefix1 = normalized1.replace(/^\+\d{1,3}/, '');
    const withoutPrefix2 = normalized2.replace(/^\+\d{1,3}/, '');
    if (withoutPrefix1 === withoutPrefix2) return true;
    
    return false;
}

export async function handlePhotosDone(ctx: MyContext) {
    try {
        await ctx.answerCallbackQuery();
        
        if (!ctx.session.registration.currentRegistration?.photos.length) {
            await ctx.reply("Debes enviar al menos una foto.");
            return;
        }

        console.log(`🚀 Iniciando análisis de ${ctx.session.registration.currentRegistration.photos.length} fotos en paralelo`);

        // Borrar mensajes anteriores
        await deletePreviousMessages(ctx);

        // Informar que comienza el análisis
        const processingMsg = await ctx.reply("🔄 Analizando las fotos con Gemini...");

        // Preparar todas las promesas de análisis
        console.log('📸 Preparando promesas de análisis...');
        const analysisPromises = ctx.session.registration.currentRegistration.photos.map(async (photo, index) => {
            console.log(`📸 [Foto ${index + 1}] Obteniendo URL de Telegram...`);
            const file = await ctx.api.getFile(photo.file_id);
            const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            console.log(`📸 [Foto ${index + 1}] Iniciando análisis con Gemini/Groq...`);
            const startTime = Date.now();
            const analysis = await analyzeImage(photoUrl);
            const endTime = Date.now();
            console.log(`📸 [Foto ${index + 1}] Análisis completado en ${endTime - startTime}ms usando ${analysis.provider}`);
            return { photo, analysis, analysisTime: endTime - startTime };
        });

        // Analizar todas las fotos en paralelo
        let analyzedPhotos: PhotoRegistration[] = [];
        let geminiError = false;
        let errorMessage = '';
        let usingGroq = false;

        try {
            console.log('🔄 Iniciando Promise.all para análisis paralelo...');
            const startTime = Date.now();
            const analysisResults = await Promise.all(analysisPromises);
            const endTime = Date.now();
            console.log(`✅ Análisis paralelo completado en ${endTime - startTime}ms`);
            
            // Estadísticas de tiempo
            const times = analysisResults.map(r => r.analysisTime);
            console.log(`📊 Estadísticas de tiempo de análisis:
            - Tiempo total: ${endTime - startTime}ms
            - Tiempo promedio por foto: ${times.reduce((a, b) => a + b, 0) / times.length}ms
            - Tiempo mínimo: ${Math.min(...times)}ms
            - Tiempo máximo: ${Math.max(...times)}ms`);

            // Procesar los resultados
            for (const result of analysisResults) {
                const { photo, analysis } = result;
                
                if ('error' in analysis && analysis.error) {
                    geminiError = true;
                    errorMessage = analysis.error_message || 'Error desconocido';
                    break;
                }

                if (analysis.provider === 'groq') {
                    usingGroq = true;
                }

                analyzedPhotos.push({
                    ...photo,
                    analysis,
                    is_main: analysis.objects_detected?.some((obj: string) => 
                        obj.toLowerCase().includes('storefront') || 
                        obj.toLowerCase().includes('facade') || 
                        obj.toLowerCase().includes('building') ||
                        obj.toLowerCase().includes('office')
                    ) ?? false
                });
            }

            // Actualizar mensaje de procesamiento según el proveedor
            if (ctx.chat) {
                if (usingGroq) {
                    await ctx.api.editMessageText(
                        ctx.chat.id,
                        processingMsg.message_id,
                        "⚠️ Gemini no está disponible, usando Groq como alternativa..."
                    );
                } else {
                    await ctx.api.editMessageText(
                        ctx.chat.id,
                        processingMsg.message_id,
                        "✅ Análisis completado"
                    );
                }
            }

        } catch (error) {
            console.error("Error al analizar fotos:", error);
            geminiError = true;
            errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        }

        // Borrar mensaje de procesamiento
        if (ctx.chat) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
            } catch (error) {
                console.error("Error al borrar mensaje de procesamiento:", error);
            }
        }

        // Si hubo error, informar al usuario y dar opciones
        if (geminiError) {
            const keyboard = new InlineKeyboard()
                .text("🔄 Reintentar", "photos_done")
                .text("👤 Continuar sin análisis", "manual_input")
                .row()
                .text("❌ Cancelar", "cancel");

            await ctx.reply(`⚠️ Error al analizar las imágenes: ${errorMessage}\n\nPuedes:\n- Reintentar el análisis\n- Continuar e introducir los datos manualmente\n- Cancelar el proceso`, {
                reply_markup: keyboard
            });
            return;
        }

        // Actualizar las fotos con sus análisis
        ctx.session.registration.currentRegistration.photos = analyzedPhotos;

        // Obtener el mejor nombre y otra información relevante
        let bestName: string | undefined;
        let bestConfidence = 0;
        let allQrData: Set<string> = new Set();
        let allWebUrls: Set<string> = new Set();
        let allObjects: Set<string> = new Set();
        let validationReasons: Set<string> = new Set();
        let allPhoneNumbers: Set<string> = new Set();
        let allEmails: Set<string> = new Set();
        let businessHours: string | undefined;

        for (const photo of analyzedPhotos) {
            const analysis = photo.analysis;
            if (analysis) {
                // Nombre del negocio - Ya manejado con confidence
                if (analysis.confidence && analysis.name && analysis.confidence > bestConfidence) {
                    bestName = analysis.name;
                    bestConfidence = analysis.confidence;
                }

                // URLs - Validar formato y contar ocurrencias
                if (analysis.web_url) {
                    try {
                        // Intentar crear URL para validar formato
                        new URL(analysis.web_url.startsWith('http') ? analysis.web_url : `https://${analysis.web_url}`);
                        allWebUrls.add(analysis.web_url);
                    } catch (error) {
                        console.log(`URL inválida ignorada: ${analysis.web_url}`);
                    }
                }

                // QR - Solo añadir si parece un formato válido (al menos 5 caracteres)
                if (analysis.qr_data && analysis.qr_data.length > 5) {
                    allQrData.add(analysis.qr_data);
                }

                // Teléfonos - Validar formato básico y eliminar duplicados
                if (analysis.phone_numbers) {
                    analysis.phone_numbers.forEach((phone: string) => {
                        const normalizedPhone = normalizePhoneNumber(phone);
                        
                        // Solo añadir si tiene al menos 9 dígitos y no es similar a ninguno existente
                        if (normalizedPhone.replace(/[^\d]/g, '').length >= 9) {
                            // Verificar si ya existe un número similar
                            const hasSimilar = Array.from(allPhoneNumbers).some(existingPhone => 
                                areSimilarPhoneNumbers(normalizedPhone, existingPhone)
                            );
                            
                            if (!hasSimilar) {
                                allPhoneNumbers.add(normalizedPhone);
                            }
                        }
                    });
                }

                // Emails - Validar formato
                if (analysis.emails) {
                    analysis.emails.forEach((email: string) => {
                        if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                            allEmails.add(email);
                        }
                    });
                }

                // Horario - Usar el más completo (más caracteres)
                if (analysis.business_hours && (!businessHours || analysis.business_hours.length > businessHours.length)) {
                    businessHours = analysis.business_hours;
                }

                // Objetos detectados y razones de validación
                if (analysis.objects_detected) {
                    analysis.objects_detected.forEach((obj: string) => allObjects.add(obj));
                }
                if (analysis.validation_reasons) {
                    analysis.validation_reasons.forEach((reason: string) => validationReasons.add(reason));
                }
            }
        }

        // Verificar si tenemos una foto principal
        const hasMainPhoto = analyzedPhotos.some(p => p.is_main);
        if (!hasMainPhoto) {
            await ctx.reply("No se detectó ninguna foto de la fachada del local. Por favor, asegúrate de incluir una foto del frente del local.");
            return;
        }

        // Si hay múltiples URLs, mostrarlas todas para que el usuario elija después
        const multipleUrls = allWebUrls.size > 1;
        const multipleQrs = allQrData.size > 1;

        // Validar URLs si tenemos un nombre de negocio
        let validatedUrls: Map<string, UrlValidationResult> = new Map();
        if (bestName && allWebUrls.size > 0) {
            const processingMsg = await ctx.reply("🔍 Validando URLs detectadas...");
            
            // Validar todas las URLs en paralelo
            const urlValidations = await Promise.all(
                Array.from(allWebUrls).map(url => validateRealEstateUrl(url, bestName!))
            );

            // Guardar los resultados
            Array.from(allWebUrls).forEach((url, index) => {
                validatedUrls.set(url, urlValidations[index]);
            });

            // Borrar mensaje de procesamiento
            if (ctx.chat) {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
                } catch (error) {
                    console.error("Error al borrar mensaje de procesamiento:", error);
                }
            }
        }

        // Actualizar el registro con toda la información recopilada
        if (ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration.name = bestName;
            ctx.session.registration.currentRegistration.qr = Array.from(allQrData).join(', ');
            
            // Filtrar solo las URLs válidas
            const validUrls = Array.from(allWebUrls).filter(url => {
                const validation = validatedUrls.get(url);
                return validation?.isValid && validation.matchesBusiness;
            });
            
            ctx.session.registration.currentRegistration.web_url = validUrls.join(', ');
            ctx.session.registration.currentRegistration.contact_info = {
                phone_numbers: Array.from(allPhoneNumbers),
                emails: Array.from(allEmails),
                business_hours: businessHours
            };
        }

        // Mostrar resumen de la información detectada con advertencias si hay datos múltiples
        const summary = `He analizado las fotos ${usingGroq ? 'usando Groq' : 'usando Gemini'} y encontrado:\n\n` +
            `🏢 Nombre: ${bestName || 'No detectado'}${bestConfidence ? ` (Confianza: ${Math.round(bestConfidence * 100)}%)` : ''}\n` +
            `📱 QR: ${allQrData.size > 0 ? (multipleQrs ? '⚠️ Múltiples QRs detectados:\n' + Array.from(allQrData).join('\n') : 'Detectado') : 'No detectado'}\n` +
            `🌐 URLs: ${allWebUrls.size > 0 ? formatUrlSummary(allWebUrls, validatedUrls) : 'No detectadas'}\n` +
            `☎️ Teléfonos: ${Array.from(allPhoneNumbers).join(', ') || 'No detectados'}\n` +
            `📧 Emails: ${Array.from(allEmails).join(', ') || 'No detectados'}\n` +
            `🕒 Horario: ${businessHours || 'No detectado'}\n\n` +
            `${multipleUrls || multipleQrs ? '⚠️ Se han detectado múltiples valores para algunos campos. Por favor, verifica la información.\n\n' : ''}` +
            `¿Los datos son correctos?`;

        const keyboard = new InlineKeyboard()
            .text("✅ Sí, continuar", "confirm_info")
            .text("❌ No, cancelar", "cancel");

        await ctx.reply(summary, { reply_markup: keyboard });

    } catch (error) {
        console.error("Error al finalizar envío de fotos:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
} 