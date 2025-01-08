import { Bot,  session, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import path from "path";
import { authMiddleware } from "./middlewares/auth";
import { messageTrackerMiddleware } from "./middlewares/messageTracker";
import {  getUserByTelegramId} from "./services/supabase";
import {  deleteMessageAfterTimeout } from "./services/messageManager";
import { MyContext, SessionData, initialSession } from "./types/session";
import { logState, createNewRegistration, deletePreviousMessages } from "./utils/helpers";
import { handleStart } from "./commands/start";
import { handleApprove } from "./commands/approve";
import { handleReject } from "./commands/reject";
import { handleApproveUser } from "./callbacks/approveUser";
import { handleRejectUser } from "./callbacks/rejectUser";
import { handleLaterUser } from "./callbacks/laterUser";
import { handlePhotosDone } from "./callbacks/photosDone";
import { handleCancel } from "./callbacks/cancel";
import { handleConfirmInfo } from "./callbacks/confirmInfo";
import { handleRejectName } from "./callbacks/rejectName";
import { handleConfirmName } from "./callbacks/confirmName";
import { handleConfirm } from "./callbacks/confirm";

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
bot.command("start", handleStart);

// Aplicar middleware de autenticación para el resto de comandos
bot.use(authMiddleware);

// Comandos de administrador
bot.command("approve", handleApprove);
bot.command("reject", handleReject);

// Manejador de fotos
bot.on("message:photo", async (ctx) => {
    console.log("Recibida foto - iniciando proceso...");
    try {
        const user = await getUserByTelegramId(ctx.from?.id.toString() || '');
        console.log("Estado del usuario:", user?.status);
        
        if (!user) {
            console.log("Usuario no encontrado");
            await ctx.reply("Por favor, regístrate primero usando el comando /start");
            return;
        }

        if (user.status !== 'approved') {
            console.log("Usuario no aprobado");
            await ctx.reply("Tu cuenta está pendiente de aprobación por un administrador.");
            return;
        }

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
bot.callbackQuery("photos_done", handlePhotosDone);

// Manejador para confirmar nombre
bot.callbackQuery("confirm_name", handleConfirmName);

bot.callbackQuery("reject_name", handleRejectName);

// Manejador de texto (para nombre)
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
                ctx.session.registration.step = 'waiting_location';
                logState(ctx, "👉 Nombre guardado, esperando ubicación");
                
                const keyboard = new InlineKeyboard()
                    .text("❌ Cancelar", "cancel");
                
                await ctx.reply("Por favor, envía la ubicación de la inmobiliaria.", { 
                    reply_markup: keyboard 
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

// Manejador para el botón de cancelar
bot.callbackQuery("cancel", handleCancel);

// Manejador para el botón de confirmar
bot.callbackQuery("confirm", handleConfirm);

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
            `🔍 Web: ${ctx.session.registration.currentRegistration.web_url || 'No detectada'}\n` +
            `🔍 QR: ${ctx.session.registration.currentRegistration.qr || 'No detectado'}\n` +
            `📍 Ubicación: Recibida\n` +
            `☎️ Teléfonos: ${ctx.session.registration.currentRegistration.contact_info?.phone_numbers?.join(', ') || 'No detectados'}\n` +
            `📧 Emails: ${ctx.session.registration.currentRegistration.contact_info?.emails?.join(', ') || 'No detectados'}\n` +
            `🕒 Horario: ${ctx.session.registration.currentRegistration.contact_info?.business_hours || 'No detectado'}\n\n` +
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
bot.callbackQuery("confirm_info", handleConfirmInfo);

// Manejadores para los botones de aprobación de usuarios
bot.callbackQuery(/^approve_(\d+)$/, handleApproveUser);
bot.callbackQuery(/^reject_(\d+)$/, handleRejectUser);
bot.callbackQuery(/^later_(\d+)$/, handleLaterUser);

// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
} catch (error) {
    console.error("Error al iniciar el bot:", error);
}