import { MyContext } from "../types/session";
import { getUserByTelegramId, updateUserStatus } from "../services/supabase";

export async function handleRejectUser(ctx: MyContext) {
    try {
        if (!ctx.match || !ctx.from || !ctx.callbackQuery?.message?.text) {
            await ctx.reply("Error: Datos incompletos");
            return;
        }

        const userId = ctx.match[1];
        await ctx.answerCallbackQuery("❌ Usuario rechazado");

        const admin = await getUserByTelegramId(ctx.from.id.toString());
        if (!admin || admin.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar esta acción.");
            return;
        }

        const success = await updateUserStatus(userId, 'rejected');
        if (success) {
            try {
                // Mensaje detallado para el usuario
                const userMessage = `❌ Lo sentimos, tu solicitud ha sido rechazada.\n\n` +
                    `Si crees que esto es un error o necesitas más información, ` +
                    `por favor contacta con un administrador.`;
                
                await ctx.api.sendMessage(parseInt(userId), userMessage);
                console.log(`Notificación enviada al usuario ${userId}`);
                
                // Confirmar al admin
                await ctx.editMessageText(
                    `${ctx.callbackQuery.message.text}\n\n` +
                    `❌ Usuario rechazado y notificado`,
                    { reply_markup: { inline_keyboard: [] } }
                );
            } catch (error) {
                console.error(`Error notificando al usuario ${userId}:`, error);
                await ctx.editMessageText(
                    `${ctx.callbackQuery.message.text}\n\n` +
                    `❌ Usuario rechazado pero no se pudo notificar`,
                    { reply_markup: { inline_keyboard: [] } }
                );
            }
        } else {
            await ctx.reply("Error al rechazar el usuario.");
        }
    } catch (error) {
        console.error("Error en reject callback:", error);
        await ctx.reply("Error al procesar el rechazo.");
    }
} 