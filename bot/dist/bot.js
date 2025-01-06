"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
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
// Manejador del comando start
bot.command("start", async (ctx) => {
    try {
        const welcomeMessage = "¡Bienvenido al Bot de Gestión de Inmobiliarias! 📸\n\n" +
            "Para registrar una nueva inmobiliaria, simplemente envía una foto del local.\n" +
            "Te guiaré paso a paso en el proceso de registro.";
        await ctx.reply(welcomeMessage);
    }
    catch (error) {
        console.error("Error en el comando start:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
});
// Manejador de fotos
bot.on("message:photo", async (ctx) => {
    try {
        // TODO: Verificar si el usuario está registrado y aprobado
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // Obtener la foto de mayor calidad
        // Guardar la foto en la sesión
        ctx.session.currentRegistration = {
            photo: photo.file_id
        };
        ctx.session.step = 'waiting_name';
        await ctx.reply("¡Excelente! Ahora, por favor envía el nombre de la inmobiliaria.");
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
                await ctx.reply("Gracias. Ahora, envía el código QR (si existe) o escribe 'no' si no hay QR.");
                break;
            case 'waiting_qr':
                if (!ctx.session.currentRegistration) {
                    ctx.session.currentRegistration = {};
                }
                ctx.session.currentRegistration.qr = ctx.message.text;
                ctx.session.step = 'waiting_location';
                await ctx.reply("Perfecto. Por último, envía la ubicación de la inmobiliaria.");
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
// Manejador de ubicación
bot.on("message:location", async (ctx) => {
    try {
        if (ctx.session.step === 'waiting_location') {
            if (!ctx.session.currentRegistration) {
                ctx.session.currentRegistration = {};
            }
            ctx.session.currentRegistration.location = {
                latitude: ctx.message.location.latitude,
                longitude: ctx.message.location.longitude
            };
            // TODO: Guardar toda la información en la base de datos
            const summary = `Resumen del registro:\n` +
                `📸 Foto: Recibida\n` +
                `🏢 Nombre: ${ctx.session.currentRegistration.name}\n` +
                `🔍 QR: ${ctx.session.currentRegistration.qr}\n` +
                `📍 Ubicación: Recibida`;
            ctx.session.step = 'idle';
            await ctx.reply(summary);
            await ctx.reply("¡Registro completado con éxito! 🎉");
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
// Iniciar el bot
try {
    bot.start();
    console.log("¡Bot iniciado exitosamente!");
}
catch (error) {
    console.error("Error al iniciar el bot:", error);
}
