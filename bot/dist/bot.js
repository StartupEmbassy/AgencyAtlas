"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./middlewares/auth");
const messageTracker_1 = require("./middlewares/messageTracker");
const supabase_1 = require("./services/supabase");
const xai_1 = require("./services/xai");
const messageManager_1 = require("./services/messageManager");
const session_1 = require("./types/session");
const crypto_1 = __importDefault(require("crypto"));
// Cargar variables de entorno con ruta absoluta
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../bot/.env') });
// Verificar que existe BOT_TOKEN
if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN debe estar definido en las variables de entorno!');
}
// Crear instancia del bot
const bot = new grammy_1.Bot(process.env.BOT_TOKEN);
// Configurar el middleware de sesión
bot.use((0, grammy_1.session)({
    initial: () => session_1.initialSession
}));
// Aplicar middleware de tracking de mensajes
bot.use(messageTracker_1.messageTrackerMiddleware);
// Aplicar middleware de autenticación a todos los mensajes excepto /start
bot.command("start", async (ctx) => {
    try {
        const welcomeMessage = "¡Bienvenido al Bot de Gestión de Inmobiliarias! 📸\n\n" +
            "Para registrar una nueva inmobiliaria, simplemente envía una foto del local.\n" +
            "Te guiaré paso a paso en el proceso de registro.";
        await ctx.reply(welcomeMessage);
        // Verificar si el usuario ya existe
        const user = await (0, supabase_1.getUserByTelegramId)(ctx.from?.id.toString() || '');
        if (!user) {
            await ctx.reply("Para comenzar, necesitas registrarte. Tu solicitud será enviada a los administradores para aprobación.");
        }
        else if (user.status === 'pending') {
            await ctx.reply("Tu solicitud está pendiente de aprobación. Por favor, espera la confirmación de un administrador.");
        }
        else if (user.status === 'rejected') {
            await ctx.reply("Lo siento, tu acceso ha sido denegado. Contacta a un administrador para más información.");
        }
    }
    catch (error) {
        console.error("Error en el comando start:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Aplicar middleware de autenticación para el resto de comandos
bot.use(auth_1.authMiddleware);
// Comandos de administrador
bot.command("approve", async (ctx) => {
    try {
        const user = await (0, supabase_1.getUserByTelegramId)(ctx.from?.id.toString() || '');
        if (!user || user.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar este comando.");
            return;
        }
        const userId = ctx.message?.text.split(' ')[1];
        if (!userId) {
            await ctx.reply("Por favor, proporciona el ID del usuario a aprobar.");
            return;
        }
        const success = await (0, supabase_1.updateUserStatus)(userId, 'approved');
        if (success) {
            await ctx.reply(`Usuario ${userId} aprobado correctamente.`);
            // Notificar al usuario
            await bot.api.sendMessage(parseInt(userId), "¡Tu solicitud ha sido aprobada! Ya puedes comenzar a registrar inmobiliarias.");
        }
        else {
            await ctx.reply("Error al aprobar el usuario.");
        }
    }
    catch (error) {
        console.error("Error en comando approve:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar el comando.");
    }
});
bot.command("reject", async (ctx) => {
    try {
        const user = await (0, supabase_1.getUserByTelegramId)(ctx.from?.id.toString() || '');
        if (!user || user.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar este comando.");
            return;
        }
        const userId = ctx.message?.text.split(' ')[1];
        if (!userId) {
            await ctx.reply("Por favor, proporciona el ID del usuario a rechazar.");
            return;
        }
        const success = await (0, supabase_1.updateUserStatus)(userId, 'rejected');
        if (success) {
            await ctx.reply(`Usuario ${userId} rechazado correctamente.`);
            // Notificar al usuario
            await bot.api.sendMessage(parseInt(userId), "Lo sentimos, tu solicitud ha sido rechazada.");
        }
        else {
            await ctx.reply("Error al rechazar el usuario.");
        }
    }
    catch (error) {
        console.error("Error en comando reject:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar el comando.");
    }
});
// Función helper para loggear el estado
function logState(ctx, action) {
    console.log('\n=== Estado de Sesión ===');
    console.log('Acción:', action);
    console.log('Step:', ctx.session.registration.step);
    console.log('Registration:', JSON.stringify(ctx.session.registration.currentRegistration, null, 2));
    console.log('=====================\n');
}
// Función helper para borrar mensajes del paso anterior
async function deletePreviousMessages(ctx) {
    if (ctx.chat) {
        await (0, messageManager_1.deleteMessages)(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        // Limpiar los arrays después de borrar
        ctx.session.botMessageIds = [];
        ctx.session.userMessageIds = [];
    }
}
// Manejador de fotos
bot.on("message:photo", async (ctx) => {
    try {
        logState(ctx, "📸 Recibida foto");
        // Verificar si ya hay un registro en proceso
        if (ctx.session.registration.step !== 'idle') {
            // Borrar la foto que acaba de enviar el usuario
            if (ctx.message?.message_id && ctx.chat) {
                await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
            }
            const message = await ctx.reply("⚠️ Ya hay un registro en proceso. Por favor, completa el paso actual o cancela el registro antes de enviar una nueva foto.");
            // Borrar el mensaje después de 5 segundos
            if (ctx.chat) {
                await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, message.message_id, 5000);
            }
            return;
        }
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // Obtener la foto de mayor calidad
        // Obtener la URL de la foto
        const file = await ctx.api.getFile(photo.file_id);
        const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        // Guardar el file_id en la sesión
        ctx.session.registration.currentRegistration = createNewRegistration({
            photo: photo.file_id
        });
        logState(ctx, "💾 Guardada foto en sesión");
        // Analizar la imagen con Grok
        const analysis = await (0, xai_1.analyzeImage)(photoUrl);
        // Si hay un error específico, manejarlo apropiadamente
        if (!analysis.success && analysis.error) {
            ctx.session.registration.step = 'waiting_name';
            const keyboard = new grammy_1.InlineKeyboard()
                .text("❌ Cancelar", "cancel");
            switch (analysis.error.code) {
                case 'API_PERMISSION_ERROR':
                    // Error de permisos - informar y continuar manualmente
                    await ctx.reply("⚠️ El sistema de detección automática no está disponible en este momento.\n\nPor favor, envía el nombre de la inmobiliaria manualmente.", {
                        reply_markup: keyboard
                    });
                    break;
                case 'NO_API_KEY':
                    // API key no configurada - informar y continuar manualmente
                    await ctx.reply("⚠️ El sistema de detección automática no está configurado.\n\nPor favor, envía el nombre de la inmobiliaria manualmente.", {
                        reply_markup: keyboard
                    });
                    break;
                default:
                    // Otros errores - informar y continuar manualmente
                    console.error(`Error en análisis de imagen: ${analysis.error.code} - ${analysis.error.message}`);
                    await ctx.reply("⚠️ No se pudo analizar la imagen automáticamente.\n\nPor favor, envía el nombre de la inmobiliaria manualmente.", {
                        reply_markup: keyboard
                    });
            }
            return;
        }
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        if (analysis.success && analysis.name) {
            // Si se encontró un nombre, mostrarlo y pedir confirmación
            ctx.session.registration.step = 'waiting_name';
            const confirmKeyboard = new grammy_1.InlineKeyboard()
                .text("✅ Sí, es correcto", "confirm_name")
                .text("❌ No, es otro", "reject_name")
                .row()
                .text("❌ Cancelar", "cancel");
            await ctx.reply(`He detectado que el nombre de la inmobiliaria es "${analysis.name}" (confianza: ${Math.round((analysis.confidence || 0) * 100)}%).\n\n¿Es correcto?`, {
                reply_markup: confirmKeyboard
            });
        }
        else {
            // Si no se encontró nombre, pedir al usuario que lo ingrese
            ctx.session.registration.step = 'waiting_name';
            await ctx.reply("No pude detectar el nombre de la inmobiliaria en la imagen.\n\nPor favor, envía el nombre manualmente.", {
                reply_markup: keyboard
            });
        }
    }
    catch (error) {
        console.error("Error al procesar la foto:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("Lo siento, ha ocurrido un error al procesar la foto. Por favor, intenta nuevamente.");
            // Borrar el mensaje de error después de 5 segundos
            await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
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
            const keyboard = new grammy_1.InlineKeyboard()
                .text("Sí, tengo QR", "has_qr")
                .text("No tiene QR", "no_qr")
                .row()
                .text("❌ Cancelar", "cancel");
            await ctx.reply("¿La inmobiliaria tiene código QR?", { reply_markup: keyboard });
        }
        else {
            throw new Error('No se pudo obtener el nombre');
        }
    }
    catch (error) {
        console.error("Error al confirmar nombre:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
bot.callbackQuery("reject_name", async (ctx) => {
    try {
        await ctx.answerCallbackQuery();
        ctx.session.registration.step = 'waiting_name';
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        await ctx.reply("Por favor, envía el nombre correcto de la inmobiliaria.", {
            reply_markup: keyboard
        });
    }
    catch (error) {
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
                const keyboard = new grammy_1.InlineKeyboard()
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
                const cancelKeyboard = new grammy_1.InlineKeyboard()
                    .text("❌ Cancelar", "cancel");
                await ctx.reply("Perfecto. Por último, envía la ubicación de la inmobiliaria.", {
                    reply_markup: cancelKeyboard
                });
                break;
            default:
                await ctx.reply("Por favor, sigue el proceso paso a paso. Envía una foto para comenzar.");
        }
    }
    catch (error) {
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
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        await ctx.reply("Por favor, envía el código QR.", {
            reply_markup: keyboard
        });
    }
    catch (error) {
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
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        await ctx.reply("Entendido. Por favor, envía la ubicación de la inmobiliaria.", {
            reply_markup: keyboard
        });
    }
    catch (error) {
        console.error("Error al procesar callback no_qr:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Manejador para el botón de cancelar
bot.callbackQuery("cancel", async (ctx) => {
    try {
        logState(ctx, "❌ Antes de cancelar");
        await ctx.answerCallbackQuery();
        await (0, messageManager_1.deleteMessages)(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        logState(ctx, "✨ Después de cancelar");
        if (ctx.chat) {
            const message = await ctx.reply("Proceso cancelado. Puedes empezar de nuevo enviando una foto.");
            // Borrar el mensaje después de 5 segundos
            await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, message.message_id, 5000);
        }
    }
    catch (error) {
        console.error("Error al procesar cancelación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
            // Borrar el mensaje de error después de 5 segundos
            await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
});
// Manejador para el botón de confirmar
bot.callbackQuery("confirm", async (ctx) => {
    try {
        logState(ctx, "✅ Iniciando confirmación final");
        // Borrar todos los mensajes inmediatamente antes de procesar
        if (ctx.chat && ctx.callbackQuery.message?.message_id) {
            // Incluir el mensaje de confirmación en los mensajes a borrar
            await (0, messageManager_1.deleteMessages)(ctx, [
                ...ctx.session.botMessageIds,
                ...ctx.session.userMessageIds,
                ctx.callbackQuery.message.message_id
            ]);
        }
        // Responder al callback después del borrado
        await ctx.answerCallbackQuery();
        if (!ctx.from || !ctx.session.registration.currentRegistration || !ctx.chat) {
            console.log('❌ Error: Datos incompletos en confirmación');
            throw new Error('Datos incompletos');
        }
        // Obtener el usuario actual
        const user = await (0, supabase_1.getUserByTelegramId)(ctx.from.id.toString());
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        // Procesar y subir la foto
        const file = await ctx.api.getFile(ctx.session.registration.currentRegistration.photo || '');
        const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const response = await fetch(photoUrl);
        const photoBuffer = Buffer.from(await response.arrayBuffer());
        // Generar nombre único para la foto
        const fileName = `${crypto_1.default.randomUUID()}.jpg`;
        // Subir la foto a Supabase
        const uploadedPhotoUrl = await (0, supabase_1.uploadPhoto)(photoBuffer, fileName);
        if (!uploadedPhotoUrl) {
            throw new Error('Error al subir la foto');
        }
        // Guardar en la base de datos
        const realEstate = await (0, supabase_1.createRealEstate)({
            user_id: user.id,
            name: ctx.session.registration.currentRegistration.name || '',
            photo_url: uploadedPhotoUrl,
            qr_info: ctx.session.registration.currentRegistration.qr || null,
            latitude: ctx.session.registration.currentRegistration.location?.latitude || 0,
            longitude: ctx.session.registration.currentRegistration.location?.longitude || 0,
            is_active: true
        });
        if (!realEstate) {
            throw new Error('Error al guardar la inmobiliaria');
        }
        // Limpiar la sesión
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        logState(ctx, "✨ Registro completado y sesión limpiada");
        // Mostrar mensaje de éxito temporal
        const successMessage = await ctx.reply("✅ ¡Inmobiliaria registrada con éxito!");
        // Borrar el mensaje de éxito después de 3 segundos
        if (ctx.chat) {
            await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, successMessage.message_id, 3000);
        }
    }
    catch (error) {
        console.error("Error al procesar confirmación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("❌ Error al guardar los datos. Por favor, intenta nuevamente.");
            // Borrar el mensaje de error después de 5 segundos
            await (0, messageManager_1.deleteMessageAfterTimeout)(ctx, ctx.chat.id, errorMessage.message_id, 5000);
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
        const keyboard = new grammy_1.InlineKeyboard()
            .text("✅ Confirmar", "confirm")
            .text("❌ Cancelar", "cancel");
        await ctx.reply(summary, { reply_markup: keyboard });
    }
    catch (error) {
        console.error("Error al procesar ubicación:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Función helper para crear una nueva registración
function createNewRegistration(initial = {}) {
    return {
        ...initial,
        started_at: Date.now(),
        last_update: Date.now(),
        messages_ids: []
    };
}
// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
}
catch (error) {
    console.error("Error al iniciar el bot:", error);
}
