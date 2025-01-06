"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./middlewares/auth");
const supabase_1 = require("./services/supabase");
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
    initial: () => ({
        step: 'idle'
    })
}));
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
// Manejador de fotos
bot.on("message:photo", async (ctx) => {
    try {
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // Obtener la foto de mayor calidad
        // Guardar el file_id en la sesión
        ctx.session.currentRegistration = {
            photo: photo.file_id // Guardamos solo el ID, no subimos la foto aún
        };
        ctx.session.step = 'waiting_name';
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        await ctx.reply("¡Excelente! Ahora, por favor envía el nombre de la inmobiliaria.", {
            reply_markup: keyboard
        });
    }
    catch (error) {
        console.error("Error al procesar la foto:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar la foto. Por favor, intenta nuevamente.");
    }
});
// Manejador de texto (para nombre y QR)
bot.on("message:text", async (ctx) => {
    try {
        switch (ctx.session.step) {
            case 'waiting_name':
                if (!ctx.session.currentRegistration) {
                    ctx.session.currentRegistration = {};
                }
                ctx.session.currentRegistration.name = ctx.message.text;
                ctx.session.step = 'waiting_qr';
                // Crear teclado inline para preguntar sobre QR
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("Sí, tengo QR", "has_qr")
                    .text("No tiene QR", "no_qr")
                    .row()
                    .text("❌ Cancelar", "cancel");
                await ctx.reply("¿La inmobiliaria tiene código QR?", { reply_markup: keyboard });
                break;
            case 'waiting_qr_input':
                if (!ctx.session.currentRegistration) {
                    ctx.session.currentRegistration = {};
                }
                ctx.session.currentRegistration.qr = ctx.message.text;
                ctx.session.step = 'waiting_location';
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
        await ctx.answerCallbackQuery();
        ctx.session.step = 'waiting_qr_input';
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
        await ctx.answerCallbackQuery();
        if (!ctx.session.currentRegistration) {
            ctx.session.currentRegistration = {};
        }
        ctx.session.currentRegistration.qr = "No tiene QR";
        ctx.session.step = 'waiting_location';
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
        await ctx.answerCallbackQuery();
        ctx.session.step = 'idle';
        ctx.session.currentRegistration = undefined;
        await ctx.reply("Proceso cancelado. Puedes empezar de nuevo enviando una foto.");
    }
    catch (error) {
        console.error("Error al procesar cancelación:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Manejador de ubicación
bot.on("message:location", async (ctx) => {
    try {
        if (ctx.session.step === 'waiting_location' && ctx.from) {
            if (!ctx.session.currentRegistration) {
                ctx.session.currentRegistration = {};
            }
            const location = {
                latitude: ctx.message.location.latitude,
                longitude: ctx.message.location.longitude
            };
            ctx.session.currentRegistration.location = location;
            // Mostrar resumen y botones de confirmación
            const summary = `Por favor, confirma que los datos son correctos:\n\n` +
                `🏢 Nombre: ${ctx.session.currentRegistration.name}\n` +
                `🔍 QR: ${ctx.session.currentRegistration.qr}\n` +
                `📍 Ubicación: Recibida\n\n` +
                `¿Deseas guardar esta inmobiliaria?`;
            const keyboard = new grammy_1.InlineKeyboard()
                .text("✅ Confirmar", "confirm")
                .text("❌ Cancelar", "cancel");
            ctx.session.step = 'waiting_confirmation';
            await ctx.reply(summary, { reply_markup: keyboard });
        }
        else {
            await ctx.reply("Por favor, sigue el proceso paso a paso. Envía una foto para comenzar.");
        }
    }
    catch (error) {
        console.error("Error al procesar la ubicación:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Manejador para el botón de confirmar
bot.callbackQuery("confirm", async (ctx) => {
    try {
        await ctx.answerCallbackQuery();
        if (!ctx.from || !ctx.session.currentRegistration) {
            throw new Error('Datos incompletos');
        }
        // Obtener el usuario actual
        const user = await (0, supabase_1.getUserByTelegramId)(ctx.from.id.toString());
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        // Procesar y subir la foto
        const file = await ctx.api.getFile(ctx.session.currentRegistration.photo || '');
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
            name: ctx.session.currentRegistration.name || '',
            photo_url: uploadedPhotoUrl,
            qr_info: ctx.session.currentRegistration.qr || null,
            latitude: ctx.session.currentRegistration.location?.latitude || 0,
            longitude: ctx.session.currentRegistration.location?.longitude || 0,
            is_active: true
        });
        if (!realEstate) {
            throw new Error('Error al guardar la inmobiliaria');
        }
        const summary = `¡Registro completado con éxito! 🎉\n\n` +
            `Resumen:\n` +
            `📸 Foto: Recibida\n` +
            `🏢 Nombre: ${ctx.session.currentRegistration.name}\n` +
            `🔍 QR: ${ctx.session.currentRegistration.qr}\n` +
            `📍 Ubicación: Recibida`;
        ctx.session.step = 'idle';
        ctx.session.currentRegistration = undefined;
        await ctx.reply(summary);
    }
    catch (error) {
        console.error("Error al procesar confirmación:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al guardar los datos. Por favor, intenta nuevamente.");
    }
});
// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
}
catch (error) {
    console.error("Error al iniciar el bot:", error);
}
