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
import { handleRequestLocation } from "./callbacks/requestLocation";
import { handleLocation } from "./handlers/locationHandler";
import { handleFinalConfirm } from "./callbacks/finalConfirm";

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

// Manejadores para los botones de aprobación de usuarios
bot.callbackQuery(/^approve_(\d+)$/, handleApproveUser);
bot.callbackQuery(/^reject_(\d+)$/, handleRejectUser);
bot.callbackQuery(/^later_(\d+)$/, handleLaterUser);

// Manejadores de callbacks
bot.callbackQuery("photos_done", handlePhotosDone);
bot.callbackQuery("confirm", handleConfirm);
bot.callbackQuery("final_confirm", handleFinalConfirm);
bot.callbackQuery("cancel", handleCancel);
bot.callbackQuery("request_location", handleRequestLocation);

// Manejador de texto
bot.on("message:text", async (ctx) => {
    try {
        // Si el usuario presiona Cancelar, limpiar el teclado y cancelar el proceso
        if (ctx.message.text === "❌ Cancelar") {
            await ctx.reply("Proceso cancelado", {
                reply_markup: { remove_keyboard: true }
            });
            ctx.session.registration.step = 'idle';
            ctx.session.registration.currentRegistration = undefined;
            return;
        }

        // Resto de la lógica de manejo de texto si es necesaria...
    } catch (error) {
        console.error("Error al procesar texto:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});

// Manejador de ubicación
bot.on("message:location", async (ctx) => {
    if (ctx.session.registration.step === 'waiting_location') {
        await handleLocation(ctx);
    }
});

// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
} catch (error) {
    console.error("Error al iniciar el bot:", error);
}