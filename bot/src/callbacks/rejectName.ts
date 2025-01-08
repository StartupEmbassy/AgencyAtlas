import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";

export async function handleRejectName(ctx: MyContext) {
    try {
        await ctx.answerCallbackQuery();
        ctx.session.registration.step = 'waiting_name';
        
        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");
        
        await ctx.reply("Por favor, envía el nombre correcto de la inmobiliaria.", {
            reply_markup: keyboard
        });
    } catch (error) {
        console.error("Error al rechazar nombre:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
} 