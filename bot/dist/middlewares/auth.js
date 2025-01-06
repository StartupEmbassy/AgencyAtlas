"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const supabase_1 = require("../services/supabase");
async function authMiddleware(ctx, next) {
    try {
        if (!ctx.from) {
            await ctx.reply("Lo siento, no puedo identificarte.");
            return;
        }
        const telegramId = ctx.from.id.toString();
        const username = ctx.from.username || 'unknown';
        // Intentar obtener el usuario
        let user = await (0, supabase_1.getUserByTelegramId)(telegramId).catch(error => {
            console.error('Error getting user:', error);
            return null;
        });
        // Si el usuario no existe, crearlo
        if (!user) {
            user = await (0, supabase_1.createUser)(telegramId, username).catch(error => {
                // Si el error es de duplicado, intentar obtener el usuario nuevamente
                if (error.code === '23505') {
                    return (0, supabase_1.getUserByTelegramId)(telegramId);
                }
                console.error('Error creating user:', error);
                return null;
            });
            if (!user) {
                await ctx.reply("Lo siento, ha ocurrido un error al registrarte. Por favor, intenta más tarde.");
                return;
            }
            // Solo enviar mensaje de bienvenida si es un usuario nuevo
            if (user.status === 'pending') {
                await ctx.reply("¡Bienvenido! Tu solicitud de registro ha sido enviada a los administradores para aprobación.");
                // TODO: Notificar a los administradores
                return;
            }
        }
        // Verificar el estado del usuario
        if (user.status === 'rejected') {
            await ctx.reply("Lo siento, tu acceso ha sido denegado. Contacta a un administrador para más información.");
            return;
        }
        if (user.status === 'pending') {
            await ctx.reply("Tu solicitud aún está pendiente de aprobación. Por favor, espera la confirmación de un administrador.");
            return;
        }
        // Si llegamos aquí, el usuario está aprobado
        await next();
    }
    catch (error) {
        console.error("Error en authMiddleware:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente más tarde.");
    }
}
