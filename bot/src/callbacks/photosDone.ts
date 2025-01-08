import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";
import { validateRealEstateUrl } from "../services/urlValidator";
import { deletePreviousMessages, validateAndProcessQR, QRValidationResult, normalizeUrl, validatePhoneNumber } from "../utils/helpers";
import { formatUrlSummary } from "../utils/helpers";
import { analyzePhotosInBatches } from "../utils/photoUtils";
import type { UrlValidationResult, PhotoRegistration } from "../types/types";

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

interface QRInfo {
    qrData: string;
    photo: PhotoRegistration;
    validation: QRValidationResult;
}

export async function handlePhotosDone(ctx: MyContext) {
    try {
        await ctx.answerCallbackQuery();
        
        if (!ctx.session.registration.currentRegistration?.photos.length) {
            await ctx.reply("Debes enviar al menos una foto.");
            return;
        }

        console.log(`🚀 Iniciando análisis de ${ctx.session.registration.currentRegistration.photos.length} fotos`);

        // Borrar mensajes anteriores
        await deletePreviousMessages(ctx);

        // Informar que comienza el análisis
        const processingMsg = await ctx.reply("🔄 Iniciando análisis de fotos...");

        // Analizar fotos en lotes
        let analyzedPhotos: PhotoRegistration[] = [];
        let geminiError = false;
        let errorMessage = '';
        let usingGroq = false;

        try {
            // Actualizar mensaje con el número total de fotos
            await ctx.api.editMessageText(
                ctx.chat!.id,
                processingMsg.message_id,
                `🔄 Iniciando análisis de ${ctx.session.registration.currentRegistration.photos.length} fotos...`
            );

            const analysisResults = await analyzePhotosInBatches(
                ctx, 
                ctx.session.registration.currentRegistration.photos,
                1  // Procesar 1 foto a la vez
            );
            
            // Procesar los resultados
            let processedCount = 0;
            for (const result of analysisResults) {
                const { photo, analysis } = result;
                processedCount++;
                
                // Construir mensaje de progreso detallado
                let statusMsg = `📸 Foto ${processedCount}/${analysisResults.length}\n`;
                
                if (analysis.provider) {
                    statusMsg += `🤖 Usando ${analysis.provider === 'groq' ? 'Groq' : 'Gemini'}...\n`;
                }

                // Si hay análisis de QR en progreso
                if (analysis.qr_data) {
                    statusMsg += `✨ QR encontrado: ${analysis.qr_data.substring(0, 30)}${analysis.qr_data.length > 30 ? '...' : ''}\n`;
                }

                // Si hay detección de elementos
                if (analysis.objects_detected?.length) {
                    const mainObjects = analysis.objects_detected.slice(0, 3);
                    statusMsg += `🔍 Detectado: ${mainObjects.join(', ')}${analysis.objects_detected.length > 3 ? '...' : ''}\n`;
                }

                // Si se encontró un nombre
                if (analysis.name) {
                    statusMsg += `🏢 Nombre: ${analysis.name}\n`;
                }

                // Si se encontraron contactos
                if (analysis.phone_numbers?.length || analysis.emails?.length) {
                    statusMsg += `📞 Información de contacto encontrada\n`;
                }

                try {
                    // Actualizar mensaje de estado
                    await ctx.api.editMessageText(
                        ctx.chat!.id,
                        processingMsg.message_id,
                        statusMsg
                    );
                } catch (error) {
                    console.error("Error al actualizar mensaje de progreso:", error);
                }

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

            // Mensaje final más informativo
            const finalMsg = usingGroq 
                ? "⚠️ Gemini no disponible, usando Groq como alternativa...\n✅ Análisis completado\n📊 Procesando resultados..."
                : "✅ Análisis completado con éxito\n📊 Procesando resultados finales...";

            try {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    processingMsg.message_id,
                    finalMsg
                );
            } catch (error) {
                console.error("Error al actualizar mensaje final:", error);
            }

            // Esperar un momento para que el usuario pueda leer el mensaje
            await new Promise(resolve => setTimeout(resolve, 2000));

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
        let allWebUrls: Set<string> = new Set();
        let allObjects: Set<string> = new Set();
        let validationReasons: Set<string> = new Set();
        let allPhoneNumbers: Set<string> = new Set();
        let allEmails: Set<string> = new Set();
        let businessHours: string | undefined;

        // Crear un mapa para rastrear qué fotos tienen cada QR
        let qrInfoMap = new Map<string, QRInfo>();
        
        // Procesar QRs primero
        for (const photo of analyzedPhotos) {
            if (photo.analysis?.qr_data) {
                const validation = await validateAndProcessQR(photo.analysis.qr_data);
                if (validation.isValid) {
                    qrInfoMap.set(photo.analysis.qr_data, {
                        qrData: photo.analysis.qr_data,
                        photo,
                        validation
                    });
                    
                    if (validation.url) {
                        allWebUrls.add(normalizeUrl(validation.url));
                    }
                }
            }
        }

        // Procesar URLs detectadas en texto
        for (const photo of analyzedPhotos) {
            if (photo.analysis?.web_url) {
                try {
                    const validation = await validateAndProcessQR(photo.analysis.web_url);
                    if (validation.isValid && validation.url && !allWebUrls.has(validation.url)) {
                        allWebUrls.add(normalizeUrl(validation.url));
                    }
                } catch (error) {
                    console.log(`URL inválida ignorada: ${photo.analysis.web_url}`);
                }
            }
        }

        // Detectar QRs duplicados
        const duplicateQrs = Array.from(qrInfoMap.entries())
            .filter(([qrData, info]) => {
                // Contar cuántas fotos tienen este mismo QR
                return analyzedPhotos.filter(p => p.analysis?.qr_data === qrData).length > 1;
            })
            .map(([qrData, _]) => qrData);

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
                        const normalizedUrl = normalizeUrl(analysis.web_url);
                        if (!allWebUrls.has(normalizedUrl)) {
                            allWebUrls.add(normalizedUrl);
                        }
                    } catch (error) {
                        console.log(`URL inválida ignorada: ${analysis.web_url}`);
                    }
                }

                // QR - Ya procesado anteriormente en qrPhotoMap

                // Teléfonos - Validar formato básico
                if (analysis.phone_numbers) {
                    analysis.phone_numbers.forEach((phone) => {
                        const validPhone = validatePhoneNumber(phone);
                        if (validPhone) {
                            allPhoneNumbers.add(validPhone);
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

        // Validar URLs si tenemos un nombre de negocio
        let validatedUrls: Map<string, UrlValidationResult> = new Map();
        let bestUrl: string | undefined;
        let bestUrlScore = 0;

        if (bestName && allWebUrls.size > 0) {
            const processingMsg = await ctx.reply(`🔍 Analizando ${allWebUrls.size} URLs detectadas para encontrar la web oficial de ${bestName}...`);
            
            // Filtrar URLs válidas antes de validar
            const validUrls = Array.from(allWebUrls).filter(url => {
                try {
                    new URL(url.startsWith('http') ? url : `https://${url}`);
                    return true;
                } catch {
                    return false;
                }
            });
            
            // Mostrar progreso
            await ctx.api.editMessageText(
                ctx.chat!.id,
                processingMsg.message_id,
                `🔍 Validando ${validUrls.length} URLs válidas...`
            );
            
            // Validar URLs en paralelo
            const urlValidations = await Promise.all(
                validUrls.map(url => validateRealEstateUrl(url, bestName!))
            );

            // Mostrar progreso
            await ctx.api.editMessageText(
                ctx.chat!.id,
                processingMsg.message_id,
                `✅ URLs validadas. Calculando puntuaciones...`
            );

            // Procesar resultados y calcular scores
            validUrls.forEach((url, index) => {
                const validation = urlValidations[index];
                validatedUrls.set(url, validation);
                
                // Calcular score para esta URL
                let urlScore = 0;
                if (validation.isValid && validation.matchesBusiness) {
                    // Puntuación base por confianza (hasta 30 puntos)
                    urlScore += validation.confidence * 30;
                    
                    // Bonus por ser sitio web principal vs listing (hasta 40 puntos)
                    if (validation.validationDetails?.foundEvidence?.some(
                        e => e.includes('Descripción de servicios de inmobiliaria')
                    )) {
                        urlScore += 40;
                    }
                    
                    // Bonus por coincidencia exacta de nombre (hasta 30 puntos)
                    if (bestName && validation.webSummary?.title) {
                        const normalizedTitle = validation.webSummary.title.toLowerCase();
                        const normalizedName = bestName.toLowerCase();
                        
                        // Coincidencia exacta
                        if (normalizedTitle.includes(normalizedName)) {
                            urlScore += 30;
                        }
                        // Coincidencia parcial (al menos la mitad de las palabras)
                        else {
                            const nameWords = normalizedName.split(/\s+/);
                            const matchingWords = nameWords.filter(word => 
                                normalizedTitle.includes(word)
                            ).length;
                            
                            if (matchingWords >= nameWords.length / 2) {
                                urlScore += 15; // Mitad de puntos por coincidencia parcial
                            }
                        }
                    }

                    // Penalización para URLs que parecen listings
                    if (url.includes('listing') || 
                        url.includes('property') || 
                        url.includes('eqrco.de') ||
                        validation.webSummary?.title?.toLowerCase().includes('listing')) {
                        urlScore *= 0.5; // Reducir score a la mitad para listings
                    }
                    
                    // Actualizar mejor URL si el score es mayor
                    if (urlScore > bestUrlScore) {
                        bestUrlScore = urlScore;
                        bestUrl = url;
                    }
                }
            });

            // Mostrar resultado final
            await ctx.api.editMessageText(
                ctx.chat!.id,
                processingMsg.message_id,
                bestUrl 
                    ? `✅ Web oficial encontrada: ${bestUrl} (puntuación: ${Math.round(bestUrlScore)}%)`
                    : `⚠️ No se encontró una web oficial válida entre las URLs analizadas.`
            );

            // Esperar un momento antes de borrar el mensaje
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Borrar mensaje de procesamiento
            try {
                await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
            } catch (error) {
                console.error("Error al borrar mensaje de procesamiento:", error);
            }
        }

        // Actualizar el registro con toda la información recopilada
        if (ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration.name = bestName;
            ctx.session.registration.currentRegistration.qr = Array.from(qrInfoMap.keys()).join(', ');
            // Usar la mejor URL encontrada
            ctx.session.registration.currentRegistration.web_url = bestUrl;
            ctx.session.registration.currentRegistration.contact_info = {
                phone_numbers: Array.from(allPhoneNumbers),
                emails: Array.from(allEmails),
                business_hours: businessHours
            };
        }

        // Construir el mensaje de resumen
        let summaryMessage = `He analizado las fotos usando ${usingGroq ? 'Groq' : 'Gemini'} y encontrado:\n\n`;
        
        // Nombre
        if (bestName) {
            summaryMessage += `🏢 Nombre: ${bestName}${bestConfidence ? ` (Confianza: ${Math.round(bestConfidence * 100)}%)` : ''}\n`;
        }

        // QRs
        if (qrInfoMap.size > 0) {
            summaryMessage += `📱 QR: ${qrInfoMap.size} QR(s) únicos detectados${qrInfoMap.size > 0 ? ' (algunos contienen URLs)' : ''}\n`;
        }

        // URLs
        if (allWebUrls.size > 0) {
            summaryMessage += `🌐 URLs: ${formatUrlSummary(allWebUrls, validatedUrls)}\n`;
        }

        // Teléfonos
        if (allPhoneNumbers.size > 0) {
            summaryMessage += `🔔 Teléfonos: ${Array.from(allPhoneNumbers).join(', ')}\n`;
        }

        // Emails
        if (allEmails.size > 0) {
            summaryMessage += `📧 Emails: ${Array.from(allEmails).join(', ')}\n`;
        } else {
            summaryMessage += `📧 Emails: No detectados\n`;
        }

        // Horario
        if (businessHours) {
            summaryMessage += `🕒 Horario: ${businessHours}\n`;
        } else {
            summaryMessage += `🕒 Horario: No detectado\n`;
        }

        // Actualizar el estado para indicar que esperamos confirmación
        ctx.session.registration.step = 'waiting_confirmation';

        // Enviar el resumen y preguntar si los datos son correctos
        const keyboard = new InlineKeyboard()
            .text("✅ Confirmar", "confirm")
            .text("❌ Cancelar", "cancel");

        const summaryMsg = await ctx.reply(summaryMessage + "\n¿Los datos son correctos?", {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });

        // Guardar el resumen en la sesión para usarlo después
        ctx.session.registration.summary = summaryMessage;

    } catch (error) {
        console.error("Error al procesar la solicitud:", error);
        await ctx.reply("Hubo un error al procesar la solicitud. Por favor, intenta nuevamente.");
    }
}