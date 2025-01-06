import { Bot, Context, session, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import path from "path";
import { authMiddleware } from "./middlewares/auth";
import { messageTrackerMiddleware } from "./middlewares/messageTracker";
import { createRealEstate, getAdmins, updateUserStatus, getUserByTelegramId, uploadPhoto, createListing, createRealEstateContactInfo } from "./services/supabase";
import { analyzeImageWithGemini } from "./services/gemini";
import { deleteMessages, deleteMessageAfterTimeout } from "./services/messageManager";
import { MyContext, SessionData, initialSession } from "./types/session";
import { RealEstateRegistration } from "./types/types";
import crypto from 'crypto';

// Cargar variables de entorno con ruta absoluta
dotenv.config({ path: path.join(__dirname, '../../bot/.env') });

// Verificar que existe BOT_TOKEN
if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN debe estar definido en las variables de entorno!');
}

// Crear instancia del bot
const bot = new Bot<MyContext>(process.env.BOT_TOKEN);

// Configurar el middleware de sesión
bot.use(session({
    initial: (): SessionData => initialSession
}));

// Aplicar middleware de tracking de mensajes
bot.use(messageTrackerMiddleware);

// Aplicar middleware de autenticación a todos los mensajes excepto /start
bot.command("start", async (ctx) => {
    try {
        const welcomeMessage = "¡Bienvenido al Bot de Gestión de Inmobiliarias! 📸\n\n" +
            "Para registrar una nueva inmobiliaria, simplemente envía una foto del local.\n" +
            "Te guiaré paso a paso en el proceso de registro.";
        
        await ctx.reply(welcomeMessage);

        // Verificar si el usuario ya existe
        const user = await getUserByTelegramId(ctx.from?.id.toString() || '');
        if (!user) {
            await ctx.reply("Para comenzar, necesitas registrarte. Tu solicitud será enviada a los administradores para aprobación.");
        } else if (user.status === 'pending') {
            await ctx.reply("Tu solicitud está pendiente de aprobación. Por favor, espera la confirmación de un administrador.");
        } else if (user.status === 'rejected') {
            await ctx.reply("Lo siento, tu acceso ha sido denegado. Contacta a un administrador para más información.");
        }
    } catch (error) {
        console.error("Error en el comando start:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Aplicar middleware de autenticación para el resto de comandos
bot.use(authMiddleware);

// Comandos de administrador
bot.command("approve", async (ctx) => {
    try {
        const user = await getUserByTelegramId(ctx.from?.id.toString() || '');
        if (!user || user.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar este comando.");
            return;
        }

        const userId = ctx.message?.text.split(' ')[1];
        if (!userId) {
            await ctx.reply("Por favor, proporciona el ID del usuario a aprobar.");
            return;
        }

        const success = await updateUserStatus(userId, 'approved');
        if (success) {
            await ctx.reply(`Usuario ${userId} aprobado correctamente.`);
            // Notificar al usuario
            await bot.api.sendMessage(parseInt(userId), "¡Tu solicitud ha sido aprobada! Ya puedes comenzar a registrar inmobiliarias.");
        } else {
            await ctx.reply("Error al aprobar el usuario.");
        }
    } catch (error) {
        console.error("Error en comando approve:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar el comando.");
    }
});

bot.command("reject", async (ctx) => {
    try {
        const user = await getUserByTelegramId(ctx.from?.id.toString() || '');
        if (!user || user.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar este comando.");
            return;
        }

        const userId = ctx.message?.text.split(' ')[1];
        if (!userId) {
            await ctx.reply("Por favor, proporciona el ID del usuario a rechazar.");
            return;
        }

        const success = await updateUserStatus(userId, 'rejected');
        if (success) {
            await ctx.reply(`Usuario ${userId} rechazado correctamente.`);
            // Notificar al usuario
            await bot.api.sendMessage(parseInt(userId), "Lo sentimos, tu solicitud ha sido rechazada.");
        } else {
            await ctx.reply("Error al rechazar el usuario.");
        }
    } catch (error) {
        console.error("Error en comando reject:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar el comando.");
    }
});

// Función helper para loggear el estado
function logState(ctx: MyContext, action: string) {
    console.log('\n=== Estado de Sesión ===');
    console.log('Acción:', action);
    console.log('Step:', ctx.session.registration.step);
    console.log('Registration:', JSON.stringify(ctx.session.registration.currentRegistration, null, 2));
    console.log('=====================\n');
}

// Función helper para borrar mensajes del paso anterior
async function deletePreviousMessages(ctx: MyContext) {
    if (ctx.chat) {
        await deleteMessages(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        // Limpiar los arrays después de borrar
        ctx.session.botMessageIds = [];
        ctx.session.userMessageIds = [];
    }
}

// Manejador de fotos
bot.on("message:photo", async (ctx) => {
    try {
        logState(ctx, "📸 Recibida foto");

        // Verificar si estamos en un estado válido para recibir fotos
        if (ctx.session.registration.step !== 'idle' && ctx.session.registration.step !== 'collecting_photos') {
            if (ctx.message?.message_id && ctx.chat) {
                await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
            }
            const message = await ctx.reply("⚠️ Por favor, completa el paso actual antes de enviar más fotos.");
            if (ctx.chat) {
                await deleteMessageAfterTimeout(ctx, ctx.chat.id, message.message_id, 5000);
            }
            return;
        }

        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // Obtener la foto de mayor calidad

        // Si es la primera foto, inicializar el registro
        if (ctx.session.registration.step === 'idle') {
            ctx.session.registration.currentRegistration = createNewRegistration();
            ctx.session.registration.step = 'collecting_photos';
        }

        // Añadir la foto al registro (sin análisis por ahora)
        if (ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration.photos.push({
                file_id: photo.file_id,
                is_main: null
            });

            const keyboard = new InlineKeyboard()
                .text("✅ Finalizar", "photos_done")
                .text("❌ Cancelar", "cancel");

            await ctx.reply(`Foto ${ctx.session.registration.currentRegistration.photos.length} recibida. Puedes seguir enviando más fotos o finalizar.`, {
                reply_markup: keyboard
            });
        }

    } catch (error) {
        console.error("Error al procesar la foto:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("Lo siento, ha ocurrido un error al procesar la foto. Por favor, intenta nuevamente.");
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
});

// Manejador para finalizar envío de fotos
bot.callbackQuery("photos_done", async (ctx) => {
    try {
        await ctx.answerCallbackQuery();
        
        if (!ctx.session.registration.currentRegistration?.photos.length) {
            await ctx.reply("Debes enviar al menos una foto.");
            return;
        }

        // Analizar todas las fotos con Gemini
        const analyzedPhotos = [];
        for (const photo of ctx.session.registration.currentRegistration.photos) {
            const file = await ctx.api.getFile(photo.file_id);
            const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            const analysis = await analyzeImageWithGemini(photoUrl);
            analyzedPhotos.push({
                ...photo,
                analysis,
                is_main: analysis.objects_detected?.some(obj => 
                    obj.toLowerCase().includes('storefront') || 
                    obj.toLowerCase().includes('facade') || 
                    obj.toLowerCase().includes('building') ||
                    obj.toLowerCase().includes('office')
                ) ?? false
            });
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
                // Nombre del negocio
                if (analysis.confidence && analysis.name && analysis.confidence > bestConfidence) {
                    bestName = analysis.name;
                    bestConfidence = analysis.confidence;
                }

                // Recopilar toda la información
                if (analysis.qr_data) allQrData.add(analysis.qr_data);
                if (analysis.web_url) allWebUrls.add(analysis.web_url);
                if (analysis.phone_numbers) {
                    analysis.phone_numbers.forEach(phone => allPhoneNumbers.add(phone));
                }
                if (analysis.emails) {
                    analysis.emails.forEach(email => allEmails.add(email));
                }
                if (analysis.business_hours && !businessHours) {
                    businessHours = analysis.business_hours;
                }
                if (analysis.objects_detected) {
                    analysis.objects_detected.forEach(obj => allObjects.add(obj));
                }
                if (analysis.validation_reasons) {
                    analysis.validation_reasons.forEach(reason => validationReasons.add(reason));
                }
            }
        }

        // Verificar si tenemos una foto principal
        const hasMainPhoto = analyzedPhotos.some(p => p.is_main);
        if (!hasMainPhoto) {
            await ctx.reply("No se detectó ninguna foto de la fachada del local. Por favor, asegúrate de incluir una foto del frente del local.");
            return;
        }

        // Actualizar el registro con toda la información recopilada
        if (ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration.name = bestName;
            ctx.session.registration.currentRegistration.qr = Array.from(allQrData).join(', ');
            ctx.session.registration.currentRegistration.web_url = Array.from(allWebUrls).join(', ');
            // Guardar información de contacto para usar después
            ctx.session.registration.currentRegistration.contact_info = {
                phone_numbers: Array.from(allPhoneNumbers),
                emails: Array.from(allEmails),
                business_hours: businessHours
            };
        }

        // Mostrar resumen de la información detectada
        const summary = `He analizado las fotos y encontrado:\n\n` +
            `🏢 Nombre: ${bestName || 'No detectado'}\n` +
            `📱 QR: ${allQrData.size > 0 ? 'Detectado' : 'No detectado'}\n` +
            `🌐 URLs: ${Array.from(allWebUrls).join(', ') || 'No detectadas'}\n` +
            `☎️ Teléfonos: ${Array.from(allPhoneNumbers).join(', ') || 'No detectados'}\n` +
            `📧 Emails: ${Array.from(allEmails).join(', ') || 'No detectados'}\n` +
            `🕒 Horario: ${businessHours || 'No detectado'}\n\n` +
            `¿Los datos son correctos?`;

        const keyboard = new InlineKeyboard()
            .text("✅ Sí, continuar", "confirm_info")
            .text("❌ No, cancelar", "cancel");

        await ctx.reply(summary, { reply_markup: keyboard });

    } catch (error) {
        console.error("Error al finalizar envío de fotos:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Añadir manejadores para los nuevos botones
bot.callbackQuery("confirm_name", async (ctx) => {
    try {
        logState(ctx, "✅ Confirmando nombre");
        await ctx.answerCallbackQuery();
        await deletePreviousMessages(ctx);
        
        if (!ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration = createNewRegistration();
        }
        
        // Obtener el nombre del mensaje anterior
        const previousMessage = ctx.update.callback_query.message?.text;
        const nameMatch = previousMessage?.match(/\"([^\"]+)\"/);
        if (nameMatch && nameMatch[1]) {
            ctx.session.registration.currentRegistration.name = nameMatch[1];
            ctx.session.registration.step = 'waiting_qr';
            logState(ctx, "👉 Nombre confirmado, esperando QR");
            
            // Crear teclado inline para preguntar sobre QR
            const keyboard = new InlineKeyboard()
                .text("Sí, tengo QR", "has_qr")
                .text("No tiene QR", "no_qr")
                .row()
                .text("❌ Cancelar", "cancel");
            
            await ctx.reply("¿La inmobiliaria tiene código QR?", { reply_markup: keyboard });
        } else {
            throw new Error('No se pudo obtener el nombre');
        }
    } catch (error) {
        console.error("Error al confirmar nombre:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

bot.callbackQuery("reject_name", async (ctx) => {
    try {
        await ctx.answerCallbackQuery();
        ctx.session.registration.step = 'waiting_name';
        
        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        
        await ctx.reply("Por favor, envía el nombre correcto de la inmobiliaria.", {
            reply_markup: keyboard
        });
    } catch (error) {
        console.error("Error al rechazar nombre:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Manejador de texto (para nombre y QR)
bot.on("message:text", async (ctx) => {
    try {
        logState(ctx, "📝 Recibido texto");
        switch (ctx.session.registration.step) {
            case 'waiting_name':
                await deletePreviousMessages(ctx);
                
                if (!ctx.session.registration.currentRegistration) {
                    ctx.session.registration.currentRegistration = createNewRegistration();
                }
                ctx.session.registration.currentRegistration.name = ctx.message.text;
                ctx.session.registration.step = 'waiting_qr';
                logState(ctx, "👉 Nombre guardado, esperando QR");
                
                const keyboard = new InlineKeyboard()
                    .text("Sí, tengo QR", "has_qr")
                    .text("No tiene QR", "no_qr")
                    .row()
                    .text("❌ Cancelar", "cancel");
                
                await ctx.reply("¿La inmobiliaria tiene código QR?", { reply_markup: keyboard });
                break;

            case 'waiting_qr_input':
                await deletePreviousMessages(ctx);
                
                if (!ctx.session.registration.currentRegistration) {
                    ctx.session.registration.currentRegistration = createNewRegistration();
                }
                ctx.session.registration.currentRegistration.qr = ctx.message.text;
                ctx.session.registration.step = 'waiting_location';
                logState(ctx, "👉 QR guardado, esperando ubicación");

                const cancelKeyboard = new InlineKeyboard()
                    .text("❌ Cancelar", "cancel");

                await ctx.reply("Perfecto. Por último, envía la ubicación de la inmobiliaria.", {
                    reply_markup: cancelKeyboard
                });
                break;

            default:
                await ctx.reply("Por favor, sigue el proceso paso a paso. Envía una foto para comenzar.");
        }
    } catch (error) {
        console.error("Error al procesar el texto:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Manejador de callbacks de botones inline
bot.callbackQuery("has_qr", async (ctx) => {
    try {
        logState(ctx, "🔍 Esperando input de QR");
        await ctx.answerCallbackQuery();
        await deletePreviousMessages(ctx);
        
        ctx.session.registration.step = 'waiting_qr_input';
        logState(ctx, "👉 Cambiado a waiting_qr_input");

        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");

        await ctx.reply("Por favor, envía el código QR.", {
            reply_markup: keyboard
        });
    } catch (error) {
        console.error("Error al procesar callback has_qr:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

bot.callbackQuery("no_qr", async (ctx) => {
    try {
        logState(ctx, "🚫 No tiene QR");
        await ctx.answerCallbackQuery();
        await deletePreviousMessages(ctx);
        
        if (!ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration = createNewRegistration();
        }
        ctx.session.registration.currentRegistration.qr = "No tiene QR";
        ctx.session.registration.step = 'waiting_location';
        logState(ctx, "👉 QR marcado como no disponible, esperando ubicación");

        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");

        await ctx.reply("Entendido. Por favor, envía la ubicación de la inmobiliaria.", {
            reply_markup: keyboard
        });
    } catch (error) {
        console.error("Error al procesar callback no_qr:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Manejador para el botón de cancelar
bot.callbackQuery("cancel", async (ctx) => {
    try {
        logState(ctx, "❌ Antes de cancelar");
        await ctx.answerCallbackQuery();
        await deleteMessages(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        
        logState(ctx, "✨ Después de cancelar");
        if (ctx.chat) {
            const message = await ctx.reply("Proceso cancelado. Puedes empezar de nuevo enviando una foto.");
            // Borrar el mensaje después de 5 segundos
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, message.message_id, 5000);
        }
    } catch (error) {
        console.error("Error al procesar cancelación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
            // Borrar el mensaje de error después de 5 segundos
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
});

// Manejador para el botón de confirmar
bot.callbackQuery("confirm", async (ctx) => {
    try {
        logState(ctx, "✅ Iniciando confirmación final");
        
        // Borrar todos los mensajes inmediatamente antes de procesar
        if (ctx.chat && ctx.callbackQuery.message?.message_id) {
            await deleteMessages(ctx, [
                ...ctx.session.botMessageIds, 
                ...ctx.session.userMessageIds,
                ctx.callbackQuery.message.message_id
            ]);
        }

        await ctx.answerCallbackQuery();
        
        if (!ctx.from || !ctx.session.registration.currentRegistration || !ctx.chat) {
            throw new Error('Datos incompletos');
        }

        // Obtener el usuario actual
        const user = await getUserByTelegramId(ctx.from.id.toString());
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // Encontrar la foto principal
        const mainPhoto = ctx.session.registration.currentRegistration.photos.find(p => p.is_main === true);
        if (!mainPhoto) {
            throw new Error('No se encontró la foto principal');
        }

        // Procesar y subir la foto principal
        const mainFile = await ctx.api.getFile(mainPhoto.file_id);
        const mainPhotoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${mainFile.file_path}`;
        const mainResponse = await fetch(mainPhotoUrl);
        const mainPhotoBuffer = Buffer.from(await mainResponse.arrayBuffer());
        
        const mainFileName = `${crypto.randomUUID()}.jpg`;
        const uploadedMainPhotoUrl = await uploadPhoto(mainPhotoBuffer, mainFileName);
        
        if (!uploadedMainPhotoUrl) {
            throw new Error('Error al subir la foto principal');
        }

        // Guardar la inmobiliaria en la base de datos
        const realEstate = await createRealEstate({
            user_id: user.id,
            name: ctx.session.registration.currentRegistration.name || '',
            photo_url: uploadedMainPhotoUrl,
            qr_info: ctx.session.registration.currentRegistration.qr || undefined,
            latitude: ctx.session.registration.currentRegistration.location?.latitude || 0,
            longitude: ctx.session.registration.currentRegistration.location?.longitude || 0,
            is_active: true,
            created_by: user.id,
            updated_by: user.id,
            validation_score: mainPhoto.analysis?.validation_score,
            validation_reasons: mainPhoto.analysis?.validation_reasons,
            condition_score: mainPhoto.analysis?.condition_score,
            image_quality: mainPhoto.analysis?.image_quality,
            objects_detected: mainPhoto.analysis?.objects_detected
        });

        if (!realEstate) {
            throw new Error('Error al guardar la inmobiliaria');
        }

        // Guardar la información de contacto
        if (ctx.session.registration.currentRegistration.contact_info) {
            await createRealEstateContactInfo({
                real_estate_id: realEstate.id,
                phone_numbers: ctx.session.registration.currentRegistration.contact_info.phone_numbers,
                emails: ctx.session.registration.currentRegistration.contact_info.emails,
                business_hours: ctx.session.registration.currentRegistration.contact_info.business_hours
            });
        }

        // Procesar y guardar las fotos de listings
        const listingPhotos = ctx.session.registration.currentRegistration.photos.filter(p => p.is_main === false);
        for (const listingPhoto of listingPhotos) {
            try {
                const listingFile = await ctx.api.getFile(listingPhoto.file_id);
                const listingPhotoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${listingFile.file_path}`;
                const listingResponse = await fetch(listingPhotoUrl);
                const listingPhotoBuffer = Buffer.from(await listingResponse.arrayBuffer());
                
                const listingFileName = `${crypto.randomUUID()}.jpg`;
                const uploadedListingPhotoUrl = await uploadPhoto(listingPhotoBuffer, listingFileName);
                
                if (uploadedListingPhotoUrl) {
                    await createListing({
                        real_estate_id: realEstate.id,
                        photo_url: uploadedListingPhotoUrl,
                        qr_data: listingPhoto.analysis?.qr_data || undefined,
                        web_url: listingPhoto.analysis?.web_url || undefined,
                        created_by: user.id,
                        updated_by: user.id,
                        is_active: true
                    });
                }
            } catch (error) {
                console.error('Error al procesar foto de listing:', error);
                // Continuar con la siguiente foto aunque haya error
            }
        }

        // Limpiar la sesión
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        logState(ctx, "✨ Registro completado y sesión limpiada");
        
        // Mostrar mensaje de éxito temporal
        const successMessage = await ctx.reply("✅ ¡Inmobiliaria registrada con éxito!");
        if (ctx.chat) {
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, successMessage.message_id, 3000);
        }
    } catch (error) {
        console.error("Error al procesar confirmación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("❌ Error al guardar los datos. Por favor, intenta nuevamente.");
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
});

// Manejador de ubicación
bot.on("message:location", async (ctx) => {
    try {
        logState(ctx, "📍 Recibida ubicación");
        if (ctx.session.registration.step !== 'waiting_location') {
            await ctx.reply("Por favor, sigue el proceso paso a paso. Envía una foto para comenzar.");
            return;
        }

        await deletePreviousMessages(ctx);

        if (!ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration = createNewRegistration();
        }

        // Guardar la ubicación
        ctx.session.registration.currentRegistration.location = {
            latitude: ctx.message.location.latitude,
            longitude: ctx.message.location.longitude
        };

        logState(ctx, "👉 Ubicación guardada, mostrando resumen");

        // Mostrar resumen y pedir confirmación
        const summary = `Por favor, verifica que los datos sean correctos:\n\n` +
            `📸 Foto: Recibida\n` +
            `🏢 Nombre: ${ctx.session.registration.currentRegistration.name}\n` +
            `🔍 QR: ${ctx.session.registration.currentRegistration.qr}\n` +
            `📍 Ubicación: Recibida\n\n` +
            `¿Deseas guardar esta inmobiliaria?`;

        const keyboard = new InlineKeyboard()
            .text("✅ Confirmar", "confirm")
            .text("❌ Cancelar", "cancel");

        await ctx.reply(summary, { reply_markup: keyboard });
    } catch (error) {
        console.error("Error al procesar ubicación:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Manejador para confirmar la información
bot.callbackQuery("confirm_info", async (ctx) => {
    try {
        await ctx.answerCallbackQuery();
        
        if (!ctx.session.registration.currentRegistration) {
            throw new Error('No hay registro activo');
        }

        // Cambiar al siguiente paso
        ctx.session.registration.step = 'waiting_location';

        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");

        await ctx.reply("Perfecto. Por último, envía la ubicación de la inmobiliaria.", {
            reply_markup: keyboard
        });

    } catch (error) {
        console.error("Error al confirmar información:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Función helper para crear una nueva registración
function createNewRegistration(initial: Partial<RealEstateRegistration> = {}): RealEstateRegistration {
    return {
        started_at: Date.now(),
        last_update: Date.now(),
        messages_ids: [],
        photos: [],
        ...initial
    };
}

// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
} catch (error) {
    console.error("Error al iniciar el bot:", error);
}