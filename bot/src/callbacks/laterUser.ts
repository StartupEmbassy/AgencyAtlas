import { MyContext } from "../types/session";
import { getUserByTelegramId } from "../services/supabase";

export async function handleLaterUser(ctx: MyContext) {
    try {
        if (!ctx.from || !ctx.callbackQuery?.message?.text) {
            await ctx.reply("Error: Datos incompletos");
            return;
        }

        await ctx.answerCallbackQuery("⏳ Decisión pospuesta");
        
        const admin = await getUserByTelegramId(ctx.from.id.toString());
        if (!admin || admin.role !== 'admin') {
            await ctx.reply("No tienes permisos para ejecutar esta acción.");
            return;
        }

        // Ocultar los botones pero mantener el mensaje
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + "\n\n⏳ Pendiente de revisión",
            { reply_markup: { inline_keyboard: [] } }
        );
    } catch (error) {
        console.error("Error en later callback:", error);
        await ctx.reply("Error al procesar la acción.");
    }
} 