import { MyContext } from "../types/session";
import { getUserByTelegramId, updateUserStatus } from "../services/supabase";

export async function handleApproveUser(ctx: MyContext) {
    try {
        if (!ctx.match || !ctx.from || !ctx.callbackQuery?.message?.text) {
            await ctx.reply("Error: Datos incompletos");
            return;
        }

        const userId = ctx.match[1];
        await ctx.answerCallbackQuery("✅ Usuario aprobado");

        const admin = await getUserByTelegramId(ctx.from.id.toString());
        if (!admin || admin.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar esta acción.");
            return;
        }

        const success = await updateUserStatus(userId, 'approved');
        if (success) {
            try {
                // Mensaje detallado para el usuario
                const userMessage = `✅ ¡Tu solicitud ha sido aprobada!\n\n` +
                    `Ahora puedes comenzar a usar el bot:\n` +
                    `1. Envía una foto de una inmobiliaria para registrarla\n` +
                    `2. Sigue las instrucciones paso a paso\n` +
                    `3. ¡Listo!\n\n` +
                    `Si tienes dudas, no dudes en contactar con un administrador.`;
                
                await ctx.api.sendMessage(parseInt(userId), userMessage);
                console.log(`Notificación enviada al usuario ${userId}`);
                
                // Confirmar al admin
                await ctx.editMessageText(
                    `${ctx.callbackQuery.message.text}\n\n` +
                    `✅ Usuario aprobado y notificado`,
                    { reply_markup: { inline_keyboard: [] } }
                );
            } catch (error) {
                console.error(`Error notificando al usuario ${userId}:`, error);
                await ctx.editMessageText(
                    `${ctx.callbackQuery.message.text}\n\n` +
                    `✅ Usuario aprobado pero no se pudo notificar`,
                    { reply_markup: { inline_keyboard: [] } }
                );
            }
        } else {
            await ctx.reply("Error al aprobar el usuario.");
        }
    } catch (error) {
        console.error("Error en approve callback:", error);
        await ctx.reply("Error al procesar la aprobación.");
    }
} 