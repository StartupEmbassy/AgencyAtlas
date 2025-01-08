import { MyContext } from "../types/session";
import { getUserByTelegramId, updateUserStatus } from "../services/supabase";

export async function handleApprove(ctx: MyContext) {
    try {
        const user = await getUserByTelegramId(ctx.from?.id.toString() || '');
        if (!user || user.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar este comando.");
            return;
        }

        if (!ctx.message?.text) {
            await ctx.reply("Comando inválido.");
            return;
        }

        const userId = ctx.message.text.split(' ')[1];
        if (!userId) {
            await ctx.reply("Por favor, proporciona el ID del usuario a aprobar.");
            return;
        }

        const success = await updateUserStatus(userId, 'approved');
        if (success) {
            await ctx.reply(`Usuario ${userId} aprobado correctamente.`);
            // Notificar al usuario
            await ctx.api.sendMessage(parseInt(userId), "¡Tu solicitud ha sido aprobada! Ya puedes comenzar a registrar inmobiliarias.");
        } else {
            await ctx.reply("Error al aprobar el usuario.");
        }
    } catch (error) {
        console.error("Error en comando approve:", error);
        await ctx.reply("Lo siento, ha ocurrido un error al procesar el comando.");
    }
} 